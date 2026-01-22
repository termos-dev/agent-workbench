import { Box, Static, Text, useInput } from "ink";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTerminalSize } from "../shared/index.js";
import { AgentRow } from "./agent-row.js";
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
  global?: boolean;
  currentProject?: string;
}

// Globals from dashboard-runner.ts (fallback when props not provided)
const getGlobalArgs = (): DashboardArgs =>
  ((globalThis as Record<string, unknown>).args as DashboardArgs) || {};

// Interactive components that need user response
const INTERACTIVE = new Set([
  "confirm",
  "select",
  "checklist",
  "ask",
  "input",
  "card",
]);
const isInteractive = (c: string) => INTERACTIVE.has(c);

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

  const [selectedAgentIdx, setSelectedAgentIdx] = useState(0);

  // Tab-based agent selection
  const [activeAgent, setActiveAgent] = useState<string | null>(null);

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

  // Filter by current project in local mode
  const projectFilter = !args.global ? args.currentProject : null;
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
  const { agentRows, orphans } = useMemo(() => {
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

  // Find active agent's data
  const activeAgentData = useMemo(
    () => agentRows.find(({ agent }) => agent.sessionId === activeAgent),
    [agentRows, activeAgent]
  );

  // Initialize activeAgent when agents become available
  useEffect(() => {
    if (agentRows.length > 0 && !activeAgent) {
      setActiveAgent(agentRows[0].agent.sessionId);
    }
    // Clear activeAgent if it no longer exists
    if (
      activeAgent &&
      !agentRows.some(({ agent }) => agent.sessionId === activeAgent)
    ) {
      setActiveAgent(agentRows[0]?.agent.sessionId ?? null);
    }
  }, [agentRows, activeAgent]);

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

  // Keep selectedAgentIdx in bounds
  const maxAgentIdx = Math.max(0, filteredAgents.length - 1);
  useEffect(() => {
    if (selectedAgentIdx > maxAgentIdx) {
      setSelectedAgentIdx(Math.max(0, maxAgentIdx));
    }
  }, [selectedAgentIdx, maxAgentIdx]);

  useInput((input, key) => {
    // Skip input handling if showing help
    if (showHelp) return;

    // Help - 'h' when not typing
    const isTyping =
      selected?.component === "input" || selected?.component === "ask";
    if (input === "h" && !isTyping) {
      setShowHelp(true);
      return;
    }

    // Refresh
    if (input === "r") {
      refresh();
      showStatus("Refreshing...");
      return;
    }

    // Agent switching with [ and ]
    if (input === "[" && agentRows.length > 1) {
      const currentIdx = agentRows.findIndex(
        ({ agent }) => agent.sessionId === activeAgent
      );
      const prevIdx = currentIdx <= 0 ? agentRows.length - 1 : currentIdx - 1;
      setActiveAgent(agentRows[prevIdx].agent.sessionId);
      return;
    }
    if (input === "]" && agentRows.length > 1) {
      const currentIdx = agentRows.findIndex(
        ({ agent }) => agent.sessionId === activeAgent
      );
      const nextIdx = (currentIdx + 1) % agentRows.length;
      setActiveAgent(agentRows[nextIdx].agent.sessionId);
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
      setSelectedAgentIdx(maxAgentIdx);
      setGPressed(false);
      return;
    }

    // Home/End
    if (key.home) {
      setSelectedIdx(0);
      setSelectedAgentIdx(0);
      return;
    }
    if (key.end) {
      setSelectedIdx(maxIdx);
      setSelectedAgentIdx(maxAgentIdx);
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
        // Also navigate agents when no interactions
        if (interactions.length === 0) {
          setSelectedAgentIdx((i) => Math.max(0, i - 1));
        }
      }
      if (key.downArrow && !skipArrows) {
        setSelectedIdx((i) => Math.min(maxIdx, i + 1));
        // Also navigate agents when no interactions
        if (interactions.length === 0) {
          setSelectedAgentIdx((i) => Math.min(maxAgentIdx, i + 1));
        }
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

  const currentPath = !args.global ? process.cwd() : null;
  const activePath =
    filteredAgents.find((a) => a.project === projectFilter)?.projectPath ||
    currentPath;

  // Empty state - no agents at all
  if (agents.length === 0 && allInteractions.length === 0) {
    return (
      <Box flexDirection="column" width={columns} height={rows}>
        <Box flexDirection="column" padding={1}>
          <Text bold>Termos Dashboard</Text>
          <Text dimColor>No active agents</Text>
          <Text dimColor>Start a Claude session to see activity here...</Text>
        </Box>
        <Box flexGrow={1} />
        {currentPath && (
          <Box paddingX={1}>
            <Text dimColor>{currentPath}</Text>
          </Box>
        )}
        <Box paddingX={1}>
          <Text dimColor>r refresh h help</Text>
        </Box>
      </Box>
    );
  }

  // Empty state - agents exist but none in current project
  if (filteredAgents.length === 0 && agents.length > 0) {
    return (
      <Box flexDirection="column" width={columns} height={rows}>
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
          <Box paddingX={1}>
            <Text dimColor>{currentPath}</Text>
          </Box>
        )}
        <Box paddingX={1}>
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

  // Context-aware hints
  const hints = selected
    ? selected.component === "confirm"
      ? "y/n respond  "
      : selected.component === "select"
        ? "h/l ←→ select  Enter confirm  "
        : selected.component === "ask"
          ? "↑↓ options  Tab questions  Space select  Enter submit  "
          : selected.component === "input"
            ? "Enter submit  "
            : isInteractive(selected.component)
              ? ""
              : "d dismiss  "
    : "";

  return (
    <>
      {/* STATIC: Completed items preserved in scrollback */}
      <Static items={completedItems}>
        {(item) => (
          <Box key={item.id} paddingX={1}>
            <Text dimColor>
              {new Date(item.timestamp).toLocaleTimeString()} {item.summary}
            </Text>
          </Box>
        )}
      </Static>

      {/* DYNAMIC: Current state updates in place */}
      <Box flexDirection="column" width={columns} height={rows}>
        <Box flexDirection="column" flexGrow={1} paddingX={1} overflow="hidden">
          {/* Show active agent's interactions */}
          {activeAgentData && activeAgentData.interactions.length > 0 && (
            <Box flexDirection="column">
              {activeAgentData.interactions.map((i) => (
                <InteractionCard
                  key={i.id}
                  interaction={i}
                  isSelected={i.id === selected?.id}
                  onRespond={(r) => handleRespond(i.sessionName, i.id, r)}
                  width={columns - 4}
                  onTabNext={handleTabNext}
                  onTabPrev={handleTabPrev}
                />
              ))}
            </Box>
          )}
          {/* Orphan interactions */}
          {orphans.length > 0 && (
            <Box
              flexDirection="column"
              marginTop={activeAgentData?.interactions.length ? 1 : 0}
            >
              {orphans.map((i) => (
                <InteractionCard
                  key={i.id}
                  interaction={i}
                  isSelected={i.id === selected?.id}
                  onRespond={(r) => handleRespond(i.sessionName, i.id, r)}
                  width={columns - 4}
                  onTabNext={handleTabNext}
                  onTabPrev={handleTabPrev}
                />
              ))}
            </Box>
          )}
        </Box>

        {/* Activity/status message above separator */}
        {(() => {
          // Show status message if set, otherwise show agent activity
          if (status) {
            return (
              <Box paddingX={1}>
                <Text color="yellow">{status}</Text>
              </Box>
            );
          }
          // Show agent activity status
          const agent = activeAgentData?.agent;
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
                <Box paddingX={1}>
                  <Text color={activityColor} italic>
                    {activityText}
                  </Text>
                </Box>
              );
            }
          }
          return null;
        })()}

        {/* Agent status line */}
        {agentRows.length > 0 && (
          <>
            <Box paddingX={1}>
              <Text dimColor>{"─".repeat(Math.max(0, columns - 2))}</Text>
            </Box>
            {activeAgentData && (
              <Box paddingX={1}>
                <AgentRow
                  agent={activeAgentData.agent}
                  interactions={[]}
                  selectedId={undefined}
                  onRespond={handleRespond}
                  width={columns - 4}
                  isAgentSelected={true}
                  showProject={!!args.global}
                />
              </Box>
            )}
          </>
        )}

        <Box paddingX={1}>
          {agentRows.length > 1 ? (
            <>
              <Text bold>
                [
                {agentRows.findIndex(
                  ({ agent }) => agent.sessionId === activeAgent
                ) + 1}
                /{agentRows.length}]
              </Text>
              <Text> </Text>
            </>
          ) : null}
          {activeAgentData && activeAgentData.interactions.length > 0 && (
            <Text color="yellow">
              {activeAgentData.interactions.length} pending
            </Text>
          )}
          {activeAgentData &&
            activeAgentData.interactions.length > 0 &&
            completedItems.length > 0 && <Text> • </Text>}
          {completedItems.length > 0 && (
            <Text color="green">{completedItems.length} done</Text>
          )}
          {activePath && <Text dimColor> {activePath}</Text>}
        </Box>

        <Box paddingX={1}>
          <Text dimColor>
            {agentRows.length > 1 ? "[] switch  " : ""}
            ↑↓ navigate {hints}h help
          </Text>
          {gPressed && (
            <Text color="cyan"> [g pressed - press g again for top]</Text>
          )}
        </Box>
      </Box>
    </>
  );
}
