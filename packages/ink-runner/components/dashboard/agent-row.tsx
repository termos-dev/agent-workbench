import { existsSync, readFileSync } from "node:fs";
import { Box, Text } from "ink";
import { InteractionCard } from "./interaction-card.js";
import type { DashboardInteraction } from "./types.js";
import type { AgentDisplayStatus } from "./use-agents.js";
import type { InteractionResponse } from "./use-dashboard-data.js";

// Get first meaningful line from plan file
function getPlanFirstLine(planFile: string | undefined): string | null {
  if (!planFile) return null;
  try {
    if (!existsSync(planFile)) return null;
    const content = readFileSync(planFile, "utf-8");
    const lines = content.split("\n");
    // Find first non-empty line
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        // Strip markdown heading markers
        if (trimmed.startsWith("# ")) return trimmed.slice(2);
        if (trimmed.startsWith("## ")) return trimmed.slice(3);
        if (trimmed.startsWith("### ")) return trimmed.slice(4);
        return trimmed;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export interface AgentRowProps {
  agent: AgentDisplayStatus;
  interactions: DashboardInteraction[];
  selectedId?: string;
  onRespond: (
    session: string,
    id: string,
    response: InteractionResponse
  ) => void;
  width: number;
  onTabNext?: () => void;
  onTabPrev?: () => void;
  isAgentSelected?: boolean;
  onFocus?: () => void;
  /** Show project name (use in global mode) */
  showProject?: boolean;
  onTypingChange?: (isTyping: boolean) => void;
}

export function AgentRow({
  agent,
  interactions,
  selectedId,
  onRespond,
  width,
  onTabNext,
  onTabPrev,
  isAgentSelected,
  showProject,
  onTypingChange,
}: AgentRowProps) {
  const statusColor =
    agent.displayStatus === "running"
      ? "cyan"
      : agent.displayStatus === "thinking"
        ? "magenta"
        : agent.displayStatus === "waiting"
          ? "yellow"
          : "gray";

  // Get first line of plan file to display instead of icon
  const planFirstLine = getPlanFirstLine(agent.planFile);

  // Show full session ID when selected, short (8 chars) otherwise
  const displaySessionId = isAgentSelected
    ? agent.sessionId
    : agent.sessionId.slice(0, 8);

  // Only add bottom margin if we have interactions to show
  const hasInteractions = interactions.length > 0;

  return (
    <Box flexDirection="column" marginBottom={hasInteractions ? 1 : 0}>
      {/* Compact single-line agent header */}
      <Box>
        <Text>Claude Code </Text>
        <Text color={statusColor}>● </Text>
        {showProject && (
          <>
            <Text bold>{agent.project}</Text>
            <Text dimColor> </Text>
          </>
        )}
        <Text dimColor={!isAgentSelected}>{displaySessionId}</Text>
        <Text dimColor> {agent.messageCount} msgs</Text>
        {planFirstLine && (
          <>
            <Text dimColor> • </Text>
            <Text color="blue">
              {planFirstLine.slice(0, 40)}
              {planFirstLine.length > 40 ? "…" : ""}
            </Text>
          </>
        )}
      </Box>
      {interactions.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {interactions.map((i) => (
            <InteractionCard
              key={i.id}
              interaction={i}
              isSelected={i.id === selectedId}
              onRespond={(r) => onRespond(i.sessionName, i.id, r)}
              width={width - 4}
              onTabNext={onTabNext}
              onTabPrev={onTabPrev}
              onTypingChange={onTypingChange}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
