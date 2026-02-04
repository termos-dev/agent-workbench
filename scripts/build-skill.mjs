import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const skillsDir = path.join(repoRoot, "skills");
const skillName = process.argv[2] || "awb";
const sourceDir = path.join(skillsDir, skillName);
const distDir = path.join(skillsDir, "dist");
const outFile = path.join(distDir, `${skillName}.skill`);

if (!existsSync(sourceDir)) {
  console.error(`[build-skill] Missing skill directory: ${sourceDir}`);
  process.exit(1);
}

mkdirSync(distDir, { recursive: true });
if (existsSync(outFile)) {
  rmSync(outFile);
}

try {
  execFileSync(
    "zip",
    [
      "-r",
      outFile,
      skillName,
      "-x",
      `${skillName}/.DS_Store`,
      `${skillName}/**/.DS_Store`,
    ],
    { cwd: skillsDir, stdio: "inherit" }
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[build-skill] Failed to run zip: ${message}`);
  console.error("[build-skill] Install the zip CLI or run on macOS/Linux.");
  process.exit(1);
}

console.log(`[build-skill] Wrote ${outFile}`);
