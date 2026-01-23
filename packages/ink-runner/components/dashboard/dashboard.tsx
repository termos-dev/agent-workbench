import { Box, Static, Text, useInput } from "ink";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTerminalSize } from "../shared/index.js";
import { HelpOverlay } from "./help-overlay.js";
import { InteractionCard } from "./interaction-card.js";
import type { DashboardInteraction } from "./types.js";
import { type AgentDisplayStatus, useAgents } from "./use-agents.js";
import {
  type InteractionResponse,
  useDashboardData,
} from "./use-dashboard-data.js";

// Args type for dependency injection (testability)
export interface DashboardArgs {
  currentProject?: string;
}

// Globals from dashboard-runner.ts (fallback when props not provided)
const getGlobalArgs = (): DashboardArgs =>
  ((globalThis as Record<string, unknown>).args as DashboardArgs) || {};

// Completed item for scrollback history
interface CompletedItem {
  id: string;
  timestamp: number;
  summary: string;
  type: "interaction" | "agent";
}

export interface DashboardProps {
  /** Dashboard args - if not provided, falls back to globalThis.args */
  args?: DashboardArgs;
}

export default function Dashboard(props?: DashboardProps) {
  // Support dependency injection via props for testability, fall back to globals
  const args = props?.args ?? getGlobalArgs();
  const { rows, columns } = useTerminalSize();

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [gPressed, setGPressed] = useState(false);
  const [isFeedbackTyping, setIsFeedbackTyping] = useState(false);

  // Completed items for scrollback history (using Static)
  const [completedItems, setCompletedItems] = useState<CompletedItem[]>([]);

  const showStatus = useCallback((msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(null), 2000);
  }, []);

  const handleNew = useCallback(
    (i: DashboardInteraction) => {
      showStatus(`New: ${i.title || i.component}`);
    },
    [showStatus]
  );

  const { allInteractions, loading, error, refresh, respondToInteraction } =
    useDashboardData({
      refreshInterval: 1000,
      onNewInteraction: handleNew,
    });

  const { agents } = useAgents({
    refreshInterval: 1000,
    interactions: allInteractions,
  });

  // Auto-detect: show all projects if multiple are active, otherwise filter to single active project
  const projectFilter = useMemo(() => {
    // Get unique active projects (from agents)
    const activeProjects = new Set(agents.map((a) => a.project));

    // Multiple projects active → show all
    if (activeProjects.size > 1) return null;

    // Single project active → filter to that project
    if (activeProjects.size === 1) {
      const [activeProject] = activeProjects;
      return activeProject;
    }

    // No agents → filter to current project
    return args.currentProject ?? null;
  }, [args.currentProject, agents]);

  const interactions = useMemo(
    () =>
      projectFilter
        ? allInteractions.filter((i) => i.project === projectFilter)
        : allInteractions,
    [allInteractions, projectFilter]
  );
  const filteredAgents = useMemo(
    () =>
      projectFilter
        ? agents.filter((a) => a.project === projectFilter)
        : agents,
    [agents, projectFilter]
  );

  // Group interactions by agent
  const { agentRows, orphans: _orphans } = useMemo(() => {
    const rows: Array<{
      agent: AgentDisplayStatus;
      interactions: DashboardInteraction[];
    }> = [];
    const sessionIds = new Set(filteredAgents.map((a) => a.sessionId));

    for (const agent of filteredAgents) {
      rows.push({
        agent,
        interactions: interactions.filter(
          (i) =>
            (i as { agentSessionId?: string }).agentSessionId ===
            agent.sessionId
        ),
      });
    }

    const orphans = interactions.filter((i) => {
      const sid = (i as { agentSessionId?: string }).agentSessionId;
      return !sid || !sessionIds.has(sid);
    });

    return { agentRows: rows, orphans };
  }, [filteredAgents, interactions]);

  const maxIdx = Math.max(0, interactions.length - 1);
  const selected = interactions[selectedIdx];

  useEffect(() => {
    if (selectedIdx > maxIdx) setSelectedIdx(Math.max(0, maxIdx));
  }, [selectedIdx, maxIdx]);

  const handleRespond = useCallback(
    async (session: string, id: string, response: InteractionResponse) => {
      try {
        // Find the interaction before responding so we can log it
        const interaction = interactions.find((i) => i.id === id);
        await respondToInteraction(session, id, response);

        // Add to completed items for scrollback
        if (interaction) {
          const summary = `✓ ${interaction.title || interaction.component}${
            typeof response === "boolean" ? (response ? " → Yes" : " → No") : ""
          }`;
          setCompletedItems((prev) => [
            ...prev,
            {
              id: `${id}-${Date.now()}`,
              timestamp: Date.now(),
              summary,
              type: "interaction",
            },
          ]);
        }

        showStatus("Responded");
        if (selectedIdx >= interactions.length - 1)
          setSelectedIdx(Math.max(0, selectedIdx - 1));
      } catch (e) {
        showStatus(`Failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [selectedIdx, interactions, respondToInteraction, showStatus]
  );

  // Tab navigation callbacks for ask components
  const handleTabNext = useCallback(() => {
    setSelectedIdx((i) => (i + 1) % (maxIdx + 1));
  }, [maxIdx]);

  const handleTabPrev = useCallback(() => {
    setSelectedIdx((i) => (i <= 0 ? maxIdx : i - 1));
  }, [maxIdx]);

  useInput((input, key) => {
    // Skip input handling if showing help
    if (showHelp) return;

    // Check if user is typing in a text input - skip character shortcuts
    const isTyping =
      selected?.component === "input" ||
      selected?.component === "ask" ||
      isFeedbackTyping;

    // Help - 'h' when not typing
    if (input === "h" && !isTyping) {
      setShowHelp(true);
      return;
    }

    // All character-based shortcuts below are skipped when typing
    if (!isTyping) {
      // Refresh
      if (input === "r") {
        refresh();
        showStatus("Refreshing...");
        return;
      }

      // Number keys 1-9 jump to interaction
      const num = Number.parseInt(input, 10);
      if (num >= 1 && num <= 9 && num <= interactions.length) {
        setSelectedIdx(num - 1);
        setGPressed(false);
        return;
      }

      // g + g = go to first
      if (input === "g") {
        if (gPressed) {
          setSelectedIdx(0);
          setSelectedAgentIdx(0);
          setGPressed(false);
        } else {
          setGPressed(true);
          setTimeout(() => setGPressed(false), 500);
        }
        return;
      }

      // G = go to last
      if (input === "G") {
        setSelectedIdx(maxIdx);
        setGPressed(false);
        return;
      }
    }

    // Home/End
    if (key.home) {
      setSelectedIdx(0);
      return;
    }
    if (key.end) {
      setSelectedIdx(maxIdx);
      return;
    }

    // Navigation - skip arrows for components that handle their own navigation
    const skipArrows =
      selected?.component === "ask" || selected?.component === "checklist";
    const askMultiQ =
      selected?.component === "ask" &&
      ((selected.args as { schema?: { questions?: unknown[] } })?.schema
        ?.questions?.length || 0) > 1;

    if (key.tab && !askMultiQ) {
      setSelectedIdx((i) =>
        key.shift ? (i <= 0 ? maxIdx : i - 1) : (i + 1) % (maxIdx + 1)
      );
      return;
    }

    if (selected?.component !== "input") {
      if (key.upArrow && !skipArrows) {
        setSelectedIdx((i) => Math.max(0, i - 1));
      }
      if (key.downArrow && !skipArrows) {
        setSelectedIdx((i) => Math.min(maxIdx, i + 1));
      }
    }

    setGPressed(false);
  });

  if (loading)
    return (
      <Box padding={1}>
        <Text>Loading...</Text>
      </Box>
    );
  if (error)
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">{error}</Text>
        <Text dimColor>r retry</Text>
      </Box>
    );

  const currentPath = process.cwd();
  const activePath =
    filteredAgents.find((a) => a.project === projectFilter)?.projectPath ||
    currentPath;

  // Empty state - no agents at all
  if (agents.length === 0 && allInteractions.length === 0) {
    return (
      <Box flexDirection="column" width={columns} height={rows} paddingTop={2}>
        <Box flexDirection="column" padding={1}>
          <Text bold>Termos Dashboard</Text>
          <Text dimColor>No active agents</Text>
          <Text dimColor>Start a Claude session to see activity here...</Text>
        </Box>
        <Box flexGrow={1} />
        {currentPath && (
          <Box>
            <Text dimColor>{currentPath}</Text>
          </Box>
        )}
        <Box>
          <Text dimColor>r refresh h help</Text>
        </Box>
      </Box>
    );
  }

  // Empty state - agents exist but none in current project
  if (filteredAgents.length === 0 && agents.length > 0) {
    return (
      <Box flexDirection="column" width={columns} height={rows} paddingTop={2}>
        <Box flexDirection="column" padding={1}>
          <Text bold>Termos Dashboard</Text>
          <Text dimColor>
            No active agents{projectFilter ? ` in ${projectFilter}` : ""}
          </Text>
          <Text dimColor>
            Use --global to see {agents.length} agent
            {agents.length !== 1 ? "s" : ""}
          </Text>
        </Box>
        <Box flexGrow={1} />
        {currentPath && (
          <Box>
            <Text dimColor>{currentPath}</Text>
          </Box>
        )}
        <Box>
          <Text dimColor>r refresh h help</Text>
        </Box>
      </Box>
    );
  }

  // Help overlay
  if (showHelp) {
    return (
      <Box
        flexDirection="column"
        width={columns}
        height={rows}
        alignItems="center"
        justifyContent="center"
      >
        <HelpOverlay onClose={() => setShowHelp(false)} />
      </Box>
    );
  }

  return (
    <>
      {/* STATIC: Completed items preserved in scrollback */}
      <Static items={completedItems}>
        {(item) => (
          <Box key={item.id}>
            <Text dimColor>
              {new Date(item.timestamp).toLocaleTimeString()} {item.summary}
            </Text>
          </Box>
        )}
      </Static>

      {/* DYNAMIC: Current state updates in place */}
      <Box flexDirection="column" width={columns} height={rows} paddingTop={2}>
        <Box flexDirection="column" flexGrow={1} overflow="hidden">
          {/* Unified inbox: show all interactions from all agents */}
          {interactions.length > 0 ? (
            <Box flexDirection="column">
              {interactions.map((i) => {
                // Find which agent this interaction belongs to
                const agent = filteredAgents.find(
                  (a) =>
                    a.sessionId ===
                    (i as { agentSessionId?: string }).agentSessionId
                );
                const agentLabel = agent
                  ? `${agent.id}${agentRows.length > 1 ? ` (${agent.project})` : ""}`
                  : i.project;
                return (
                  <Box key={i.id} flexDirection="column">
                    {/* Show agent label for context */}
                    {agentRows.length > 1 && (
                      <Text dimColor color="blue">
                        └─ {agentLabel}
                      </Text>
                    )}
                    <InteractionCard
                      interaction={i}
                      isSelected={i.id === selected?.id}
                      onRespond={(r) => handleRespond(i.sessionName, i.id, r)}
                      width={columns - 4}
                      onTabNext={handleTabNext}
                      onTabPrev={handleTabPrev}
                      onTypingChange={setIsFeedbackTyping}
                    />
                  </Box>
                );
              })}
            </Box>
          ) : (
            <Box flexDirection="column" padding={1}>
              <Text dimColor>No pending interactions</Text>
            </Box>
          )}
        </Box>

        {/* Activity/status message above separator */}
        {(() => {
          // Show status message if set, otherwise show agent activity
          if (status) {
            return (
              <Box>
                <Text color="yellow">{status}</Text>
              </Box>
            );
          }
          // Show activity status for selected interaction's agent
          const selectedAgentId = selected
            ? (selected as { agentSessionId?: string }).agentSessionId
            : null;
          const selectedAgentRow = selectedAgentId
            ? agentRows.find(({ agent }) => agent.sessionId === selectedAgentId)
            : agentRows[0];
          const agent = selectedAgentRow?.agent;
          if (agent) {
            const activityText =
              agent.title ||
              (agent.displayStatus === "running"
                ? "Working..."
                : agent.displayStatus === "thinking"
                  ? "Thinking..."
                  : null);
            if (activityText) {
              const activityColor =
                agent.displayStatus === "running"
                  ? "cyan"
                  : agent.displayStatus === "thinking"
                    ? "magenta"
                    : agent.displayStatus === "waiting"
                      ? "yellow"
                      : "gray";
              return (
                <Box>
                  <Text color={activityColor} italic>
                    {activityText}
                  </Text>
                </Box>
              );
            }
          }
          return null;
        })()}

        {/* Agent status summary line */}
        {agentRows.length > 0 && (
          <>
            <Box>
              <Text dimColor>{"─".repeat(Math.max(0, columns - 2))}</Text>
            </Box>
            <Box gap={2} flexWrap="wrap">
              {agentRows.map(({ agent }) => {
                const statusColor =
                  agent.displayStatus === "running"
                    ? "cyan"
                    : agent.displayStatus === "thinking"
                      ? "magenta"
                      : agent.displayStatus === "waiting"
                        ? "yellow"
                        : "gray";
                const statusIcon =
                  agent.displayStatus === "waiting" ? "!" : "●";
                return (
                  <Box key={agent.sessionId}>
                    <Text color={statusColor}>{statusIcon} </Text>
                    <Text color={statusColor}>{agent.id.slice(0, 8)}</Text>
                    {!projectFilter && <Text dimColor> ({agent.project})</Text>}
                  </Box>
                );
              })}
            </Box>
          </>
        )}

        <Box>
          {interactions.length > 0 && (
            <Text color="yellow">{interactions.length} pending</Text>
          )}
          {interactions.length > 0 && completedItems.length > 0 && (
            <Text> • </Text>
          )}
          {completedItems.length > 0 && (
            <Text color="green">{completedItems.length} done</Text>
          )}
          {activePath && <Text dimColor> {activePath}</Text>}
        </Box>

        <Box>
          <Text dimColor>↑↓ navigate h help</Text>
          {gPressed && (
            <Text color="cyan"> [g pressed - press g again for top]</Text>
          )}
        </Box>
      </Box>
    </>
  );
}
