import { Box, Text } from "ink";

export interface LoadingViewProps {
  /** Custom loading message (default: "Loading...") */
  message?: string;
}

export function LoadingView({ message = "Loading..." }: LoadingViewProps) {
  return (
    <Box paddingX={1}>
      <Text dimColor>{message}</Text>
    </Box>
  );
}
