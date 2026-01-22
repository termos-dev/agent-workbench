import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { formatDistanceToNow } from 'date-fns';
import { useTerminalSize } from '../shared/index.js';
import { PlanPane } from './plan-pane.js';
import type { AgentDisplayStatus } from './use-agents.js';
import type { DashboardInteraction } from './types.js';
import type { InteractionResponse } from './use-dashboard-data.js';

// Interactive components that need user response
const INTERACTIVE = new Set(['confirm', 'select', 'checklist', 'ask', 'input', 'card']);
const isInteractive = (c: string) => INTERACTIVE.has(c);

interface FocusedSessionViewProps {
  agent: AgentDisplayStatus;
  interactions: DashboardInteraction[];
  onRespond: (sessionName: string, interactionId: string, response: InteractionResponse) => void;
  onBack: () => void;
  onSendMessage?: (text: string) => void;
}

type FocusedPane = 'plan' | 'interactions';

// Compact interaction display for the interactions pane
function InteractionItem({
  interaction,
  isSelected,
  width
}: {
  interaction: DashboardInteraction;
  isSelected: boolean;
  width: number;
}) {
  const interactive = isInteractive(interaction.component);
  const maxTitleLen = Math.max(20, width - 30);
  const title = (interaction.title || 'Untitled').slice(0, maxTitleLen);

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={isSelected ? 'cyan' : 'white'}>{isSelected ? '> ' : '  '}</Text>
        <Text color={interactive ? 'yellow' : 'blue'}>{interactive ? '? ' : '# '}</Text>
        <Text bold>{interaction.component}</Text>
        <Text>: {title}</Text>
        <Text dimColor> ({formatDistanceToNow(interaction.ts, { addSuffix: true })})</Text>
      </Box>
      {interaction.prompt && isSelected && (
        <Box marginLeft={4}>
          <Text dimColor>{interaction.prompt.slice(0, width - 10)}</Text>
        </Box>
      )}
    </Box>
  );
}

export function FocusedSessionView({
  agent,
  interactions,
  onRespond,
  onBack,
  onSendMessage
}: FocusedSessionViewProps) {
  const { rows, columns } = useTerminalSize();

  const hasPlanFile = !!agent.planFile;

  // Focused pane: plan or interactions (only plan if we have a plan file)
  const [focusedPane, setFocusedPane] = useState<FocusedPane>(
    hasPlanFile ? 'plan' : 'interactions'
  );

  // Selected interaction index within the interactions pane
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Message input state
  const [messageExpanded, setMessageExpanded] = useState(false);
  const [messageText, setMessageText] = useState('');

  // Determine layout: side-by-side (>100 cols) or stacked (<100 cols)
  const isWide = columns >= 100;

  // Calculate pane dimensions
  const headerHeight = 3; // Agent info header
  const footerHeight = 2; // Hints
  const availableHeight = rows - headerHeight - footerHeight;
  const availableWidth = columns - 2; // Padding

  // If no plan file, interactions take full width/height
  let planWidth: number, planHeight: number;
  let interactionsWidth: number, interactionsHeight: number;

  if (!hasPlanFile) {
    // No plan file - interactions only, full space
    planWidth = 0;
    planHeight = 0;
    interactionsWidth = availableWidth;
    interactionsHeight = availableHeight;
  } else if (isWide) {
    // Side-by-side layout
    planWidth = Math.floor(availableWidth * 0.45);
    interactionsWidth = availableWidth - planWidth - 1; // -1 for divider
    planHeight = availableHeight;
    interactionsHeight = availableHeight;
  } else {
    // Stacked layout
    planWidth = availableWidth;
    interactionsWidth = availableWidth;
    planHeight = Math.floor(availableHeight * 0.4);
    interactionsHeight = availableHeight - planHeight - 1; // -1 for divider
  }

  // Interaction navigation
  const maxIdx = Math.max(0, interactions.length - 1);
  const selectedInteraction = interactions[selectedIdx];

  // Ensure selected index is in bounds
  React.useEffect(() => {
    if (selectedIdx > maxIdx) {
      setSelectedIdx(Math.max(0, maxIdx));
    }
  }, [selectedIdx, maxIdx]);

  // Keyboard handling
  useInput((input, key) => {
    // When message input is expanded, handle its keys
    if (messageExpanded) {
      if (key.escape) {
        setMessageExpanded(false);
        setMessageText('');
        return;
      }
      if (key.return && messageText.trim() && onSendMessage) {
        onSendMessage(messageText.trim());
        setMessageText('');
        setMessageExpanded(false);
        return;
      }
      // Let TextInput handle other keys
      return;
    }

    // Esc goes back to session list
    if (key.escape) {
      onBack();
      return;
    }

    // 'm' opens message input
    if (input === 'm' && onSendMessage) {
      setMessageExpanded(true);
      return;
    }

    // Tab switches focus between panes (only if we have a plan file)
    if (key.tab && hasPlanFile) {
      setFocusedPane(p => p === 'plan' ? 'interactions' : 'plan');
      return;
    }

    // Only handle interactions pane navigation when it's focused (or no plan file)
    if (focusedPane === 'interactions' || !hasPlanFile) {
      // j/k or arrows navigate interactions
      if ((key.upArrow || input === 'k') && !isInteractive(selectedInteraction?.component || '')) {
        setSelectedIdx(i => Math.max(0, i - 1));
        return;
      }
      if ((key.downArrow || input === 'j') && !isInteractive(selectedInteraction?.component || '')) {
        setSelectedIdx(i => Math.min(maxIdx, i + 1));
        return;
      }

      // Number keys 1-9 jump to interaction
      const num = parseInt(input, 10);
      if (num >= 1 && num <= 9 && num <= interactions.length) {
        setSelectedIdx(num - 1);
        return;
      }

      // g = first, G = last
      if (input === 'g') {
        setSelectedIdx(0);
        return;
      }
      if (input === 'G') {
        setSelectedIdx(maxIdx);
        return;
      }
    }
  });

  // Status color
  const statusColor = agent.displayStatus === 'running' ? 'cyan'
    : agent.displayStatus === 'thinking' ? 'magenta'
    : agent.displayStatus === 'waiting' ? 'yellow'
    : 'gray';

  // Interactions pane content (reused in multiple layouts)
  const interactionsContent = (
    <Box flexDirection="column" paddingX={1} overflow="hidden">
      <Box>
        <Text bold color="yellow">Interactions ({interactions.length})</Text>
      </Box>
      {interactions.length === 0 ? (
        <Text dimColor>No pending interactions</Text>
      ) : (
        interactions.slice(0, Math.max(1, interactionsHeight - 2)).map((int, idx) => (
          <InteractionItem
            key={int.id}
            interaction={int}
            isSelected={idx === selectedIdx}
            width={interactionsWidth - 2}
          />
        ))
      )}
      {interactions.length > interactionsHeight - 2 && (
        <Text dimColor>+{interactions.length - (interactionsHeight - 2)} more</Text>
      )}
    </Box>
  );

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      {/* Header: Agent info */}
      <Box flexDirection="column" paddingX={1} marginBottom={1}>
        <Box>
          <Text color={statusColor}>{agent.displayStatus}</Text>
          <Text> </Text>
          <Text bold>{agent.project}</Text>
          {agent.gitBranch && <Text dimColor> ({agent.gitBranch})</Text>}
          <Text dimColor> • {agent.id}</Text>
        </Box>
        {agent.title && (
          <Text dimColor italic>{agent.title}</Text>
        )}
      </Box>

      {/* Main content */}
      {!hasPlanFile ? (
        // No plan file - just show interactions full width
        <Box flexDirection="column" flexGrow={1} paddingX={1}>
          {interactionsContent}
        </Box>
      ) : isWide ? (
        // Side-by-side layout with plan
        <Box flexDirection="row" flexGrow={1} paddingX={1}>
          {/* Plan pane (left) */}
          <Box width={planWidth}>
            <PlanPane
              planFile={agent.planFile}
              isActive={focusedPane === 'plan'}
              height={planHeight}
              width={planWidth}
            />
          </Box>

          {/* Divider */}
          <Box width={1} flexDirection="column">
            {Array.from({ length: availableHeight }).map((_, i) => (
              <Text key={i} dimColor>│</Text>
            ))}
          </Box>

          {/* Interactions pane (right) */}
          <Box width={interactionsWidth} flexDirection="column">
            {interactionsContent}
          </Box>
        </Box>
      ) : (
        // Stacked layout with plan
        <Box flexDirection="column" flexGrow={1} paddingX={1}>
          {/* Plan pane (top) */}
          <Box height={planHeight}>
            <PlanPane
              planFile={agent.planFile}
              isActive={focusedPane === 'plan'}
              height={planHeight}
              width={planWidth}
            />
          </Box>

          {/* Divider */}
          <Box>
            <Text dimColor>{'─'.repeat(availableWidth)}</Text>
          </Box>

          {/* Interactions pane (bottom) */}
          <Box height={interactionsHeight} flexDirection="column">
            {interactionsContent}
          </Box>
        </Box>
      )}

      {/* Footer: Message input or hints */}
      <Box paddingX={1} flexDirection="column">
        {messageExpanded ? (
          <Box flexDirection="column">
            <Box>
              <Text color="cyan">Message: </Text>
              <TextInput value={messageText} onChange={setMessageText} focus={true} placeholder="Type message for agent..." />
            </Box>
            <Text dimColor>Enter send  Esc cancel</Text>
          </Box>
        ) : (
          <Text dimColor>
            Esc back
            {onSendMessage && '  m message'}
            {hasPlanFile && '  Tab switch pane'}
            {hasPlanFile && focusedPane === 'plan' && '  j/k scroll  e edit'}
            {(focusedPane === 'interactions' || !hasPlanFile) && '  j/k navigate'}
          </Text>
        )}
      </Box>
    </Box>
  );
}

export default FocusedSessionView;
