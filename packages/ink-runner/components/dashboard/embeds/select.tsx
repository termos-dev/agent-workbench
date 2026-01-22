/**
 * Select embed component - Single selection from options.
 */

import { Box, Text, useInput } from "ink";
import { useState } from "react";
import type { DashboardInteraction } from "../types.js";
import type { EmbedProps } from "./types.js";

export interface SelectEmbedProps extends EmbedProps {
  interaction: DashboardInteraction;
  onRespond: (value: string) => void;
}

export function SelectEmbed({
  interaction,
  isActive,
  onRespond,
  onCancel,
}: SelectEmbedProps) {
  const options = interaction.options || [];
  const [idx, setIdx] = useState(0);

  useInput((input, key) => {
    if (!isActive) return;
    if (key.escape) {
      onCancel?.();
      return;
    }
    if (key.leftArrow || input === "h") {
      setIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (key.rightArrow || input === "l") {
      setIdx((i) => Math.min(options.length - 1, i + 1));
      return;
    }
    if (key.return && options[idx]) {
      onRespond(options[idx].value);
    }
  });

  return (
    <Box gap={2}>
      {options.map((opt, i) => (
        <Text
          key={opt.value}
          color={i === idx ? "cyan" : undefined}
          bold={i === idx}
          inverse={i === idx}
        >
          {i === idx ? " > " : "   "}
          {opt.label}
        </Text>
      ))}
    </Box>
  );
}
