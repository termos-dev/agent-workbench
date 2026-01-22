/**
 * Confirm embed component - Yes/No confirmation.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { EmbedProps } from './types.js';

export interface ConfirmEmbedProps extends EmbedProps {
  onRespond: (value: boolean) => void;
}

export function ConfirmEmbed({ isActive, onRespond, onCancel }: ConfirmEmbedProps) {
  const [sel, setSel] = useState<'yes' | 'no'>('yes');

  useInput((input, key) => {
    if (!isActive) return;
    if (key.escape) { onCancel?.(); return; }
    if (input === 'y' || input === 'Y') { onRespond(true); return; }
    if (input === 'n' || input === 'N') { onRespond(false); return; }
    if (key.leftArrow || key.rightArrow || input === 'h' || input === 'l') {
      setSel(s => s === 'yes' ? 'no' : 'yes');
      return;
    }
    if (key.return) { onRespond(sel === 'yes'); }
  });

  return (
    <Box gap={2}>
      <Text color={sel === 'yes' ? 'green' : undefined} bold={sel === 'yes'} inverse={sel === 'yes'}> Yes </Text>
      <Text color={sel === 'no' ? 'red' : undefined} bold={sel === 'no'} inverse={sel === 'no'}> No </Text>
    </Box>
  );
}
