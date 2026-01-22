import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardInteraction, ProjectInteractions } from "./types.js";

interface UseDashboardDataOptions {
  refreshInterval?: number;
  onNewInteraction?: (interaction: DashboardInteraction) => void;
}

interface UseDashboardDataResult {
  projects: ProjectInteractions[];
  allInteractions: DashboardInteraction[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  respondToInteraction: (
    sessionName: string,
    interactionId: string,
    response: InteractionResponse
  ) => Promise<void>;
  sendMessage: (
    sessionName: string,
    text: string,
    agentSessionId?: string
  ) => Promise<void>;
}

export interface InteractionResponse {
  action: "accept" | "decline" | "cancel";
  value?: unknown;
  answers?: Record<string, string | string[]>;
  feedback?: string; // User feedback text for display components
}

// Type for the dynamic imports
type ScannerModule = {
  scanAllSessions: () => Promise<ProjectInteractions[]>;
};

type EventsModule = {
  writeEvent: (sessionName: string, event: Record<string, unknown>) => void;
};

/**
 * Hook to manage dashboard data with polling.
 * Scans all sessions for pending interactions.
 */
export function useDashboardData(
  options: UseDashboardDataOptions = {}
): UseDashboardDataResult {
  const { refreshInterval = 1000, onNewInteraction } = options;

  const [projects, setProjects] = useState<ProjectInteractions[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track previous interaction IDs to detect new ones
  const prevInteractionIds = useRef<Set<string>>(new Set());
  const scannerRef = useRef<ScannerModule | null>(null);
  const eventsRef = useRef<EventsModule | null>(null);

  const loadScanner = useCallback(async (): Promise<ScannerModule | null> => {
    if (scannerRef.current) {
      return scannerRef.current;
    }

    try {
      const scanner = (await import(
        "../../../../src/session-scanner.js"
      )) as ScannerModule;
      scannerRef.current = scanner;
      return scanner;
    } catch (err) {
      setError(
        `Failed to load scanner: ${err instanceof Error ? err.message : String(err)}`
      );
      return null;
    }
  }, []);

  const loadEvents = useCallback(async (): Promise<EventsModule | null> => {
    if (eventsRef.current) {
      return eventsRef.current;
    }

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

  // Flatten all interactions from all projects
  const allInteractions = projects.flatMap((p) => p.interactions);

  const refresh = useCallback(async () => {
    const scanner = await loadScanner();
    if (!scanner) return;

    // Also load events module
    await loadEvents();

    try {
      const newProjects = await scanner.scanAllSessions();

      // Detect new interactions
      const currentIds = new Set<string>();
      for (const project of newProjects) {
        for (const interaction of project.interactions) {
          currentIds.add(interaction.id);

          // If this is a new interaction, notify
          if (
            !prevInteractionIds.current.has(interaction.id) &&
            onNewInteraction
          ) {
            onNewInteraction(interaction);
          }
        }
      }

      prevInteractionIds.current = currentIds;
      setProjects(newProjects);
      setError(null);
    } catch (err) {
      setError(
        `Refresh failed: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setLoading(false);
    }
  }, [loadScanner, loadEvents, onNewInteraction]);

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

      // Refresh to reflect the change
      await refresh();
    },
    [loadEvents, refresh]
  );

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

      // Refresh to reflect the change
      await refresh();
    },
    [loadEvents, refresh]
  );

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Polling
  useEffect(() => {
    const interval = setInterval(refresh, refreshInterval);
    return () => clearInterval(interval);
  }, [refresh, refreshInterval]);

  return {
    projects,
    allInteractions,
    loading,
    error,
    refresh,
    respondToInteraction,
    sendMessage,
  };
}
