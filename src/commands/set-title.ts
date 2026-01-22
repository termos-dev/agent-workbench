/**
 * Set-title command handler - sets a title for the current session.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentSessionId } from "../session-utils.js";

/**
 * Set a title for the current session.
 */
export function handleSetTitle(args: string[]): void {
  const title = args.join(" ").trim();

  if (!title) {
    console.error("Usage: termos set-title <title>");
    process.exit(1);
  }

  // Get the current session ID
  const sessionId = getAgentSessionId();
  if (!sessionId) {
    console.error(
      "Could not detect current session. Make sure you're running within a Claude session."
    );
    process.exit(1);
  }

  // Save title to cache
  const titlesDir = path.join(process.env.HOME || "", ".termos", "titles");
  fs.mkdirSync(titlesDir, { recursive: true });
  fs.writeFileSync(path.join(titlesDir, sessionId), title);

  console.log(JSON.stringify({ sessionId, title, status: "set" }));
}
