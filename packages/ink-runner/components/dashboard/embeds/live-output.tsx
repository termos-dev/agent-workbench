/**
 * Live output embed component - displays live command output with file watching.
 */

import * as fs from "node:fs";
import { Box, Text } from "ink";
import { useCallback, useState } from "react";
import { useFileWatch } from "../../shared/index.js";
import { DisplayFeedbackEmbed } from "./display-feedback.js";

export interface LiveOutputEmbedProps {
  outputFile: string;
  maxLines?: number;
  isActive: boolean;
  onRespond: (feedback?: string) => void;
}

export function LiveOutputEmbed({
  outputFile,
  maxLines = 6,
  isActive,
  onRespond,
}: LiveOutputEmbedProps) {
  const [lines, setLines] = useState<string[]>(["Waiting for output..."]);
  const [processExited, setProcessExited] = useState(false);

  const loadOutput = useCallback(() => {
    try {
      if (fs.existsSync(outputFile)) {
        const content = fs.readFileSync(outputFile, "utf-8");
        const allLines = content.split("\n");

        // Check if process has exited (find last non-empty line)
        const nonEmptyLines = allLines.filter((l) => l.length > 0);
        const lastLine = nonEmptyLines[nonEmptyLines.length - 1] || "";
        if (
          lastLine.startsWith("[Process exited") ||
          lastLine.startsWith("[Process error")
        ) {
          setProcessExited(true);
        }

        // Tail the last N lines
        setLines(allLines.slice(-maxLines).filter((l) => l.length > 0));
      }
    } catch {
      setLines(["[Error reading output file]"]);
    }
  }, [outputFile, maxLines]);

  // Watch file for changes with faster interval for live updates
  useFileWatch(outputFile, loadOutput, { interval: 300 });

  // When process exited, show feedback UI
  if (processExited) {
    return (
      <Box flexDirection="column">
        {lines.map((line, i) => (
          <Text
            key={i}
            dimColor={i === lines.length - 1 && line.startsWith("[")}
          >
            {line}
          </Text>
        ))}
        <DisplayFeedbackEmbed isActive={isActive} onRespond={onRespond} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
      <Text color="cyan" dimColor>
        ● Live
      </Text>
    </Box>
  );
}
