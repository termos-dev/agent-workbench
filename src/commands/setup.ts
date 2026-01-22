/**
 * Setup command handler - installs the termos plugin for Claude Code.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Recursively copy directory.
 */
function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Install/setup termos plugin for Claude Code.
 */
export async function handleSetup(): Promise<void> {
  const os = await import("node:os");
  const homedir = os.default.homedir();
  const pluginDir = path.join(homedir, ".claude", "plugins", "termos");

  // Find where termos is installed
  const packageRoot = path.dirname(
    path.dirname(fileURLToPath(import.meta.url))
  );
  const sourcePluginDir = path.join(packageRoot, ".claude-plugin");

  // Check if source plugin exists
  if (!fs.existsSync(sourcePluginDir)) {
    console.error("Error: Plugin files not found at", sourcePluginDir);
    console.error("Make sure termos is properly installed.");
    process.exit(1);
  }

  // Create plugins directory if needed
  const pluginsDir = path.dirname(pluginDir);
  if (!fs.existsSync(pluginsDir)) {
    fs.mkdirSync(pluginsDir, { recursive: true });
  }

  // Remove existing plugin if exists
  if (fs.existsSync(pluginDir)) {
    fs.rmSync(pluginDir, { recursive: true });
  }

  // Copy plugin files
  copyDirSync(sourcePluginDir, pluginDir);

  // Make hook scripts executable
  const hooksDir = path.join(pluginDir, "hooks");
  if (fs.existsSync(hooksDir)) {
    const hookFiles = fs.readdirSync(hooksDir).filter((f) => f.endsWith(".sh"));
    for (const file of hookFiles) {
      fs.chmodSync(path.join(hooksDir, file), 0o755);
    }
  }

  console.log("Termos plugin installed!");
  console.log("");
  console.log("Location:", pluginDir);
  console.log("");
  console.log("Next steps:");
  console.log("  1. Restart Claude Code to load the plugin");
  console.log("  2. Run 'termos tui' in a separate terminal");
  console.log("  3. Claude will use termos for interactions");
  console.log("");
  console.log("Run 'termos --help' for usage info.");
}
