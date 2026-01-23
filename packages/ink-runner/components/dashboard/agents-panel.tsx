import { Box, Text } from "ink";
import { memo } from "react";
import type { AgentDisplayStatus } from "./use-agents.js";

interface AgentCardProps {
  agent: AgentDisplayStatus;
}

/**
 * Get border color based on agent status
 */
function getStatusColor(status: AgentDisplayStatus["displayStatus"]): string {
  switch (status) {
    case "running":
      return "cyan";
    case "thinking":
      return "magenta";
    case "waiting":
      return "yellow";
    default:
      return "gray";
  }
}

/**
 * Get status badge text
 */
function getStatusBadge(agent: AgentDisplayStatus): string {
  switch (agent.displayStatus) {
    case "running":
      return "running";
    case "thinking":
      return "thinking";
    case "waiting":
      return "WAITING";
    default:
      return "idle";
  }
}

/**
 * Single agent card component.
 * Memoized to prevent re-renders when parent updates but agent data unchanged.
 */
const AgentCard = memo(function AgentCard({ agent }: AgentCardProps) {
  const borderColor = getStatusColor(agent.displayStatus);
  const badge = getStatusBadge(agent);
  const isWaiting = agent.displayStatus === "waiting";
  const isIdle = agent.displayStatus === "idle";

  return (
    <Box
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      flexDirection="column"
      minWidth={20}
    >
      {/* Agent ID and project */}
      <Box>
        <Text bold color={isIdle ? "gray" : undefined}>
          {agent.id}
        </Text>
        {agent.gitBranch && <Text dimColor> ({agent.gitBranch})</Text>}
      </Box>
      <Box>
        <Text dimColor>{agent.project}</Text>
      </Box>

      {/* Status badge */}
      <Box marginTop={1}>
        {isWaiting ? (
          <Text color="yellow" bold>
            {"! "}
            {badge}
          </Text>
        ) : (
          <Text color={borderColor} dimColor={isIdle}>
            {badge}
          </Text>
        )}
      </Box>
    </Box>
  );
});

interface AgentsPanelProps {
  agents: AgentDisplayStatus[];
}

/**
 * Panel displaying all registered agents.
 * Memoized to prevent re-renders when agents array reference changes
 * but content is the same (handled by hasAgentsChanged in hook).
 */
export const AgentsPanel = memo(function AgentsPanel({
  agents,
}: AgentsPanelProps) {
  if (agents.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box paddingX={1}>
        <Text bold>Agents</Text>
        <Text dimColor> ({agents.length})</Text>
      </Box>

      {/* Agent cards in a row - use sessionId as key for stable identity */}
      <Box paddingX={1} gap={1} flexWrap="wrap">
        {agents.map((agent) => (
          <AgentCard key={agent.sessionId} agent={agent} />
        ))}
      </Box>
    </Box>
  );
});
