import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const USER_INSTRUCTIONS_PATH = path.join(os.homedir(), ".awb", "awb.md");
const PROJECT_INSTRUCTIONS_FILE = "awb.md";
const PROJECT_INSTRUCTIONS_DIR = ".awb";

function loadUserInstructions(): string {
  try {
    if (fs.existsSync(USER_INSTRUCTIONS_PATH)) {
      return fs.readFileSync(USER_INSTRUCTIONS_PATH, "utf8").trim();
    }
  } catch {
    // Ignore read errors
  }
  return "";
}

function loadProjectInstructions(cwd: string): string {
  // Check .awb/awb.md first, then awb.md in root
  const dirPath = path.join(
    cwd,
    PROJECT_INSTRUCTIONS_DIR,
    PROJECT_INSTRUCTIONS_FILE
  );
  const rootPath = path.join(cwd, PROJECT_INSTRUCTIONS_FILE);

  try {
    if (fs.existsSync(dirPath)) {
      return fs.readFileSync(dirPath, "utf8").trim();
    }
    if (fs.existsSync(rootPath)) {
      return fs.readFileSync(rootPath, "utf8").trim();
    }
  } catch {
    // Ignore read errors
  }
  return "";
}

export function loadMergedInstructions(cwd: string): string {
  const userInstructions = loadUserInstructions();
  const projectInstructions = loadProjectInstructions(cwd);

  const parts: string[] = [];

  if (userInstructions) {
    parts.push(userInstructions);
  }

  if (projectInstructions) {
    parts.push(projectInstructions);
  }

  return parts.join("\n\n");
}
