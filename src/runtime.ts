import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const TERMOS_DIR = ".termos";
const LAYOUTS_DIR = "layouts";

export function getRuntimeRoot(): string {
  const override = process.env.TERMOS_RUNTIME_DIR;
  if (override && override.trim().length > 0) {
    return override;
  }
  return path.join(os.homedir(), ".termos", "sessions");
}

/**
 * Convert a path to a session name by replacing slashes with dashes.
 * Similar to how Claude Code stores projects in ~/.claude/projects/
 * e.g., /Users/foo/myproject -> -Users-foo-myproject
 */
export function pathToSessionName(cwd: string): string {
  // Normalize and convert slashes to dashes
  const normalized = path.resolve(cwd);
  const sessionName = normalized.replace(/[/\\]/g, "-");
  return sessionName || "session";
}

export function getSessionRuntimeDir(sessionName: string): string {
  return path.join(getRuntimeRoot(), sessionName);
}

export function getEventsFilePath(sessionName: string): string {
  return path.join(getSessionRuntimeDir(sessionName), "events.jsonl");
}

export function ensureEventsFile(sessionName: string): string {
  const dir = getSessionRuntimeDir(sessionName);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = getEventsFilePath(sessionName);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "", { flag: "w" });
  }
  return filePath;
}

/**
 * Get the zellij session name for a project directory.
 * Uses project folder name prefixed with "termos-" to keep it short.
 * e.g., /Users/foo/myproject -> termos-myproject
 */
export function getZellijSessionName(cwd: string): string {
  const projectName = path.basename(path.resolve(cwd));
  // Sanitize: replace non-alphanumeric chars with dashes, collapse multiple dashes
  const sanitized = projectName.replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `termos-${sanitized || "session"}`;
}

/**
 * Get the path to the marker file that indicates an attached zellij session.
 * The marker file is created by `termos attach` and checked by `termos run`.
 */
export function getMarkerPath(sessionName: string): string {
  return path.join(getSessionRuntimeDir(sessionName), ".attached");
}

/**
 * Write the marker file to indicate a zellij session is attached.
 */
export function writeMarkerFile(sessionName: string): void {
  const dir = getSessionRuntimeDir(sessionName);
  fs.mkdirSync(dir, { recursive: true });
  const markerPath = getMarkerPath(sessionName);
  fs.writeFileSync(markerPath, new Date().toISOString(), { flag: "w" });
}

/**
 * Delete the marker file when session is stopped.
 */
export function deleteMarkerFile(sessionName: string): void {
  const markerPath = getMarkerPath(sessionName);
  try {
    fs.unlinkSync(markerPath);
  } catch {
    // Ignore if file doesn't exist
  }
}

/**
 * Find a layout file by name.
 * Checks project .termos/layouts/ first, then user ~/.termos/layouts/
 * @param cwd - Current working directory (project root)
 * @param name - Layout name (without .kdl extension)
 * @returns Path to layout file, or null if not found
 */
export function findLayoutFile(cwd: string, name: string): string | null {
  const filename = `${name}.kdl`;

  // Check project-level first
  const projectPath = path.join(cwd, TERMOS_DIR, LAYOUTS_DIR, filename);
  if (fs.existsSync(projectPath)) {
    return projectPath;
  }

  // Check user-level
  const userPath = path.join(os.homedir(), TERMOS_DIR, LAYOUTS_DIR, filename);
  if (fs.existsSync(userPath)) {
    return userPath;
  }

  return null;
}

/**
 * List all available layouts for a project.
 * Combines project-level and user-level layouts.
 */
export function listAvailableLayouts(cwd: string): string[] {
  const layouts = new Set<string>();

  // Check project-level
  const projectDir = path.join(cwd, TERMOS_DIR, LAYOUTS_DIR);
  if (fs.existsSync(projectDir)) {
    for (const file of fs.readdirSync(projectDir)) {
      if (file.endsWith(".kdl")) {
        layouts.add(file.replace(".kdl", ""));
      }
    }
  }

  // Check user-level
  const userDir = path.join(os.homedir(), TERMOS_DIR, LAYOUTS_DIR);
  if (fs.existsSync(userDir)) {
    for (const file of fs.readdirSync(userDir)) {
      if (file.endsWith(".kdl")) {
        layouts.add(file.replace(".kdl", ""));
      }
    }
  }

  return Array.from(layouts).sort();
}
