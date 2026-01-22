/**
 * Checklist embed component - Multi-selection with checkboxes.
 */

import { Box, Text, useInput } from "ink";
import { useState } from "react";
import type { DashboardInteraction } from "../types.js";
import type { EmbedProps } from "./types.js";

export interface ChecklistEmbedProps extends EmbedProps {
  interaction: DashboardInteraction;
  onRespond: (checked: number[], checkedLabels: string[]) => void;
}

export function ChecklistEmbed({
  interaction,
  isActive,
  onRespond,
  onCancel,
}: ChecklistEmbedProps) {
  const args = interaction.args as Record<string, unknown> | undefined;
  const itemsStr = (args?.items as string) || "";
  const items = itemsStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Parse pre-checked indices
  const checkedStr = (args?.checked as string) || "";
  const initialChecked = new Set(
    checkedStr
      .split(",")
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n))
  );

  const [idx, setIdx] = useState(0);
  const [checked, setChecked] = useState<Set<number>>(initialChecked);

  useInput((input, key) => {
    if (!isActive) return;
    if (key.escape) {
      onCancel?.();
      return;
    }
    if (key.upArrow || input === "k") {
      setIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow || input === "j") {
      setIdx((i) => Math.min(items.length - 1, i + 1));
      return;
    }
    if (input === " ") {
      setChecked((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) {
          next.delete(idx);
        } else {
          next.add(idx);
        }
        return next;
      });
      return;
    }
    if (key.return) {
      const checkedIndices = Array.from(checked).sort((a, b) => a - b);
      const checkedLabels = checkedIndices.map((i) => items[i]);
      onRespond(checkedIndices, checkedLabels);
    }
  });

  if (items.length === 0) {
    return <Text dimColor>[No items]</Text>;
  }

  return (
    <Box flexDirection="column">
      {items.map((item, i) => {
        const isChecked = checked.has(i);
        const isFocused = i === idx;
        return (
          <Box key={i}>
            <Text color={isFocused ? "cyan" : undefined}>
              {isFocused ? "› " : "  "}
            </Text>
            <Text color={isChecked ? "green" : "gray"}>
              {isChecked ? "[✓]" : "[ ]"}
            </Text>
            <Text color={isFocused ? "white" : undefined}> {item}</Text>
          </Box>
        );
      })}
      <Box marginTop={1}>
        <Text dimColor>
          Space toggle Enter submit ({checked.size} selected)
        </Text>
      </Box>
    </Box>
  );
}
