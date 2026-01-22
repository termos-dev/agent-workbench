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

const MAX_VISIBLE = 3;

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
}: AgentRowProps) {
  const statusColor =
    agent.displayStatus === "running"
      ? "cyan"
      : agent.displayStatus === "thinking"
        ? "magenta"
        : agent.displayStatus === "waiting"
          ? "yellow"
          : "gray";
  const selIdx = interactions.findIndex((i) => i.id === selectedId);

  let visible = interactions;
  let hidden = 0;
  if (interactions.length > MAX_VISIBLE) {
    const start = selIdx >= MAX_VISIBLE ? Math.max(0, selIdx - 1) : 0;
    visible = interactions.slice(start, start + MAX_VISIBLE);
    hidden = interactions.length - MAX_VISIBLE;
  }

  // Use title as the status indicator (more user-friendly than idle/running)
  const displayTitle =
    agent.title ||
    (agent.displayStatus === "running"
      ? "Working..."
      : agent.displayStatus === "thinking"
        ? "Thinking..."
        : "");

  // Get first line of plan file to display instead of icon
  const planFirstLine = getPlanFirstLine(agent.planFile);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={isAgentSelected ? "cyan" : statusColor}>
          {isAgentSelected ? "> " : "  "}
        </Text>
        <Text bold>{agent.project}</Text>
        <Text> </Text>
        <Text dimColor>{agent.sessionId}</Text>
      </Box>
      {planFirstLine && (
        <Box marginLeft={2}>
          <Text color="blue">{planFirstLine}</Text>
        </Box>
      )}
      {displayTitle && (
        <Box marginLeft={2}>
          <Text color={statusColor} italic>
            {displayTitle}
          </Text>
          <Text dimColor> {agent.messageCount} messages</Text>
        </Box>
      )}
      {interactions.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {visible.map((i) => (
            <InteractionCard
              key={i.id}
              interaction={i}
              isSelected={i.id === selectedId}
              onRespond={(r) => onRespond(i.sessionName, i.id, r)}
              width={width - 4}
              onTabNext={onTabNext}
              onTabPrev={onTabPrev}
            />
          ))}
          {hidden > 0 && <Text dimColor> +{hidden} more</Text>}
        </Box>
      )}
    </Box>
  );
}
