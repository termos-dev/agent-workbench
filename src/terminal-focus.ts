/**
 * Terminal Focus - Bring terminal windows to front
 *
 * Supports multiple terminal emulators on macOS:
 * - Terminal.app (via AppleScript)
 * - iTerm2 (via AppleScript)
 * - Warp (via URL scheme)
 */

import { execSync } from "node:child_process";

export interface FocusResult {
  success: boolean;
  terminal?: string;
  error?: string;
}

/**
 * Execute AppleScript
 */
function runAppleScript(script: string): boolean {
  try {
    execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, {
      encoding: "utf-8",
      timeout: 3000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Try to focus Terminal.app by TTY
 */
function focusTerminalApp(tty: string): boolean {
  // Terminal.app exposes tty via the "tty" property of tabs
  // Format: tty might be "ttys000" but Terminal uses "/dev/ttys000"
  const fullTty = tty.startsWith("/dev/") ? tty : `/dev/${tty}`;

  const script = `
    tell application "Terminal"
      set found to false
      repeat with w in windows
        repeat with t in tabs of w
          if tty of t is "${fullTty}" then
            set selected tab of w to t
            set frontmost of w to true
            set found to true
            exit repeat
          end if
        end repeat
        if found then exit repeat
      end repeat
      activate
      return found
    end tell
  `;

  try {
    const result = execSync(
      `osascript -e '${script.replace(/'/g, "'\"'\"'")}'`,
      {
        encoding: "utf-8",
        timeout: 3000,
      }
    ).trim();
    return result === "true";
  } catch {
    // Fallback: just activate Terminal
    return runAppleScript(`tell application "Terminal" to activate`);
  }
}

/**
 * Try to focus iTerm2 by TTY
 */
function focusITerm(tty: string): boolean {
  // iTerm2 has better scripting support for finding sessions by TTY
  const script = `
    tell application "iTerm2"
      activate
      repeat with aWindow in windows
        tell aWindow
          repeat with aTab in tabs
            repeat with aSession in sessions of aTab
              if tty of aSession contains "${tty}" then
                select aTab
                select aSession
                return true
              end if
            end repeat
          end repeat
        end tell
      end repeat
    end tell
    return false
  `;

  try {
    const result = execSync(
      `osascript -e '${script.replace(/'/g, "'\"'\"'")}'`,
      {
        encoding: "utf-8",
        timeout: 3000,
      }
    ).trim();
    return result === "true";
  } catch {
    return false;
  }
}

/**
 * Try to focus Warp via System Events (Warp doesn't have AppleScript support)
 */
function focusWarp(_tty: string): boolean {
  // Warp runs as "stable" process - use System Events to bring it to front
  const script = `
    tell application "System Events"
      tell process "stable"
        set frontmost to true
        set windowList to every window
        repeat with w in windowList
          perform action "AXRaise" of w
        end repeat
      end tell
    end tell
  `;

  try {
    execSync(`osascript -e '${script}'`, {
      encoding: "utf-8",
      timeout: 3000,
    });
    return true;
  } catch {
    // Fallback: just try to activate by app name
    try {
      execSync("open -a Warp", {
        encoding: "utf-8",
        timeout: 2000,
      });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Try to focus Ghostty via System Events
 */
function focusGhostty(_tty: string): boolean {
  const script = `
    tell application "System Events"
      tell process "ghostty"
        set frontmost to true
        set windowList to every window
        repeat with w in windowList
          perform action "AXRaise" of w
        end repeat
      end tell
    end tell
  `;

  try {
    execSync(`osascript -e '${script}'`, {
      encoding: "utf-8",
      timeout: 3000,
    });
    return true;
  } catch {
    try {
      execSync("open -a Ghostty", {
        encoding: "utf-8",
        timeout: 2000,
      });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Check which terminal apps are running
 */
function getRunningTerminals(): string[] {
  const terminals: string[] = [];

  try {
    const apps = execSync(
      "osascript -e 'tell application \"System Events\" to get name of every process'",
      { encoding: "utf-8", timeout: 2000 }
    );

    if (apps.includes("Terminal")) terminals.push("Terminal");
    if (apps.includes("iTerm2")) terminals.push("iTerm2");
    // Warp runs as "stable" (the executable name inside Warp.app)
    if (apps.includes("Warp") || apps.includes("stable"))
      terminals.push("Warp");
    if (apps.includes("ghostty")) terminals.push("Ghostty");
  } catch {
    // Fallback: assume common terminals might be running
    return ["Terminal", "iTerm2", "Warp", "Ghostty"];
  }

  return terminals;
}

/**
 * Focus a terminal window by TTY
 *
 * Tries multiple terminal emulators in order of likelihood.
 * Returns which terminal was focused, or an error.
 */
export function focusByTty(tty: string): FocusResult {
  // Handle "??" TTY (no terminal attached)
  if (tty === "??" || !tty) {
    return {
      success: false,
      error: "Process not attached to a terminal (TTY: ??)",
    };
  }

  const runningTerminals = getRunningTerminals();

  // Try Ghostty first
  if (runningTerminals.includes("Ghostty")) {
    if (focusGhostty(tty)) {
      return { success: true, terminal: "Ghostty" };
    }
  }

  // Try Warp
  if (runningTerminals.includes("Warp")) {
    if (focusWarp(tty)) {
      return { success: true, terminal: "Warp" };
    }
  }

  // Try iTerm2 (good scripting support)
  if (runningTerminals.includes("iTerm2")) {
    if (focusITerm(tty)) {
      return { success: true, terminal: "iTerm2" };
    }
  }

  // Try Terminal.app last
  if (runningTerminals.includes("Terminal")) {
    if (focusTerminalApp(tty)) {
      return { success: true, terminal: "Terminal" };
    }
  }

  return {
    success: false,
    error: "No terminal emulator could be focused",
  };
}

/**
 * Focus by PID (finds TTY first, then focuses)
 */
export function focusByPid(pid: number): FocusResult {
  try {
    const ttyOutput = execSync(`ps -o tty= -p ${pid}`, {
      encoding: "utf-8",
      timeout: 1000,
    }).trim();

    if (!ttyOutput || ttyOutput === "??") {
      return {
        success: false,
        error: `Process ${pid} not attached to a terminal`,
      };
    }

    return focusByTty(ttyOutput);
  } catch {
    return {
      success: false,
      error: `Process ${pid} not found`,
    };
  }
}

/**
 * List available terminals that support focusing
 */
export function getAvailableTerminals(): string[] {
  return getRunningTerminals();
}
