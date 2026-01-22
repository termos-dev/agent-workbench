/**
 * Card embed component - Card with action buttons.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { EmbedProps } from './types.js';
import type { DashboardInteraction } from '../types.js';

export interface CardAction {
  label: string;
  key?: string;
  value: string;
}

const DEFAULT_ACTION: CardAction = { label: 'Dismiss', key: 'd', value: 'dismiss' };

export function parseCardActions(json?: string): CardAction[] {
  if (!json) return [DEFAULT_ACTION];
  try {
    const parsed = JSON.parse(json) as CardAction[];
    if (!Array.isArray(parsed) || !parsed.length) return [DEFAULT_ACTION];
    const used = new Set<string>();
    return parsed.map((a, i) => {
      let k = a.key?.toLowerCase();
      if (!k || used.has(k)) k = a.label[0]?.toLowerCase() || String(i + 1);
      used.add(k);
      return { ...a, key: k };
    });
  } catch { return [DEFAULT_ACTION]; }
}

export interface CardEmbedProps extends EmbedProps {
  interaction: DashboardInteraction;
  onRespond: (value: string, label: string) => void;
}

export function CardEmbed({ interaction, isActive, onRespond, onCancel }: CardEmbedProps) {
  const actions = parseCardActions((interaction.args as Record<string, unknown>)?.actions as string);
  const [idx, setIdx] = useState(0);

  useInput((input, key) => {
    if (!isActive) return;
    if (key.escape) { onCancel?.(); return; }
    const match = actions.findIndex(a => a.key === input.toLowerCase());
    if (match !== -1) { onRespond(actions[match].value, actions[match].label); return; }
    if (key.leftArrow || input === 'h') { setIdx(i => Math.max(0, i - 1)); return; }
    if (key.rightArrow || input === 'l') { setIdx(i => Math.min(actions.length - 1, i + 1)); return; }
    if (key.return) { onRespond(actions[idx].value, actions[idx].label); }
  });

  return (
    <Box gap={2}>
      {actions.map((a, i) => (
        <Box key={a.value}>
          <Text color={i === idx ? 'cyan' : undefined} bold={i === idx} inverse={i === idx}> {a.label} </Text>
          <Text dimColor>[{a.key}]</Text>
        </Box>
      ))}
    </Box>
  );
}
