import { useState, useEffect, useCallback, useRef } from 'react';
/**
 * Hook to manage dashboard data with polling and auto-focus detection.
 */
export function useDashboardData(options = {}) {
    const { refreshInterval = 1000, onNewInteraction } = options;
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [highlightedAgentIds, setHighlightedAgentIds] = useState(new Set());
    // Track previous pending counts for each agent
    const prevPendingRef = useRef(new Map());
    const scannerRef = useRef(null);
    const loadScanner = useCallback(async () => {
        if (scannerRef.current) {
            return scannerRef.current;
        }
        try {
            // Dynamic import to avoid circular dependencies
            const scanner = await import('../../../../src/session-scanner.js');
            scannerRef.current = scanner;
            return scanner;
        }
        catch (err) {
            setError(`Failed to load scanner: ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
    }, []);
    const refresh = useCallback(async () => {
        const scanner = await loadScanner();
        if (!scanner)
            return;
        try {
            const newSessions = await scanner.scanAllSessions();
            // Check for new pending interactions (for auto-focus)
            const newHighlighted = new Set();
            const prevPending = prevPendingRef.current;
            const nextPending = new Map();
            for (const session of newSessions) {
                for (const agent of session.agents) {
                    const prev = prevPending.get(agent.id) || 0;
                    nextPending.set(agent.id, agent.pendingInteractions);
                    // Detect new pending interactions
                    if (agent.pendingInteractions > prev && onNewInteraction) {
                        onNewInteraction(agent);
                        newHighlighted.add(agent.id);
                    }
                }
            }
            prevPendingRef.current = nextPending;
            if (newHighlighted.size > 0) {
                setHighlightedAgentIds(newHighlighted);
                // Clear highlights after 2 seconds
                setTimeout(() => {
                    setHighlightedAgentIds(new Set());
                }, 2000);
            }
            setSessions(newSessions);
            setError(null);
        }
        catch (err) {
            setError(`Refresh failed: ${err instanceof Error ? err.message : String(err)}`);
        }
        finally {
            setLoading(false);
        }
    }, [loadScanner, onNewInteraction]);
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
        sessions,
        loading,
        error,
        refresh,
        highlightedAgentIds,
    };
}
