/**
 * Shared loading view component for displaying loading state in Ink components.
 *
 * Usage:
 * ```tsx
 * if (loading) {
 *   return <LoadingView />;
 * }
 *
 * // With custom message
 * if (loading) {
 *   return <LoadingView message="Fetching data..." />;
 * }
 * ```
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface LoadingViewProps {
  /** Custom loading message (default: "Loading...") */
  message?: string;
}

export function LoadingView({ message = 'Loading...' }: LoadingViewProps) {
  return (
    <Box paddingX={1}>
      <Text dimColor>{message}</Text>
    </Box>
  );
}
