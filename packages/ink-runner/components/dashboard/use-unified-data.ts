import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardInteraction, ProjectInteractions } from "./types.js";
import type { AgentDisplayStatus } from "./use-agents.js";
import type { InteractionResponse } from "./use-dashboard-data.js";

/**
 * Polling intervals for different states
 */
const POLLING_INTERVALS = {
  /** Agents are actively running */
  ACTIVE: 500,
  /** Interactions are pending (waiting state) */
  PENDING: 1000,
  /** Everything is idle */
  IDLE: 2000,
} as const;

interface UseUnifiedDataOptions {
  /** Callback when a new interaction is detected */
  onNewInteraction?: (interaction: DashboardInteraction) => void;
}

interface UseUnifiedDataResult {
  /** All project interactions */
  projects: ProjectInteractions[];
  /** Flat list of all interactions */
  allInteractions: DashboardInteraction[];
  /** All active agents */
  agents: AgentDisplayStatus[];
  /** Initial loading state */
  loading: boolean;
  /** Error message if any */
  error: string | null;
  /** Manual refresh trigger */
  refresh: () => Promise<void>;
  /** Respond to an interaction */
  respondToInteraction: (
    sessionName: string,
    interactionId: string,
    response: InteractionResponse
  ) => Promise<void>;
  /** Send a message to an agent */
  sendMessage: (
    sessionName: string,
    text: string,
    agentSessionId?: string
  ) => Promise<void>;
}

// Module types for dynamic imports
type ScannerModule = {
  scanAllSessions: () => Promise<ProjectInteractions[]>;
};

type EventsModule = {
  writeEvent: (sessionName: string, event: Record<string, unknown>) => void;
};

type RuntimeModule = {
  getActiveSessions: (thresholdMs?: number) => Promise<
    Array<{
      sessionId: string;
      projectPath: string;
      project: string;
      modified: string;
      messageCount: number;
      gitBranch?: string;
      title?: string;
      firstPrompt?: string;
      status: "running" | "idle" | "thinking";
      source: "index" | "marker" | "both";
    }>
  >;
  pathToSessionName: (cwd: string) => string;
  getPlanFileForSession: (
    sessionId: string,
    projectPath: string
  ) => Promise<string | undefined>;
};

/**
 * Compare two arrays of projects by stable keys.
 */
function hasProjectsChanged(
  prev: ProjectInteractions[],
  next: ProjectInteractions[]
): boolean {
  if (prev.length !== next.length) return true;

  const prevMap = new Map<string, ProjectInteractions>();
  for (const p of prev) {
    prevMap.set(p.project, p);
  }

  for (const nextProj of next) {
    const prevProj = prevMap.get(nextProj.project);
    if (!prevProj) return true;
    if (prevProj.interactions.length !== nextProj.interactions.length)
      return true;

    const prevIds = new Set(prevProj.interactions.map((i) => i.id));
    for (const i of nextProj.interactions) {
      if (!prevIds.has(i.id)) return true;
    }
  }

  return false;
}

/**
 * Compare two arrays of agents by stable keys.
 */
function hasAgentsChanged(
  prev: AgentDisplayStatus[],
  next: AgentDisplayStatus[]
): boolean {
  if (prev.length !== next.length) return true;

  const prevMap = new Map<string, AgentDisplayStatus>();
  for (const a of prev) {
    prevMap.set(a.sessionId, a);
  }

  for (const nextAgent of next) {
    const prevAgent = prevMap.get(nextAgent.sessionId);
    if (!prevAgent) return true;

    if (
      prevAgent.displayStatus !== nextAgent.displayStatus ||
      prevAgent.messageCount !== nextAgent.messageCount ||
      prevAgent.title !== nextAgent.title ||
      prevAgent.planFile !== nextAgent.planFile
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Unified data hook that consolidates dashboard data and agent polling.
 *
 * Features:
 * - Single polling loop instead of multiple independent loops
 * - Adaptive polling intervals based on system state
 * - State change detection to avoid unnecessary re-renders
 * - Error isolation between data sources
 */
export function useUnifiedData(
  options: UseUnifiedDataOptions = {}
): UseUnifiedDataResult {
  const { onNewInteraction } = options;

  const [projects, setProjects] = useState<ProjectInteractions[]>([]);
  const [agents, setAgents] = useState<AgentDisplayStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs for module caching
  const scannerRef = useRef<ScannerModule | null>(null);
  const eventsRef = useRef<EventsModule | null>(null);
  const runtimeRef = useRef<RuntimeModule | null>(null);

  // Refs for state comparison
  const prevProjectsRef = useRef<ProjectInteractions[]>([]);
  const prevAgentsRef = useRef<AgentDisplayStatus[]>([]);
  const prevInteractionIds = useRef<Set<string>>(new Set());

  // Current polling interval
  const pollingIntervalRef = useRef(POLLING_INTERVALS.IDLE);

  // Load modules
  const loadScanner = useCallback(async (): Promise<ScannerModule | null> => {
    if (scannerRef.current) return scannerRef.current;
    try {
      const scanner = (await import(
        "../../../../src/session-scanner.js"
      )) as ScannerModule;
      scannerRef.current = scanner;
      return scanner;
    } catch {
      return null;
    }
  }, []);

  const loadEvents = useCallback(async (): Promise<EventsModule | null> => {
    if (eventsRef.current) return eventsRef.current;
    try {
      const events = (await import(
        "../../../../src/events.js"
      )) as EventsModule;
      eventsRef.current = events;
      return events;
    } catch {
      return null;
    }
  }, []);

  const loadRuntime = useCallback(async (): Promise<RuntimeModule | null> => {
    if (runtimeRef.current) return runtimeRef.current;
    try {
      const runtime = (await import(
        "../../../../src/runtime.js"
      )) as RuntimeModule;
      runtimeRef.current = runtime;
      return runtime;
    } catch {
      return null;
    }
  }, []);

  // Flatten all interactions
  const allInteractions = projects.flatMap((p) => p.interactions);

  // Unified refresh function
  const refresh = useCallback(async () => {
    // Load all modules in parallel
    const [scanner, runtime] = await Promise.all([
      loadScanner(),
      loadRuntime(),
      loadEvents(),
    ]);

    let newError: string | null = null;

    // Fetch projects/interactions
    let newProjects: ProjectInteractions[] = prevProjectsRef.current;
    if (scanner) {
      try {
        newProjects = await scanner.scanAllSessions();

        // Detect new interactions
        const currentIds = new Set<string>();
        for (const project of newProjects) {
          for (const interaction of project.interactions) {
            currentIds.add(interaction.id);
            if (
              !prevInteractionIds.current.has(interaction.id) &&
              onNewInteraction
            ) {
              onNewInteraction(interaction);
            }
          }
        }
        prevInteractionIds.current = currentIds;

        // Only update state if changed
        if (hasProjectsChanged(prevProjectsRef.current, newProjects)) {
          prevProjectsRef.current = newProjects;
          setProjects(newProjects);
        }
      } catch (err) {
        newError = `Scan failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    // Fetch agents
    let newAgents: AgentDisplayStatus[] = prevAgentsRef.current;
    if (runtime) {
      try {
        const sessions = await runtime.getActiveSessions();

        // Build interactions set for quick lookup
        const allInteractionsList = newProjects.flatMap((p) => p.interactions);

        // Process sessions in parallel
        const agentStatusPromises = sessions.map(async (session) => {
          const sessionName =
            session.projectPath !== "unknown"
              ? runtime.pathToSessionName(session.projectPath)
              : session.sessionId;

          // Check for pending interactions
          const hasWaiting = allInteractionsList.some(
            (i) =>
              i.sessionName === sessionName || i.project === session.project
          );

          // Load plan file
          let planFile: string | undefined;
          if (session.projectPath && session.projectPath !== "unknown") {
            planFile = await runtime.getPlanFileForSession(
              session.sessionId,
              session.projectPath
            );
          }

          return {
            id: session.sessionId.substring(0, 8),
            sessionId: session.sessionId,
            project: session.project,
            projectPath: session.projectPath,
            displayStatus: hasWaiting ? "waiting" : session.status,
            modified: session.modified,
            messageCount: session.messageCount,
            gitBranch: session.gitBranch,
            title: session.title,
            firstPrompt: session.firstPrompt,
            source: session.source,
            planFile,
          } as AgentDisplayStatus;
        });

        newAgents = await Promise.all(agentStatusPromises);
        newAgents.sort((a, b) => a.project.localeCompare(b.project));

        // Only update state if changed
        if (hasAgentsChanged(prevAgentsRef.current, newAgents)) {
          prevAgentsRef.current = newAgents;
          setAgents(newAgents);
        }
      } catch (err) {
        newError =
          newError ||
          `Sessions failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    // Update adaptive polling interval
    const hasRunningAgents = newAgents.some(
      (a) => a.displayStatus === "running" || a.displayStatus === "thinking"
    );
    const hasPendingInteractions = newProjects.some(
      (p) => p.interactions.length > 0
    );

    if (hasRunningAgents) {
      pollingIntervalRef.current = POLLING_INTERVALS.ACTIVE;
    } else if (hasPendingInteractions) {
      pollingIntervalRef.current = POLLING_INTERVALS.PENDING;
    } else {
      pollingIntervalRef.current = POLLING_INTERVALS.IDLE;
    }

    setError(newError);
    setLoading(false);
  }, [loadScanner, loadRuntime, loadEvents, onNewInteraction]);

  // Response handler
  const respondToInteraction = useCallback(
    async (
      sessionName: string,
      interactionId: string,
      response: InteractionResponse
    ) => {
      const events = await loadEvents();
      if (!events) {
        throw new Error("Events module not loaded");
      }

      events.writeEvent(sessionName, {
        type: "result",
        id: interactionId,
        action: response.action,
        answers: response.answers,
        result: response.value,
        feedback: response.feedback,
      });

      await refresh();
    },
    [loadEvents, refresh]
  );

  // Message sender
  const sendMessage = useCallback(
    async (sessionName: string, text: string, agentSessionId?: string) => {
      const events = await loadEvents();
      if (!events) {
        throw new Error("Events module not loaded");
      }

      const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      events.writeEvent(sessionName, {
        type: "created",
        id,
        component: "message",
        title: "User Message",
        args: { text },
        agentSessionId,
      });

      await refresh();
    },
    [loadEvents, refresh]
  );

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Adaptive polling
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleNext = () => {
      timeoutId = setTimeout(async () => {
        await refresh();
        scheduleNext();
      }, pollingIntervalRef.current);
    };

    scheduleNext();

    return () => {
      clearTimeout(timeoutId);
    };
  }, [refresh]);

  return {
    projects,
    allInteractions,
    agents,
    loading,
    error,
    refresh,
    respondToInteraction,
    sendMessage,
  };
}
