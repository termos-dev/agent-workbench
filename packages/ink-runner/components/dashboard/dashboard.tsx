/**
 * Main Dashboard component - Interactive TUI for Claude Code.
 */

import * as fs from "node:fs";
import { Box, Text, useInput } from "ink";
import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTerminalSize } from "../shared/index.js";
import { AgentRow } from "./agent-row.js";
import { FocusedSessionView } from "./focused-session-view.js";
import { HelpOverlay } from "./help-overlay.js";
import { InteractionCard } from "./interaction-card.js";
import type { DashboardInteraction } from "./types.js";
import { type AgentDisplayStatus, useAgents } from "./use-agents.js";
import {
  type InteractionResponse,
  useDashboardData,
} from "./use-dashboard-data.js";

// Error boundary to catch React rendering errors
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<
  {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error) => void;
  },
  ErrorBoundaryState
> {
  constructor(props: {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error) => void;
  }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log to file for debugging
    try {
      const msg = `React error: ${error.message}\n${error.stack}\nComponent stack: ${errorInfo.componentStack}`;
      fs.appendFileSync(
        "/tmp/termos-crash.log",
        `${new Date().toISOString()} ${msg}\n`
      );
    } catch {}
    this.props.onError?.(error);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <Box flexDirection="column" padding={1}>
            <Text color="red">Component Error</Text>
            <Text dimColor>{this.state.error?.message || "Unknown error"}</Text>
            <Text dimColor>Check /tmp/termos-crash.log for details</Text>
          </Box>
        )
      );
    }
    return this.props.children;
  }
}

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

  // Focused session state
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);
  const [selectedAgentIdx, setSelectedAgentIdx] = useState(0);

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

  const {
    allInteractions,
    loading,
    error,
    refresh,
    respondToInteraction,
    sendMessage,
  } = useDashboardData({
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

  const maxIdx = Math.max(0, interactions.length - 1);
  const selected = interactions[selectedIdx];

  useEffect(() => {
    if (selectedIdx > maxIdx) setSelectedIdx(Math.max(0, maxIdx));
  }, [selectedIdx, maxIdx]);

  const handleRespond = useCallback(
    async (session: string, id: string, response: InteractionResponse) => {
      try {
        await respondToInteraction(session, id, response);
        showStatus("Responded");
        if (selectedIdx >= interactions.length - 1)
          setSelectedIdx(Math.max(0, selectedIdx - 1));
      } catch (e) {
        showStatus(`Failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [selectedIdx, interactions.length, respondToInteraction, showStatus]
  );

  const handleSendMessage = useCallback(
    async (sessionName: string, text: string, agentSessionId?: string) => {
      try {
        await sendMessage(sessionName, text, agentSessionId);
        showStatus("Message sent");
      } catch (e) {
        showStatus(
          `Failed to send: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    },
    [sendMessage, showStatus]
  );

  // Tab navigation callbacks for ask components
  const handleTabNext = useCallback(() => {
    setSelectedIdx((i) => (i + 1) % (maxIdx + 1));
  }, [maxIdx]);

  const handleTabPrev = useCallback(() => {
    setSelectedIdx((i) => (i <= 0 ? maxIdx : i - 1));
  }, [maxIdx]);

  // Get focused agent and its interactions
  const focusedAgent = useMemo(
    () =>
      focusedSessionId
        ? filteredAgents.find((a) => a.sessionId === focusedSessionId)
        : null,
    [focusedSessionId, filteredAgents]
  );

  const focusedInteractions = useMemo(
    () =>
      focusedAgent
        ? interactions.filter(
            (i) =>
              (i as { agentSessionId?: string }).agentSessionId ===
              focusedAgent.sessionId
          )
        : [],
    [focusedAgent, interactions]
  );

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

    // Skip input handling if we're in focused session mode (FocusedSessionView handles its own input)
    if (focusedSessionId) return;

    // Help - skip when user is typing in input components
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

    // Enter to focus selected agent (when no interaction is selected or when agents exist)
    if (key.return && filteredAgents.length > 0 && !selected) {
      const agentToFocus = filteredAgents[selectedAgentIdx];
      if (agentToFocus) {
        setFocusedSessionId(agentToFocus.sessionId);
        showStatus(`Focused: ${agentToFocus.project}`);
      }
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

    // Navigation
    const skipArrows = selected?.component === "ask";
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

  // Focused session view
  if (focusedSessionId && focusedAgent) {
    // Get sessionName for response handling
    const sessionName =
      focusedInteractions[0]?.sessionName ||
      (focusedAgent.projectPath
        ? focusedAgent.projectPath.replace(/[/\\]/g, "-").replace(/^-/, "")
        : "");

    return (
      <ErrorBoundary
        onError={() => setFocusedSessionId(null)}
        fallback={
          <Box flexDirection="column" padding={1}>
            <Text color="red">Error loading focused view</Text>
            <Text dimColor>Press Esc to return</Text>
          </Box>
        }
      >
        <FocusedSessionView
          agent={focusedAgent}
          interactions={focusedInteractions}
          onRespond={(sName, id, r) => handleRespond(sName, id, r)}
          onBack={() => setFocusedSessionId(null)}
          onSendMessage={
            sessionName
              ? (text) =>
                  handleSendMessage(sessionName, text, focusedAgent.sessionId)
              : undefined
          }
        />
      </ErrorBoundary>
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
    <Box flexDirection="column" width={columns} height={rows}>
      <Box flexDirection="column" flexGrow={1} paddingX={1} overflow="hidden">
        {agentRows.map(({ agent, interactions: ints }, agentIdx) => {
          const isAgentSelected = agentIdx === selectedAgentIdx;
          return (
            <AgentRow
              key={agent.sessionId}
              agent={agent}
              interactions={ints}
              selectedId={selected?.id}
              onRespond={handleRespond}
              width={columns - 4}
              onTabNext={handleTabNext}
              onTabPrev={handleTabPrev}
              isAgentSelected={isAgentSelected}
              onFocus={() => setFocusedSessionId(agent.sessionId)}
            />
          );
        })}
        {orphans.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            {orphans.map((i) => (
              <InteractionCard
                key={i.id}
                interaction={i}
                isSelected={i.id === selected?.id}
                onRespond={(r) => handleRespond(i.sessionName, i.id, r)}
                width={columns - 6}
                onTabNext={handleTabNext}
                onTabPrev={handleTabPrev}
              />
            ))}
          </Box>
        )}
      </Box>

      {status && (
        <Box paddingX={1}>
          <Text color="yellow">{status}</Text>
        </Box>
      )}

      <Box paddingX={1}>
        <Text bold>{filteredAgents.length} Agents</Text>
        {interactions.length > 0 && (
          <Text color="yellow"> • {interactions.length} pending</Text>
        )}
        {activePath && <Text dimColor> {activePath}</Text>}
      </Box>

      <Box paddingX={1}>
        <Text dimColor>
          ↑↓ navigate {hints}
          {filteredAgents.length > 0 && !selected ? "Enter focus  " : ""}h help
        </Text>
        {gPressed && (
          <Text color="cyan"> [g pressed - press g again for top]</Text>
        )}
      </Box>
    </Box>
  );
}
