export type AgentStatus = "idle" | "running" | "waiting" | "stale";
export interface DashboardAgent {
    id: string;
    title: string;
    tabName: string;
    cwd: string;
    registeredAt: string;
    sessionName: string;
    status: AgentStatus;
    pendingInteractions: number;
    totalInteractions: number;
    lastActivity: Date;
}
export interface SessionInfo {
    name: string;
    path: string;
    agents: DashboardAgent[];
    isAlive: boolean;
}
export interface DashboardState {
    sessions: SessionInfo[];
    loading: boolean;
    error: string | null;
    lastRefresh: Date;
}
