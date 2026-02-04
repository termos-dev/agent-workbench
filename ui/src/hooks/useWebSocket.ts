import { useCallback, useEffect, useRef, useState } from "react";

export interface Interaction {
  id: string;
  component: string;
  title?: string;
  prompt?: string;
  options?: Array<{ label: string; value: string }>;
  args?: Record<string, unknown>;
  ts: number;
  agentSessionId?: string;
  project?: string;
}

export interface TmuxWindow {
  index: number;
  name: string;
  command: string;
  active: number;
  tmuxSession: string;
}

export interface TrackedProcess {
  agent: string;
  pid: number;
  ppid: number;
  tty: string;
  command: string;
  projectPath: string | null;
  project: string | null;
  sessionName: string | null;
  title: string | null;
  detectedAt: number;
  lastSeen: number;
  alive: boolean;
}

export interface ProjectInteractions {
  project: string;
  sessionName: string;
  interactions: Interaction[];
  tmuxWindows?: TmuxWindow[];
  tmuxSession?: string;
  processes?: TrackedProcess[];
}

interface WebSocketMessage {
  type:
    | "update"
    | "connected"
    | "error"
    | "file-content"
    | "file-saved"
    | "focus"
    | "focus-terminal-result"
    | "tmux-output"
    | "tmux-fallback"
    | "tmux-detached"
    | "tmux-error";
  projects?: ProjectInteractions[];
  message?: string;
  interactionId?: string;
  projectName?: string;
  success?: boolean;
  terminal?: string;
}

interface UseWebSocketOptions {
  demoMode?: boolean;
  onUpdate?: (projects: ProjectInteractions[]) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onFocus?: (interactionId: string, projectName: string) => void;
}

interface UseWebSocketResult {
  projects: ProjectInteractions[];
  connected: boolean;
  connecting: boolean; // True during initial connection attempt (before first connect/fail)
  retryIn: number; // Seconds until next retry (0 if connected)
  respond: (
    interactionId: string,
    sessionName: string,
    response: unknown
  ) => void;
  sendMessage: (message: unknown) => void;
  sendTextMessage: (sessionName: string, text: string) => void;
}

const WS_URL = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;
const RECONNECT_DELAY = 2000;
const MAX_RECONNECT_DELAY = 30000;

// Demo mode mock data - two agents sharing the workbench
const DEMO_PROJECTS: ProjectInteractions[] = [
  {
    project: "frontend-app",
    sessionName: "Agent A - Frontend",
    interactions: [
      {
        id: "demo-code-1",
        component: "code",
        title: "App.tsx",
        args: {
          code: `import { Dashboard } from './components/Dashboard';
import { useAuth } from './hooks/useAuth';

export function App() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <Spinner />;
  return <Dashboard user={user} />;
}`,
          language: "tsx",
          file: "src/App.tsx",
        },
        ts: Date.now(),
      },
      {
        id: "demo-markdown-1",
        component: "markdown",
        title: "README.md",
        args: {
          content: `# Frontend App

A modern React application with TypeScript.

## Features
- Authentication with JWT
- Real-time dashboard
- Tailwind CSS styling

## Getting Started
\`\`\`bash
npm install
npm run dev
\`\`\``,
        },
        ts: Date.now(),
      },
      {
        id: "demo-confirm-1",
        component: "confirm",
        title: "Deploy to Staging",
        prompt: "Build passed. Deploy frontend v1.2.0 to staging?",
        ts: Date.now(),
      },
      {
        id: "demo-mermaid-1",
        component: "mermaid",
        title: "Auth Flow",
        args: {
          code: `sequenceDiagram
  participant User
  participant UI
  participant API
  participant DB

  User->>UI: Sign in
  UI->>API: POST /auth/login
  API->>DB: Validate credentials
  DB-->>API: User record
  API-->>UI: JWT + profile
  UI-->>User: Dashboard`,
        },
        ts: Date.now(),
      },
      {
        id: "demo-html-1",
        component: "html",
        title: "Release Status",
        args: {
          content: `<!doctype html>
<html>
  <head>
    <style>
      body { font-family: ui-sans-serif, system-ui; background:#0f172a; color:#e2e8f0; margin:0; }
      .wrap { padding:16px; display:grid; gap:12px; }
      .card { border:1px solid rgba(148,163,184,0.2); background:rgba(15,23,42,0.6); border-radius:12px; padding:12px; }
      .badge { display:inline-flex; align-items:center; gap:6px; padding:2px 8px; border-radius:999px; font-size:12px; background:#0ea5e9; color:#041019; }
      .row { display:flex; justify-content:space-between; font-size:13px; color:#cbd5f5; }
      .bar { height:6px; background:#1e293b; border-radius:999px; overflow:hidden; }
      .bar > span { display:block; height:100%; width:72%; background:linear-gradient(90deg,#22d3ee,#38bdf8); }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <div class="badge">Release v1.2.0</div>
        <div class="row"><span>Tests</span><span>72%</span></div>
        <div class="bar"><span></span></div>
      </div>
      <div class="card">
        <div class="row"><span>Build</span><span>Passing</span></div>
        <div class="row"><span>Deploy Window</span><span>19:00 - 21:00</span></div>
      </div>
    </div>
  </body>
</html>`,
        },
        ts: Date.now(),
      },
      {
        id: "demo-checklist-1",
        component: "checklist",
        title: "Release Checklist",
        prompt: "Confirm the release gates before shipping.",
        options: [
          { label: "Changelog updated", value: "changelog" },
          { label: "Smoke tests passed", value: "smoke" },
          { label: "Rollback plan ready", value: "rollback" },
        ],
        ts: Date.now(),
      },
    ],
  },
  {
    project: "backend-api",
    sessionName: "Agent B - Backend",
    interactions: [
      {
        id: "demo-output-1",
        component: "code",
        title: "Background Service Logs",
        args: {
          code: `$ npm run worker

> backend-api@2.0.0 worker
> node dist/workers/queue.js

[12:45:23] Queue worker online
[12:45:24] Connected to Redis
[12:45:25] Job 38f2 processed in 412ms
[12:45:26] Job 38f3 processed in 98ms
[12:45:27] Heartbeat OK (latency 42ms)`,
          language: "bash",
        },
        ts: Date.now(),
      },
      {
        id: "demo-scratchpad-1",
        component: "scratchpad",
        title: "Scratchpad",
        args: {
          initialContent: `# Scratchpad

## Current Tasks
- [x] Add authentication middleware
- [x] Set up database connection
- [ ] Review PR #42
- [ ] Deploy to staging

## Notes
- Consider using Redis for session caching
- Add rate limiting to API endpoints`,
        },
        ts: Date.now(),
      },
      {
        id: "demo-progress-1",
        component: "progress",
        title: "Running Tests",
        args: {
          steps: ["Install", "Lint", "Test", "Build"],
          currentStep: 2,
          percent: 75,
        },
        ts: Date.now(),
      },
    ],
  },
];

// Enable demo mode when: ?demo param present, or embedded in iframe (landing page)
const defaultDemoMode =
  typeof window !== "undefined" &&
  (new URLSearchParams(window.location.search).has("demo") ||
    window.self !== window.top);

export function useWebSocket(
  options: UseWebSocketOptions = {}
): UseWebSocketResult {
  const { demoMode, onUpdate, onConnect, onDisconnect, onFocus } = options;
  const isDemoMode = demoMode ?? defaultDemoMode;

  // Always declare state - required for React hooks rules
  const [projects, setProjects] = useState<ProjectInteractions[]>(
    isDemoMode ? DEMO_PROJECTS : []
  );
  const [connected, setConnected] = useState(!!isDemoMode);
  const [connecting, setConnecting] = useState(!isDemoMode);
  const [retryIn, setRetryIn] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const reconnectDelayRef = useRef(RECONNECT_DELAY);

  // Use refs for callbacks to avoid reconnection loops
  const onUpdateRef = useRef(onUpdate);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onFocusRef = useRef(onFocus);

  // Keep refs in sync
  useEffect(() => {
    onUpdateRef.current = onUpdate;
    onConnectRef.current = onConnect;
    onDisconnectRef.current = onDisconnect;
    onFocusRef.current = onFocus;
  }, [onUpdate, onConnect, onDisconnect, onFocus]);

  // Demo mode: populate data and mark connected without WebSocket.
  useEffect(() => {
    if (!isDemoMode) {
      return;
    }

    setProjects(DEMO_PROJECTS);
    setConnected(true);
    setConnecting(false);
    setRetryIn(0);
    onUpdateRef.current?.(DEMO_PROJECTS);
    onConnectRef.current?.();
  }, []);

  const connect = useCallback(() => {
    if (isDemoMode) {
      return;
    }

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[WebSocket] Connected");
        setConnected(true);
        setConnecting(false);
        setRetryIn(0);
        // Clear countdown interval
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        reconnectDelayRef.current = RECONNECT_DELAY; // Reset delay on successful connection
        onConnectRef.current?.();
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;

          if (message.type === "update" && message.projects) {
            setProjects(message.projects);
            onUpdateRef.current?.(message.projects);
          } else if (message.type === "connected") {
            console.log("[WebSocket] Server acknowledged connection");
          } else if (message.type === "error") {
            console.error("[WebSocket] Server error:", message.message);
          } else if (
            message.type === "file-content" ||
            message.type === "file-saved" ||
            message.type === "tmux-output" ||
            message.type === "tmux-fallback" ||
            message.type === "tmux-detached" ||
            message.type === "tmux-error"
          ) {
            // Forward file and tmux messages to the window for components to receive
            window.postMessage(event.data, "*");
          } else if (
            message.type === "focus" &&
            message.interactionId &&
            message.projectName
          ) {
            onFocusRef.current?.(message.interactionId, message.projectName);
          }
        } catch (err) {
          console.error("[WebSocket] Failed to parse message:", err);
        }
      };

      ws.onclose = (event) => {
        console.log("[WebSocket] Disconnected:", event.code, event.reason);
        setConnected(false);
        setConnecting(false);
        wsRef.current = null;
        onDisconnectRef.current?.();

        // Start countdown for retry
        const delayMs = reconnectDelayRef.current;
        let remaining = Math.ceil(delayMs / 1000);
        setRetryIn(remaining);

        // Update countdown every second
        countdownIntervalRef.current = setInterval(() => {
          remaining -= 1;
          setRetryIn(Math.max(0, remaining));
        }, 1000);

        // Schedule reconnect with exponential backoff
        reconnectTimeoutRef.current = setTimeout(() => {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          console.log("[WebSocket] Attempting reconnect...");
          reconnectDelayRef.current = Math.min(
            reconnectDelayRef.current * 2,
            MAX_RECONNECT_DELAY
          );
          connect();
        }, delayMs);
      };

      ws.onerror = (error) => {
        console.error("[WebSocket] Error:", error);
      };
    } catch (err) {
      console.error("[WebSocket] Failed to connect:", err);
      // Schedule reconnect
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectDelayRef.current = Math.min(
          reconnectDelayRef.current * 2,
          MAX_RECONNECT_DELAY
        );
        connect();
      }, reconnectDelayRef.current);
    }
  }, []); // No dependencies - callbacks are accessed via refs

  // Connect on mount
  useEffect(() => {
    if (isDemoMode) {
      return;
    }

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Respond to an interaction
  const respond = useCallback(
    (interactionId: string, sessionName: string, response: unknown) => {
      if (isDemoMode) {
        console.log("[Demo] Response ignored in demo mode");
        return;
      }

      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        console.error("[WebSocket] Cannot respond: not connected");
        return;
      }

      console.log("[WebSocket] Sending respond:", interactionId, response);
      console.trace("[WebSocket] Stack trace for respond");
      wsRef.current.send(
        JSON.stringify({
          type: "respond",
          interactionId,
          sessionName,
          response,
        })
      );
    },
    []
  );

  // Send any message via WebSocket
  const sendMessage = useCallback((message: unknown) => {
    if (isDemoMode) {
      return;
    }

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error("[WebSocket] Cannot send message: not connected");
      return;
    }

    wsRef.current.send(JSON.stringify(message));
  }, []);

  // Send a text message to an agent
  const sendTextMessage = useCallback((sessionName: string, text: string) => {
    if (isDemoMode) {
      console.log("[Demo] Text message ignored in demo mode");
      return;
    }

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error("[WebSocket] Cannot send message: not connected");
      return;
    }

    wsRef.current.send(
      JSON.stringify({
        type: "message",
        sessionName,
        text,
      })
    );
  }, []);

  return {
    projects,
    connected,
    connecting,
    retryIn,
    respond,
    sendMessage,
    sendTextMessage,
  };
}
