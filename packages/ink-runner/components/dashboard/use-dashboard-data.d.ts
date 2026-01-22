import type { SessionInfo, DashboardAgent } from './types.js';
interface UseDashboardDataOptions {
    refreshInterval?: number;
    onNewInteraction?: (agent: DashboardAgent) => void;
}
interface UseDashboardDataResult {
    sessions: SessionInfo[];
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    highlightedAgentIds: Set<string>;
}
/**
 * Hook to manage dashboard data with polling and auto-focus detection.
 */
export declare function useDashboardData(options?: UseDashboardDataOptions): UseDashboardDataResult;
export {};
