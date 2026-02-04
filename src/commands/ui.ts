/**
 * UI command handler - serves the web-based playground.
 */

import { exec, execSync } from "node:child_process";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import {
  type IncomingMessage,
  type ServerResponse,
  createServer,
} from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type * as pty from "node-pty";
import { WebSocket, WebSocketServer } from "ws";
import { findResultEvent, writeEvent } from "../events.js";
import {
  getAliveProcesses,
  scan as scanProcesses,
} from "../process-tracker.js";
import { isTmuxAvailable } from "../runtime.js";
import { cleanupPidFile, writePidFile } from "../server-manager.js";
import {
  scanAllSessions,
  scanAllSessionsWithProcesses,
} from "../session-scanner.js";
import { focusByPid, focusByTty } from "../terminal-focus.js";

type PtyModule = typeof import("node-pty");
type PtyProcess = pty.IPty;

// Tmux attachment tracking
interface TmuxAttachment {
  pty?: PtyProcess;
  ws: WebSocket;
  tmuxSession: string;
  windowIndex: number;
  // Fallback mode uses polling instead of pty
  fallbackMode?: boolean;
  pollInterval?: ReturnType<typeof setInterval>;
  lastContent?: string;
}

const tmuxAttachments = new Map<string, TmuxAttachment>();

// Track which attachId owns each session:window (for "last wins" behavior)
const tmuxOwnership = new Map<string, string>(); // "session:window" -> attachId

// Disconnect an existing tmux attachment
function disconnectTmuxAttachment(attachId: string, reason: string): void {
  const attachment = tmuxAttachments.get(attachId);
  if (!attachment) return;

  // Clear ownership
  const ownershipKey = `${attachment.tmuxSession}:${attachment.windowIndex}`;
  if (tmuxOwnership.get(ownershipKey) === attachId) {
    tmuxOwnership.delete(ownershipKey);
  }

  if (attachment.pollInterval) {
    clearInterval(attachment.pollInterval);
  }
  if (attachment.pty) {
    attachment.pty.kill();
  }

  // Notify the client they've been disconnected
  if (attachment.ws.readyState === WebSocket.OPEN) {
    attachment.ws.send(
      JSON.stringify({
        type: "tmux-detached",
        attachId,
        reason,
      })
    );
  }

  tmuxAttachments.delete(attachId);
  console.log(`[tmux] Disconnected ${attachId}: ${reason}`);
}

// Capture pane content using tmux command
function captureTmuxPane(tmuxSession: string, windowIndex: number): string {
  try {
    const output = execSync(
      `tmux capture-pane -t "${tmuxSession}:${windowIndex}" -p -e`,
      {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        maxBuffer: 1024 * 1024,
      }
    );
    return output;
  } catch {
    return "";
  }
}

// Send keys to tmux pane
function sendTmuxKeys(
  tmuxSession: string,
  windowIndex: number,
  keys: string
): void {
  try {
    // Use -l for literal text (handles special characters properly)
    // For control characters like Enter, we need to handle them specially
    if (keys === "\r" || keys === "\n") {
      execSync(`tmux send-keys -t "${tmuxSession}:${windowIndex}" Enter`, {
        stdio: ["pipe", "pipe", "pipe"],
      });
    } else if (keys === "\x03") {
      // Ctrl+C
      execSync(`tmux send-keys -t "${tmuxSession}:${windowIndex}" C-c`, {
        stdio: ["pipe", "pipe", "pipe"],
      });
    } else if (keys === "\x04") {
      // Ctrl+D
      execSync(`tmux send-keys -t "${tmuxSession}:${windowIndex}" C-d`, {
        stdio: ["pipe", "pipe", "pipe"],
      });
    } else if (keys === "\x1b") {
      // Escape
      execSync(`tmux send-keys -t "${tmuxSession}:${windowIndex}" Escape`, {
        stdio: ["pipe", "pipe", "pipe"],
      });
    } else {
      // For regular text, use -l for literal mode
      // Escape single quotes in the input
      const escaped = keys.replace(/'/g, "'\\''");
      execSync(
        `tmux send-keys -t "${tmuxSession}:${windowIndex}" -l '${escaped}'`,
        {
          stdio: ["pipe", "pipe", "pipe"],
        }
      );
    }
  } catch {
    // Ignore send errors
  }
}
let ptyModule: PtyModule | null = null;

async function loadPtyModule(): Promise<PtyModule | null> {
  if (ptyModule) return ptyModule;
  try {
    ptyModule = await import("node-pty");
    return ptyModule;
  } catch {
    return null;
  }
}

const DEFAULT_PORT = 3847;
const POLL_INTERVAL = 500; // 500ms polling for file changes
const MAX_COMMAND_BUFFER = 10 * 1024 * 1024; // 10MB

// Layout data stored per-project in .awb/layout.json
interface LayoutData {
  nodes: Record<string, { x: number; y: number }>;
  viewport?: { x: number; y: number; zoom: number };
}

/**
 * Write layout data for a project to its .awb/layout.json file.
 */
async function writeProjectLayout(
  projectDir: string,
  layout: LayoutData
): Promise<void> {
  try {
    const awbDir = path.join(projectDir, ".awb");
    await fsp.mkdir(awbDir, { recursive: true });
    const layoutPath = path.join(awbDir, "layout.json");
    await fsp.writeFile(layoutPath, JSON.stringify(layout, null, 2));
  } catch (err) {
    console.error(`[Layout] Failed to write layout for ${projectDir}:`, err);
  }
}

function splitPathList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(new RegExp(`[${path.delimiter},]`))
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizePath(inputPath: string): string {
  const expanded = inputPath.startsWith("~")
    ? path.join(os.homedir(), inputPath.slice(1))
    : inputPath;
  return path.resolve(expanded);
}

function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: Set<string>
): boolean {
  if (!origin) return true; // Non-browser clients
  return allowedOrigins.has(origin);
}

async function loadIdleMarkerRoots(): Promise<string[]> {
  const roots: string[] = [];
  const markersDir = path.join(os.homedir(), ".awb", "markers", "idle");
  try {
    const entries = await fsp.readdir(markersDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const markerPath = path.join(markersDir, entry.name);
      try {
        const raw = await fsp.readFile(markerPath, "utf-8");
        const parsed = JSON.parse(raw) as { cwd?: string };
        if (parsed.cwd) {
          roots.push(parsed.cwd);
        }
      } catch {
        // Ignore malformed markers
      }
    }
  } catch {
    // No markers directory
  }
  return roots;
}

async function getAllowedRoots(): Promise<string[]> {
  const roots = new Set<string>();
  roots.add(process.cwd());
  roots.add(path.join(os.homedir(), ".awb"));
  roots.add(path.join(os.homedir(), ".claude"));

  for (const entry of splitPathList(process.env.AWB_ALLOWED_PATHS)) {
    roots.add(entry);
  }

  for (const entry of await loadIdleMarkerRoots()) {
    roots.add(entry);
  }

  return Array.from(roots).map((root) => normalizePath(root));
}

function isPathAllowed(candidatePath: string, roots: string[]): boolean {
  return roots.some((root) => {
    const rel = path.relative(root, candidatePath);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  });
}

async function resolveAllowedPath(
  rawPath: string,
  options: {
    requireFile?: boolean;
    requireDirectory?: boolean;
    allowMissing?: boolean;
  } = {}
): Promise<{ ok: boolean; resolved?: string; error?: string }> {
  const resolved = normalizePath(rawPath);
  const roots = await getAllowedRoots();
  if (!isPathAllowed(resolved, roots)) {
    return { ok: false, error: "Access denied for path" };
  }

  if (!options.allowMissing) {
    try {
      const stat = await fsp.stat(resolved);
      if (options.requireFile && !stat.isFile()) {
        return { ok: false, error: "Path is not a file" };
      }
      if (options.requireDirectory && !stat.isDirectory()) {
        return { ok: false, error: "Path is not a directory" };
      }
    } catch {
      return { ok: false, error: "Path does not exist" };
    }
  }

  return { ok: true, resolved };
}

function execCommand(command: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, { cwd, maxBuffer: MAX_COMMAND_BUFFER }, (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(stdout);
    });
  });
}

/**
 * Get MIME type for file extension.
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

/**
 * Serve static files from ui/dist.
 */
async function serveStatic(
  staticDir: string,
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const url = new URL(req.url || "/", "http://localhost");
  let pathname = url.pathname || "/";
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad Request");
    return true;
  }

  // Default to index.html
  const requestedPath =
    pathname === "/" || pathname === "" ? "/index.html" : pathname;

  // Resolve and prevent path traversal
  let filePath = path.resolve(staticDir, `.${requestedPath}`);
  let relative = path.relative(staticDir, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return true;
  }

  try {
    const stat = await fsp.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, "index.html");
      relative = path.relative(staticDir, filePath);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Forbidden");
        return true;
      }
    }

    const content = await fsp.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": getMimeType(filePath),
      "Content-Length": content.length,
    });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

/**
 * API context passed to handlers.
 */
interface ApiContext {
  broadcast: (message: object) => void;
  getClientCount: () => number;
  isWsReady: () => boolean;
  openBrowserFn: () => void;
  allowedOrigins: Set<string>;
}

/**
 * Handle API requests.
 */
async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ApiContext
): Promise<boolean> {
  const url = new URL(req.url || "/", "http://localhost");
  const pathname = url.pathname;

  // CORS headers
  const origin = req.headers.origin;
  const originAllowed = isOriginAllowed(origin, ctx.allowedOrigins);
  if (origin && originAllowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else if (!origin) {
    // Non-browser request (no Origin header)
    res.setHeader("Access-Control-Allow-Origin", "null");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "null");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight
  if (req.method === "OPTIONS") {
    if (!originAllowed) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Origin not allowed" }));
      return true;
    }
    res.writeHead(204);
    res.end();
    return true;
  }

  if (!originAllowed) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Origin not allowed" }));
    return true;
  }

  // GET /api/interactions - Get all pending interactions
  if (pathname === "/api/interactions" && req.method === "GET") {
    try {
      const projects = await scanAllSessions();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ projects }));
      return true;
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
      return true;
    }
  }

  // POST /api/respond - Respond to an interaction
  if (pathname === "/api/respond" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const data = JSON.parse(body);
      const { sessionName, interactionId, response } = data;

      if (!sessionName || !interactionId || !response) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing required fields" }));
        return true;
      }

      // Write result event
      writeEvent(sessionName, {
        type: "result",
        id: interactionId,
        action: response.action || "accept",
        answers: response.answers,
        result: response.result,
        feedback: response.feedback,
      });

      // Broadcast update
      const projects = await scanAllSessions();
      ctx.broadcast({ type: "update", projects });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
      return true;
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
      return true;
    }
  }

  // POST /api/message - Send message to agent
  if (pathname === "/api/message" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const data = JSON.parse(body);
      const { sessionName, text, agentSessionId } = data;

      if (!sessionName || !text) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing required fields" }));
        return true;
      }

      const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Write message event
      writeEvent(sessionName, {
        type: "created",
        id,
        component: "message",
        title: "User Message",
        args: { text },
        agentSessionId,
      });

      // Broadcast update
      const projects = await scanAllSessions();
      ctx.broadcast({ type: "update", projects });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, id }));
      return true;
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
      return true;
    }
  }

  // POST /api/focus - Focus on a specific interaction (used by external apps)
  if (pathname === "/api/focus" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const data = JSON.parse(body);
      const { interactionId, projectName } = data;

      if (!interactionId || !projectName) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ error: "Missing interactionId or projectName" })
        );
        return true;
      }

      // Broadcast focus message to all playground clients
      ctx.broadcast({ type: "focus", interactionId, projectName });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
      return true;
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
      return true;
    }
  }

  // GET /api/git-diff - Get git diff for the current project
  if (pathname === "/api/git-diff" && req.method === "GET") {
    try {
      // Get project path from query params or use cwd
      const projectPath = url.searchParams.get("project") || process.cwd();
      const projectCheck = await resolveAllowedPath(projectPath, {
        requireDirectory: true,
      });
      if (!projectCheck.ok || !projectCheck.resolved) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ error: projectCheck.error || "Access denied" })
        );
        return true;
      }

      // Get git diff (both staged and unstaged)
      let diff = "";
      let files: Array<{
        fileName: string;
        hunks: string[];
        fullDiff: string;
        additions: number;
        deletions: number;
      }> = [];

      try {
        // Try to get combined diff (staged + unstaged)
        const [stagedDiff, unstagedDiff] = await Promise.all([
          execCommand("git diff --cached", projectCheck.resolved),
          execCommand("git diff", projectCheck.resolved),
        ]);

        diff = stagedDiff + unstagedDiff;

        // Parse the diff into files
        if (diff) {
          const fileDiffs = diff.split(/^diff --git /m).filter(Boolean);
          files = fileDiffs.map((fileDiff) => {
            const lines = fileDiff.split("\n");
            const fileMatch = lines[0]?.match(/a\/(.+) b\/(.+)/);
            const fileName = fileMatch ? fileMatch[2] : "unknown";

            // Keep the full diff for this file (including diff --git header)
            const fullDiff = `diff --git ${fileDiff}`;

            // Extract hunks - each hunk starts with @@
            const hunkMatches = fullDiff.match(/@@[\s\S]*?(?=@@|$)/g) || [];
            const hunks = hunkMatches.map((h) => h.trim());

            // Count additions and deletions
            const diffLines = fullDiff.split("\n");
            let additions = 0;
            let deletions = 0;
            for (const line of diffLines) {
              if (line.startsWith("+") && !line.startsWith("+++")) additions++;
              if (line.startsWith("-") && !line.startsWith("---")) deletions++;
            }

            return { fileName, hunks, fullDiff, additions, deletions };
          });
        }
      } catch {
        // Not a git repo or no changes
        diff = "";
        files = [];
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ diff, files }));
      return true;
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
      return true;
    }
  }

  // GET /api/health - Health check endpoint for server-manager
  if (pathname === "/api/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        clients: ctx.getClientCount(),
        wsReady: ctx.isWsReady(),
        pid: process.pid,
      })
    );
    return true;
  }

  // POST /api/open-browser - Open browser if no clients connected
  if (pathname === "/api/open-browser" && req.method === "POST") {
    ctx.openBrowserFn();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true }));
    return true;
  }

  // GET /api/processes - Get all running agent processes
  if (pathname === "/api/processes" && req.method === "GET") {
    try {
      // Refresh process list
      scanProcesses();
      const processes = getAliveProcesses();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ processes }));
      return true;
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
      return true;
    }
  }

  // POST /api/focus-terminal - Focus terminal for a process
  if (pathname === "/api/focus-terminal" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const data = JSON.parse(body);
      const { pid, tty } = data;

      let result: ReturnType<typeof focusByPid> | null = null;
      if (pid) {
        result = focusByPid(pid);
      } else if (tty) {
        result = focusByTty(tty);
      } else {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Missing pid or tty" }));
        return true;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
      return true;
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err) }));
      return true;
    }
  }

  return false;
}

/**
 * Read request body.
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/**
 * Open URL in default browser (cross-platform).
 */
function openBrowser(url: string): void {
  const platform = os.platform();
  let command: string;

  if (platform === "darwin") {
    command = `open "${url}"`;
  } else if (platform === "win32") {
    command = `start "" "${url}"`;
  } else {
    // Linux and others
    command = `xdg-open "${url}"`;
  }

  exec(command, (err) => {
    if (err) {
      console.error(`Failed to open browser: ${err.message}`);
    }
  });
}

export async function handleUI(args: string[]): Promise<void> {
  // Custom ports are intentionally unsupported to avoid UI/WS drift.
  if (args.some((arg) => arg === "--port" || arg.startsWith("--port="))) {
    console.error("Error: Custom ports are not supported.");
    console.error(
      `Agent Workbench UI always runs on http://localhost:${DEFAULT_PORT}`
    );
    process.exit(1);
  }

  const port = DEFAULT_PORT;

  // Parse --open flag
  const shouldOpen = args.includes("--open");

  // Find static files directory
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  // Try multiple paths to find the built UI
  const possiblePaths = [
    // Development/production: relative to src/commands or dist/commands
    path.join(__dirname, "..", "..", "ui", "dist"),
  ];

  let staticDir: string | null = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(path.join(p, "index.html"))) {
      staticDir = p;
      break;
    }
  }

  if (!staticDir) {
    console.error("Error: UI not built. Run:");
    console.error("  npm run build:ui");
    process.exit(1);
  }

  // WebSocket clients
  const clients = new Set<WebSocket>();

  // Track WebSocket server ready state
  let wsReady = false;

  // Broadcast message to all clients
  const broadcast = (message: object) => {
    const data = JSON.stringify(message);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  };

  // Server URL for browser opening
  const serverUrl = `http://localhost:${port}`;
  // Allow connections from any localhost port (for docs server, dev servers, etc.)
  const allowedOrigins = new Set([
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
  ]);
  // Also allow common dev ports for docs/landing page
  for (const devPort of [8005, 8006, 3000, 5173, 4321]) {
    allowedOrigins.add(`http://localhost:${devPort}`);
    allowedOrigins.add(`http://127.0.0.1:${devPort}`);
  }

  // API context
  const apiContext: ApiContext = {
    broadcast,
    getClientCount: () => clients.size,
    isWsReady: () => wsReady,
    openBrowserFn: () => openBrowser(serverUrl),
    allowedOrigins,
  };

  // Create HTTP server
  const server = createServer(async (req, res) => {
    // Try API first
    if (req.url?.startsWith("/api/")) {
      const handled = await handleApi(req, res, apiContext);
      if (handled) return;
    }

    // Serve static files
    const served = staticDir ? await serveStatic(staticDir, req, res) : false;
    if (served) return;

    // 404
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  });

  // Create WebSocket server
  const wss = new WebSocketServer({
    server,
    path: "/ws",
    verifyClient: (info, done) => {
      const origin = info.origin;
      if (!isOriginAllowed(origin, allowedOrigins)) {
        done(false, 403, "Origin not allowed");
        return;
      }
      done(true);
    },
  });

  wss.on("connection", async (ws) => {
    clients.add(ws);
    console.log("[WebSocket] Client connected");

    // Send initial state
    try {
      const projects = await scanAllSessions();
      ws.send(JSON.stringify({ type: "update", projects }));
    } catch (err) {
      console.error("[WebSocket] Failed to send initial state:", err);
    }

    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === "respond") {
          const { interactionId, sessionName, response } = message;
          const action = response.action || "accept";

          // Deduplicate: skip dismiss if an accept result already exists
          if (action === "dismiss") {
            const existingResult = findResultEvent(sessionName, interactionId);
            if (existingResult && existingResult.action === "accept") {
              // Already have an accept response, skip dismiss
              return;
            }
          }

          writeEvent(sessionName, {
            type: "result",
            id: interactionId,
            action,
            answers: response.answers,
            result: response.result,
            feedback: response.feedback,
          });

          // Broadcast update
          const projects = await scanAllSessions();
          broadcast({ type: "update", projects });
        } else if (message.type === "message") {
          const { sessionName, text, agentSessionId } = message;
          const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

          writeEvent(sessionName, {
            type: "created",
            id,
            component: "message",
            title: "User Message",
            args: { text },
            agentSessionId,
          });

          // Broadcast update
          const projects = await scanAllSessions();
          broadcast({ type: "update", projects });
        } else if (message.type === "read-file") {
          // Read file content
          const { path: filePath } = message;
          try {
            const pathCheck = await resolveAllowedPath(filePath, {
              requireFile: true,
            });
            if (!pathCheck.ok || !pathCheck.resolved) {
              ws.send(
                JSON.stringify({
                  type: "file-content",
                  path: filePath,
                  content: "",
                  error: pathCheck.error || "Access denied",
                })
              );
              return;
            }

            const content = await fsp.readFile(pathCheck.resolved, "utf-8");
            ws.send(
              JSON.stringify({
                type: "file-content",
                path: filePath,
                content,
              })
            );
          } catch (err) {
            ws.send(
              JSON.stringify({
                type: "file-content",
                path: filePath,
                content: "",
                error:
                  err instanceof Error ? err.message : "Failed to read file",
              })
            );
          }
        } else if (message.type === "write-file") {
          // Write file content
          const { path: filePath, content } = message;
          try {
            const pathCheck = await resolveAllowedPath(filePath, {
              allowMissing: true,
            });
            if (!pathCheck.ok || !pathCheck.resolved) {
              ws.send(
                JSON.stringify({
                  type: "file-saved",
                  path: filePath,
                  success: false,
                  error: pathCheck.error || "Access denied",
                })
              );
              return;
            }

            try {
              const stat = await fsp.stat(pathCheck.resolved);
              if (stat.isDirectory()) {
                ws.send(
                  JSON.stringify({
                    type: "file-saved",
                    path: filePath,
                    success: false,
                    error: "Path is a directory",
                  })
                );
                return;
              }
            } catch {
              // Missing file is ok for writes
            }

            await fsp.writeFile(pathCheck.resolved, content, "utf-8");
            ws.send(
              JSON.stringify({
                type: "file-saved",
                path: filePath,
                success: true,
              })
            );
          } catch (err) {
            ws.send(
              JSON.stringify({
                type: "file-saved",
                path: filePath,
                success: false,
                error:
                  err instanceof Error ? err.message : "Failed to write file",
              })
            );
          }
        } else if (message.type === "save-layout") {
          // Save layout data for a project
          const { project, layout } = message;
          if (project && layout) {
            await writeProjectLayout(project, layout as LayoutData);
          }
        } else if (message.type === "open-in-editor") {
          // Open file in external editor (VS Code)
          const { path: filePath, line } = message;
          try {
            const pathCheck = await resolveAllowedPath(filePath, {
              requireFile: true,
            });
            if (!pathCheck.ok || !pathCheck.resolved) {
              ws.send(
                JSON.stringify({
                  type: "editor-opened",
                  path: filePath,
                  success: false,
                  error: pathCheck.error || "Access denied",
                })
              );
              return;
            }

            // Use VS Code by default, with optional line number
            const { spawn } = await import("node:child_process");
            const args = line
              ? ["-g", `${pathCheck.resolved}:${line}`]
              : [pathCheck.resolved];
            spawn("code", args, {
              detached: true,
              stdio: "ignore",
            }).unref();

            ws.send(
              JSON.stringify({
                type: "editor-opened",
                path: filePath,
                success: true,
              })
            );
          } catch (err) {
            ws.send(
              JSON.stringify({
                type: "editor-opened",
                path: filePath,
                success: false,
                error:
                  err instanceof Error ? err.message : "Failed to open editor",
              })
            );
          }
        } else if (message.type === "focus-terminal") {
          // Focus terminal for a process
          const { pid, tty } = message;
          let result: ReturnType<typeof focusByPid> | null = null;
          if (pid) {
            result = focusByPid(pid);
          } else if (tty) {
            result = focusByTty(tty);
          } else {
            result = { success: false, error: "Missing pid or tty" };
          }
          ws.send(
            JSON.stringify({
              type: "focus-terminal-result",
              ...result,
            })
          );
        } else if (message.type === "tmux-attach") {
          // Attach to a tmux window
          const { attachId, tmuxSession, windowIndex, cols, rows } = message;

          if (!isTmuxAvailable()) {
            ws.send(
              JSON.stringify({
                type: "tmux-error",
                attachId,
                error: "tmux is not available",
              })
            );
            return;
          }

          // "Last wins" - disconnect any existing attachment to this session:window
          const ownershipKey = `${tmuxSession}:${windowIndex}`;
          const existingAttachId = tmuxOwnership.get(ownershipKey);
          if (existingAttachId && existingAttachId !== attachId) {
            disconnectTmuxAttachment(
              existingAttachId,
              "replaced by new client"
            );
          }
          tmuxOwnership.set(ownershipKey, attachId);

          // Try node-pty first, fall back to polling if it fails
          const pty = await loadPtyModule();
          let useFallback = !pty;
          let ptyProcess: PtyProcess | undefined;

          if (pty) {
            try {
              // Attach to specific window
              ptyProcess = pty.spawn(
                "tmux",
                ["attach-session", "-t", `${tmuxSession}:${windowIndex}`],
                {
                  name: "xterm-256color",
                  cols: cols || 80,
                  rows: rows || 24,
                  cwd: process.cwd(),
                  env: {
                    ...(process.env as { [key: string]: string }),
                    TERM: "xterm-256color",
                  },
                }
              );

              // Track this attachment
              tmuxAttachments.set(attachId, {
                pty: ptyProcess,
                ws,
                tmuxSession,
                windowIndex,
              });

              // Stream output to client
              ptyProcess.onData((data: string) => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(
                    JSON.stringify({
                      type: "tmux-output",
                      attachId,
                      data,
                    })
                  );
                }
              });

              // Handle exit
              ptyProcess.onExit(() => {
                tmuxAttachments.delete(attachId);
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(
                    JSON.stringify({
                      type: "tmux-detached",
                      attachId,
                    })
                  );
                }
              });

              console.log(
                `[tmux] Attached to ${tmuxSession}:${windowIndex} (pty mode)`
              );
            } catch (err) {
              // node-pty spawn failed (e.g., posix_spawnp error on Node v25+)
              console.log(
                `[tmux] pty spawn failed: ${err instanceof Error ? err.message : err}, using fallback`
              );
              useFallback = true;
            }
          }

          // Fallback: use capture-pane polling
          if (useFallback) {
            console.log(
              `[tmux] Using capture-pane fallback for ${tmuxSession}:${windowIndex}`
            );

            // Notify client we're in fallback mode
            ws.send(
              JSON.stringify({
                type: "tmux-fallback",
                attachId,
              })
            );

            // Get initial content
            const initialContent = captureTmuxPane(tmuxSession, windowIndex);
            if (initialContent) {
              ws.send(
                JSON.stringify({
                  type: "tmux-output",
                  attachId,
                  data: initialContent,
                  fullRefresh: true, // Signal to clear and replace content
                })
              );
            }

            // Set up polling interval
            const pollInterval = setInterval(() => {
              if (ws.readyState !== WebSocket.OPEN) {
                clearInterval(pollInterval);
                tmuxAttachments.delete(attachId);
                return;
              }

              const attachment = tmuxAttachments.get(attachId);
              if (!attachment) {
                clearInterval(pollInterval);
                return;
              }

              const content = captureTmuxPane(tmuxSession, windowIndex);
              if (content !== attachment.lastContent) {
                attachment.lastContent = content;
                ws.send(
                  JSON.stringify({
                    type: "tmux-output",
                    attachId,
                    data: content,
                    fullRefresh: true,
                  })
                );
              }
            }, 200); // Poll every 200ms

            tmuxAttachments.set(attachId, {
              ws,
              tmuxSession,
              windowIndex,
              fallbackMode: true,
              pollInterval,
              lastContent: initialContent,
            });

            console.log(
              `[tmux] Fallback attached to ${tmuxSession}:${windowIndex}`
            );
          }
        } else if (message.type === "tmux-input") {
          // Send input to tmux pane
          const { attachId, data } = message;
          const attachment = tmuxAttachments.get(attachId);
          if (attachment) {
            if (attachment.fallbackMode) {
              // In fallback mode, use send-keys
              sendTmuxKeys(
                attachment.tmuxSession,
                attachment.windowIndex,
                data
              );
            } else if (attachment.pty) {
              attachment.pty.write(data);
            }
          }
        } else if (message.type === "tmux-resize") {
          // Resize tmux pane
          const { attachId, cols, rows } = message;
          const attachment = tmuxAttachments.get(attachId);
          if (attachment && cols && rows && attachment.pty) {
            // Resize only works in pty mode
            attachment.pty.resize(cols, rows);
          }
          // In fallback mode, resize is ignored (tmux pane has its own size)
        } else if (message.type === "tmux-detach") {
          // Detach from tmux
          const { attachId } = message;
          const attachment = tmuxAttachments.get(attachId);
          if (attachment) {
            // Clear ownership
            const ownershipKey = `${attachment.tmuxSession}:${attachment.windowIndex}`;
            if (tmuxOwnership.get(ownershipKey) === attachId) {
              tmuxOwnership.delete(ownershipKey);
            }
            if (attachment.pollInterval) {
              clearInterval(attachment.pollInterval);
            }
            if (attachment.pty) {
              attachment.pty.kill();
            }
            tmuxAttachments.delete(attachId);
            console.log(`[tmux] Detached ${attachId}`);
          }
        }
      } catch (err) {
        console.error("[WebSocket] Failed to handle message:", err);
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
      // Clean up any tmux attachments for this client
      for (const [attachId, attachment] of tmuxAttachments) {
        if (attachment.ws === ws) {
          // Clear ownership
          const ownershipKey = `${attachment.tmuxSession}:${attachment.windowIndex}`;
          if (tmuxOwnership.get(ownershipKey) === attachId) {
            tmuxOwnership.delete(ownershipKey);
          }
          if (attachment.pollInterval) {
            clearInterval(attachment.pollInterval);
          }
          if (attachment.pty) {
            attachment.pty.kill();
          }
          tmuxAttachments.delete(attachId);
          console.log(
            `[tmux] Cleaned up attachment ${attachId} on client disconnect`
          );
        }
      }
      console.log("[WebSocket] Client disconnected");
    });
  });

  // Polling for file changes, tmux windows, and agent processes
  let lastState = "";
  const pollInterval = setInterval(async () => {
    try {
      const projects = await scanAllSessionsWithProcesses();
      const state = JSON.stringify(projects);

      if (state !== lastState) {
        lastState = state;
        broadcast({ type: "update", projects });
      }
    } catch (_err) {
      // Ignore polling errors
    }
  }, POLL_INTERVAL);

  // Handle shutdown
  const shutdown = () => {
    console.log("\nShutting down...");
    clearInterval(pollInterval);
    cleanupPidFile();
    wss.close();
    server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("exit", cleanupPidFile);

  // Start server
  server.listen(port, "127.0.0.1", () => {
    // Mark WebSocket as ready and write PID file
    wsReady = true;
    writePidFile();

    const url = `http://localhost:${port}`;
    console.log(`
Agent Workbench Playground
=================

  Local:   ${url}

  ${shouldOpen ? "Opening in browser..." : "Open in browser to view interactions."}
  Press Ctrl+C to stop.
`);

    // Auto-open browser if --open flag was provided
    if (shouldOpen) {
      openBrowser(url);
    }
  });
}
