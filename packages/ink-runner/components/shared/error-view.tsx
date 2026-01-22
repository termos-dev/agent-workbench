/**
 * Shared error view component for displaying errors in Ink components.
 *
 * Usage:
 * ```tsx
 * if (error) {
 *   return <ErrorView error={error} />;
 * }
 *
 * // With custom hint
 * if (error) {
 *   return <ErrorView error={error} hint="r retry" />;
 * }
 * ```
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface ErrorViewProps {
  /** The error message to display */
  error: string;
  /** Custom hint text (default: "Press Esc to close") */
  hint?: string;
  /** Additional content to render below the error */
  children?: React.ReactNode;
}

export function ErrorView({ error, hint = 'Press Esc to close', children }: ErrorViewProps) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color="red">{error}</Text>
      <Text dimColor>{hint}</Text>
      {children}
    </Box>
  );
}
