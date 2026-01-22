/**
 * Help overlay component - displays keyboard shortcuts.
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';

export interface HelpOverlayProps {
  onClose: () => void;
}

export function HelpOverlay({ onClose }: HelpOverlayProps) {
  useInput((input, key) => {
    if (input === '?' || key.escape || key.return) onClose();
  });

  return (
    <Box flexDirection="column" padding={2} borderStyle="round" borderColor="cyan">
      <Text bold color="cyan">Keyboard Shortcuts</Text>
      <Text> </Text>
      <Text><Text color="green">j/k ↓/↑</Text>  Navigate interactions/agents</Text>
      <Text><Text color="green">Tab</Text>      Next interaction / question</Text>
      <Text><Text color="green">Shift+Tab</Text> Previous interaction / question</Text>
      <Text><Text color="green">1-9</Text>      Jump to interaction #</Text>
      <Text><Text color="green">g g</Text>      Jump to first</Text>
      <Text><Text color="green">G</Text>        Jump to last</Text>
      <Text> </Text>
      <Text><Text color="green">Enter</Text>    Focus session (plan + interactions)</Text>
      <Text><Text color="green">Esc</Text>      Exit focused view</Text>
      <Text><Text color="green">Tab</Text>      Switch pane (in focused view)</Text>
      <Text><Text color="green">e</Text>        Edit plan file (in focused view)</Text>
      <Text> </Text>
      <Text><Text color="green">Space</Text>    Select option (ask/select)</Text>
      <Text><Text color="green">y/n</Text>      Yes/No (confirm)</Text>
      <Text><Text color="green">d</Text>        Dismiss</Text>
      <Text><Text color="green">f</Text>        Feedback (display components)</Text>
      <Text><Text color="green">m</Text>        Send message to agent</Text>
      <Text> </Text>
      <Text><Text color="green">r</Text>        Refresh</Text>
      <Text><Text color="green">?</Text>        Toggle help</Text>
      <Text><Text color="green">Ctrl+C</Text>   Quit</Text>
      <Text> </Text>
      <Text dimColor>Press any key to close</Text>
    </Box>
  );
}
