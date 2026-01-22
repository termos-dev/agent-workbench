/**
 * Input embed component - Text input.
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { EmbedProps } from './types.js';
import type { DashboardInteraction } from '../types.js';

export interface InputEmbedProps extends EmbedProps {
  interaction: DashboardInteraction;
  onRespond: (value: string) => void;
}

export function InputEmbed({ interaction, isActive, onRespond, onCancel }: InputEmbedProps) {
  const [value, setValue] = useState(interaction.defaultValue || '');

  useInput((_, key) => {
    if (!isActive) return;
    if (key.escape) { onCancel?.(); return; }
    if (key.return && value.trim()) { onRespond(value.trim()); }
  });

  return (
    <Box paddingX={1}>
      <Text color={isActive ? 'cyan' : 'gray'}>&gt; </Text>
      <TextInput value={value} onChange={setValue} focus={isActive} />
    </Box>
  );
}
