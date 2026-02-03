/**
 * Server manager - handles auto-starting UI server and browser.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const AWB_DIR = path.join(os.homedir(), ".awb");
const PID_FILE = path.join(AWB_DIR, "ui.pid");
const LOCK_FILE = path.join(AWB_DIR, "ui.lock");
const DEFAULT_PORT = 3847;

/**
 * Check if server is running via PID file + process check.
 */
export function getServerPid(): number | null {
  try {
    if (!fs.existsSync(PID_FILE)) return null;
    const pid = Number.parseInt(fs.readFileSync(PID_FILE, "utf-8").trim());
    process.kill(pid, 0); // Throws if process doesn't exist
    return pid;
  } catch {
    // Stale PID file - clean up
    try {
      fs.unlinkSync(PID_FILE);
    } catch {}
    return null;
  }
}

/**
 * Write PID file for the current process.
 */
export function writePidFile(): void {
  fs.mkdirSync(AWB_DIR, { recursive: true });
  fs.writeFileSync(PID_FILE, String(process.pid));
}

/**
 * Clean up PID file.
 */
export function cleanupPidFile(): void {
  try {
    fs.unlinkSync(PID_FILE);
  } catch {}
}

/**
 * Check if server is responding via HTTP health check.
 */
export async function isServerHealthy(port = DEFAULT_PORT): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);
    const res = await fetch(`http://localhost:${port}/api/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = (await res.json()) as { status: string; wsReady: boolean };
    return data.status === "ok" && data.wsReady === true;
  } catch {
    return false;
  }
}

/**
 * Acquire lock to prevent race conditions.
 */
export function acquireLock(attempt = 0): boolean {
  fs.mkdirSync(AWB_DIR, { recursive: true });
  try {
    // Use exclusive flag - fails if file exists
    fs.writeFileSync(LOCK_FILE, String(process.pid), { flag: "wx" });
    return true;
  } catch {
    // Check if lock is stale (process dead)
    try {
      const pid = Number.parseInt(fs.readFileSync(LOCK_FILE, "utf-8").trim());
      process.kill(pid, 0);
      return false; // Process alive, lock valid
    } catch {
      // Stale lock - remove and retry
      try {
        fs.unlinkSync(LOCK_FILE);
      } catch {}
      if (attempt >= 5) {
        return false;
      }
      return acquireLock(attempt + 1);
    }
  }
}

/**
 * Release lock file.
 */
export function releaseLock(): void {
  try {
    fs.unlinkSync(LOCK_FILE);
  } catch {}
}

/**
 * Ensure UI server is running, starting it if necessary.
 * Returns true if server is healthy, false otherwise.
 */
export async function ensureServerRunning(
  port = DEFAULT_PORT
): Promise<boolean> {
  // Fast path: server already healthy
  if (await isServerHealthy(port)) {
    return true;
  }

  // Check PID - if process exists but not healthy, wait a bit
  const pid = getServerPid();
  if (pid !== null) {
    // Server starting up - wait and retry
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 300));
      if (await isServerHealthy(port)) return true;
    }
    return false; // Server process exists but unhealthy
  }

  // No server running - try to start it
  if (!acquireLock()) {
    // Another process is starting server - wait for it
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 300));
      if (await isServerHealthy(port)) {
        return true;
      }
    }
    return false;
  }

  try {
    // Start server in background (without --open, we'll open browser after health check)
    const proc = spawn(process.execPath, [process.argv[1], "ui"], {
      detached: true,
      stdio: "ignore",
    });
    proc.unref();

    // Wait for server to become healthy (up to 3 seconds)
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 300));
      if (await isServerHealthy(port)) {
        return true;
      }
    }
    return false;
  } finally {
    releaseLock();
  }
}

/**
 * Open browser if no clients are connected.
 */
export async function ensureBrowserOpen(port = DEFAULT_PORT): Promise<void> {
  try {
    const res = await fetch(`http://localhost:${port}/api/health`);
    const data = (await res.json()) as { clients: number };
    if (data.clients === 0) {
      await fetch(`http://localhost:${port}/api/open-browser`, {
        method: "POST",
      });
    }
  } catch {
    // Ignore - best effort
  }
}
