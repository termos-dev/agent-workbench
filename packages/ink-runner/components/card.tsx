import { readFileSync } from "node:fs";
import { Box, Text, useApp, useInput } from "ink";
import { useEffect, useState } from "react";
import { useFileWatch } from "./shared/index.js";

declare const onComplete: (result: unknown) => void;
declare const args: {
  content?: string;
  file?: string;
  actions?: string;
  layout?: "horizontal" | "vertical" | "auto";
  title?: string;
};

interface CardAction {
  label: string;
  key?: string;
  value: string;
}

const DEFAULT_ACTION: CardAction = {
  label: "Dismiss",
  key: "d",
  value: "dismiss",
};

function parseActions(actionsJson?: string): CardAction[] {
  if (!actionsJson) return [DEFAULT_ACTION];

  try {
    const parsed = JSON.parse(actionsJson) as CardAction[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [DEFAULT_ACTION];

    const usedKeys = new Set<string>();
    return parsed.map((action, idx) => {
      let key = action.key?.toLowerCase();

      // Auto-assign key if not provided or already used
      if (!key || usedKeys.has(key)) {
        // Try first letter of label, then first available letter
        const labelFirstChar = action.label
          .replace(/[^\w]/g, "")[0]
          ?.toLowerCase();
        if (labelFirstChar && !usedKeys.has(labelFirstChar)) {
          key = labelFirstChar;
        } else {
          // Fallback to number keys
          key = String(idx + 1);
        }
      }

      usedKeys.add(key);
      return { ...action, key };
    });
  } catch {
    return [DEFAULT_ACTION];
  }
}

// Simple markdown rendering (reused from markdown.tsx)
function renderLine(line: string, idx: number) {
  if (line.startsWith("### ")) {
    return (
      <Text key={idx} color="yellow">
        {line.slice(4)}
      </Text>
    );
  }
  if (line.startsWith("## ")) {
    return (
      <Text key={idx} bold color="cyan">
        {line.slice(3)}
      </Text>
    );
  }
  if (line.startsWith("# ")) {
    return (
      <Text key={idx} bold color="green">
        {line.slice(2)}
      </Text>
    );
  }
  if (line.startsWith("- [ ] ")) {
    return (
      <Text key={idx}>
        <Text color="gray">☐</Text> {line.slice(6)}
      </Text>
    );
  }
  if (line.startsWith("- [x] ")) {
    return (
      <Text key={idx}>
        <Text color="green">☑</Text> {line.slice(6)}
      </Text>
    );
  }
  if (line.startsWith("- ")) {
    return (
      <Text key={idx}>
        <Text color="blue">•</Text> {line.slice(2)}
      </Text>
    );
  }
  if (line.startsWith("```")) {
    return (
      <Text key={idx} dimColor>
        {line}
      </Text>
    );
  }
  if (!line.trim()) {
    return <Text key={idx}> </Text>;
  }
  return <Text key={idx}>{line}</Text>;
}

export default function Card() {
  const { exit } = useApp();
  const [lines, setLines] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const actions = parseActions(args?.actions);
  const layout = args?.layout || "auto";
  const isVertical =
    layout === "vertical" || (layout === "auto" && actions.length > 3);

  // Handle inline content
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional - only re-run when content changes
  useEffect(() => {
    if (args?.content) {
      setLines(args.content.split("\n"));
    }
  }, [args?.content]);

  // Handle file content with watching
  useFileWatch(!args?.content ? args?.file : undefined, () => {
    if (args?.content) return;

    if (!args?.file) {
      setLines(["No content. Use --content or --file"]);
      return;
    }

    try {
      const text = readFileSync(args.file, "utf-8");
      setLines(text.split("\n"));
    } catch {
      setLines([`Error reading: ${args.file}`]);
    }
  });

  useInput((input, key) => {
    // Cancel on escape
    if (key.escape) {
      onComplete({ action: "cancel" });
      exit();
      return;
    }

    // Check for hotkey match
    const inputLower = input.toLowerCase();
    const hotkeyMatch = actions.findIndex((a) => a.key === inputLower);
    if (hotkeyMatch !== -1) {
      const action = actions[hotkeyMatch];
      onComplete({
        action: "accept",
        selected: action.value,
        selectedLabel: action.label,
      });
      exit();
      return;
    }

    // Navigation between actions
    if (isVertical) {
      if (key.upArrow) {
        setSelectedIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedIndex((i) => Math.min(actions.length - 1, i + 1));
        return;
      }
    } else {
      if (key.leftArrow || input === "h") {
        setSelectedIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.rightArrow || input === "l") {
        setSelectedIndex((i) => Math.min(actions.length - 1, i + 1));
        return;
      }
    }

    // Confirm selection
    if (key.return) {
      const action = actions[selectedIndex];
      onComplete({
        action: "accept",
        selected: action.value,
        selectedLabel: action.label,
      });
      exit();
      return;
    }
  });

  const hotkeysHint = actions.map((a) => a.key).join("/");
  const navHint = isVertical ? "↑↓" : "←→";

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Content area - render all lines, let terminal handle scrolling */}
      <Box flexDirection="column" marginBottom={1}>
        {lines.map((line, idx) => renderLine(line, idx))}
      </Box>

      {/* Action buttons */}
      <Box
        flexDirection={isVertical ? "column" : "row"}
        gap={isVertical ? 0 : 2}
        marginBottom={1}
      >
        {actions.map((action, idx) => (
          <Box key={action.value}>
            <Text
              color={idx === selectedIndex ? "cyan" : undefined}
              bold={idx === selectedIndex}
              inverse={idx === selectedIndex}
            >
              {" "}
              {action.label}{" "}
            </Text>
            <Text dimColor> [{action.key}]</Text>
          </Box>
        ))}
      </Box>

      {/* Help text */}
      <Box>
        <Text dimColor>
          {hotkeysHint}=select {navHint}=switch Enter=confirm Esc=cancel
        </Text>
      </Box>
    </Box>
  );
}
