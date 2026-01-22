import { useState, useEffect, useCallback, useRef } from 'react';
import type { DashboardInteraction } from './types.js';

/**
 * Agent display status for dashboard
 */
export interface AgentDisplayStatus {
  id: string;              // Short ID (first 8 chars)
  sessionId: string;       // Full session ID
  project: string;         // Project name
  projectPath: string;     // Full project path
  displayStatus: 'running' | 'idle' | 'thinking' | 'waiting';
  modified: string;        // Last activity timestamp
  messageCount: number;
  gitBranch?: string;
  title?: string;          // Short title (set via termos set-title)
  source: 'index' | 'marker' | 'both';
  planFile?: string;       // Associated plan file path (from session transcript)
}

interface UseAgentsOptions {
  refreshInterval?: number;
  interactions?: DashboardInteraction[];
}

interface UseAgentsResult {
  agents: AgentDisplayStatus[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

// Type for dynamic import
type RuntimeModule = {
  getActiveSessions: (thresholdMs?: number) => Array<{
    sessionId: string;
    projectPath: string;
    project: string;
    modified: string;
    messageCount: number;
    gitBranch?: string;
    title?: string;
    status: 'running' | 'idle' | 'thinking';
    source: 'index' | 'marker' | 'both';
  }>;
  pathToSessionName: (cwd: string) => string;
  getPlanFileForSession: (sessionId: string, projectPath: string) => string | undefined;
};

/**
 * Hook to get active agents with polling.
 * Uses hybrid detection: Claude's sessions-index + our idle markers.
 */
export function useAgents(options: UseAgentsOptions = {}): UseAgentsResult {
  const { refreshInterval = 1000, interactions = [] } = options;

  const [agents, setAgents] = useState<AgentDisplayStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const runtimeRef = useRef<RuntimeModule | null>(null);
  const interactionsRef = useRef<DashboardInteraction[]>(interactions);
  interactionsRef.current = interactions;

  const loadRuntime = useCallback(async (): Promise<RuntimeModule | null> => {
    if (runtimeRef.current) return runtimeRef.current;

    try {
      const runtime = await import('../../../../src/runtime.js') as RuntimeModule;
      runtimeRef.current = runtime;
      return runtime;
    } catch (err) {
      setError(`Failed to load runtime: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }, []);

  const refresh = useCallback(async () => {
    const runtime = await loadRuntime();
    if (!runtime) return;

    try {
      const sessions = runtime.getActiveSessions();
      const agentStatuses: AgentDisplayStatus[] = [];

      for (const session of sessions) {
        const sessionName = session.projectPath !== 'unknown'
          ? runtime.pathToSessionName(session.projectPath)
          : session.sessionId;

        // Check for pending interactions (waiting state)
        const hasWaiting = interactionsRef.current.some(
          i => i.sessionName === sessionName || i.project === session.project
        );

        // Load plan file for this session (if available)
        let planFile: string | undefined;
        if (session.projectPath && session.projectPath !== 'unknown') {
          planFile = runtime.getPlanFileForSession(session.sessionId, session.projectPath);
        }

        agentStatuses.push({
          id: session.sessionId.substring(0, 8),
          sessionId: session.sessionId,
          project: session.project,
          projectPath: session.projectPath,
          displayStatus: hasWaiting ? 'waiting' : session.status,
          modified: session.modified,
          messageCount: session.messageCount,
          gitBranch: session.gitBranch,
          title: session.title,
          source: session.source,
          planFile,
        });
      }

      // Sort by project name
      agentStatuses.sort((a, b) => a.project.localeCompare(b.project));

      setAgents(agentStatuses);
      setError(null);
    } catch (err) {
      setError(`Failed to read sessions: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [loadRuntime]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Polling
  useEffect(() => {
    const interval = setInterval(refresh, refreshInterval);
    return () => clearInterval(interval);
  }, [refresh, refreshInterval]);

  return { agents, loading, error, refresh };
}
