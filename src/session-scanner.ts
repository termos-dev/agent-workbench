import * as fsp from "node:fs/promises";
import { type CreatedEvent, getPendingInteractions } from "./events.js";
import {
  type TrackedProcess,
  getAliveProcesses,
  scanIfNeeded,
} from "./process-tracker.js";
import {
  type TmuxWindow,
  getRuntimeRoot,
  isTmuxAvailable,
  listAwbTmuxSessions,
  listTmuxWindows,
  pathToTmuxSession,
  sessionNameToProject,
} from "./runtime.js";

/**
 * Interaction with project info for playground display
 */
export interface PlaygroundInteraction extends CreatedEvent {
  project: string;
  sessionName: string;
  agentSessionId?: string; // Inherited from CreatedEvent
}

/**
 * Tmux window info for playground display
 */
export interface TmuxWindowInfo extends TmuxWindow {
  tmuxSession: string;
}

/**
 * Interactions grouped by project
 */
export interface ProjectInteractions {
  project: string;
  sessionName: string;
  interactions: PlaygroundInteraction[];
  tmuxWindows?: TmuxWindowInfo[];
  tmuxSession?: string;
  /** Running agent processes for this project */
  processes?: TrackedProcess[];
}

/**
 * Discover all session directories
 */
export async function discoverSessionDirs(): Promise<string[]> {
  const sessionsRoot = getRuntimeRoot();

  try {
    const entries = await fsp.readdir(sessionsRoot, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .filter((entry) => !entry.name.startsWith(".")) // Skip hidden dirs
      .map((entry) => entry.name);
  } catch {
    // Directory doesn't exist or read failed
    return [];
  }
}

/**
 * Scan all sessions and return pending interactions grouped by project
 */
export async function scanAllSessions(): Promise<ProjectInteractions[]> {
  const sessionNames = await discoverSessionDirs();
  const projectsMap = new Map<string, ProjectInteractions>();

  for (const sessionName of sessionNames) {
    const pending = getPendingInteractions(sessionName);

    if (pending.length === 0) {
      continue;
    }

    // Add project info to each interaction
    // Use project from event if available, otherwise fall back to sessionNameToProject
    const playgroundInteractions: PlaygroundInteraction[] = pending.map(
      (int) => {
        const project = int.project || sessionNameToProject(sessionName);
        return {
          ...int,
          project,
          sessionName,
        };
      }
    );

    // Group by project (use first interaction's project as the group key)
    for (const interaction of playgroundInteractions) {
      const project = interaction.project;
      const existing = projectsMap.get(project);
      if (existing) {
        existing.interactions.push(interaction);
      } else {
        projectsMap.set(project, {
          project,
          sessionName,
          interactions: [interaction],
        });
      }
    }
  }

  return Array.from(projectsMap.values());
}

/**
 * Get total counts
 */
export function getTotals(projects: ProjectInteractions[]): {
  totalProjects: number;
  totalInteractions: number;
} {
  let totalInteractions = 0;
  for (const project of projects) {
    totalInteractions += project.interactions.length;
  }

  return {
    totalProjects: projects.length,
    totalInteractions,
  };
}

/**
 * Scan for tmux windows associated with a project path.
 * Returns tmux windows if the session exists.
 */
export function scanTmuxWindows(projectPath: string): TmuxWindowInfo[] | null {
  if (!isTmuxAvailable()) {
    return null;
  }

  const tmuxSession = pathToTmuxSession(projectPath);
  const windows = listTmuxWindows(tmuxSession);

  if (windows.length === 0) {
    return null;
  }

  return windows.map((win) => ({
    ...win,
    tmuxSession,
  }));
}

/**
 * Extract a display name from a tmux session name.
 * e.g., "awb-burakemre-Code-ai-experiments-mcp-sidecar-4697" -> "mcp-sidecar"
 */
function tmuxSessionToDisplayName(tmuxSession: string): string {
  // Remove "awb-" prefix and "-XXXX" hash suffix
  const withoutPrefix = tmuxSession.replace(/^awb-/, "");
  const withoutSuffix = withoutPrefix.replace(/-[a-f0-9]{4}$/, "");

  // Get last segment (project name)
  const segments = withoutSuffix.split("-");
  return segments[segments.length - 1] || withoutSuffix;
}

/**
 * Scan all sessions with tmux integration.
 * Returns projects with both interactions and tmux windows.
 */
export async function scanAllSessionsWithTmux(): Promise<
  ProjectInteractions[]
> {
  const projects = await scanAllSessions();
  const projectsMap = new Map<string, ProjectInteractions>();

  // Add existing projects to map
  for (const project of projects) {
    projectsMap.set(project.project, project);
  }

  // Scan for all awb- prefixed tmux sessions
  const tmuxSessions = listAwbTmuxSessions();

  for (const tmuxSession of tmuxSessions) {
    const windows = listTmuxWindows(tmuxSession);
    if (windows.length === 0) continue;

    const tmuxWindows: TmuxWindowInfo[] = windows.map((win) => ({
      ...win,
      tmuxSession,
    }));

    const displayName = tmuxSessionToDisplayName(tmuxSession);

    // Try to find existing project by matching the tmux session display name
    let foundProject: ProjectInteractions | undefined;
    for (const [name, project] of projectsMap) {
      if (name === displayName || name.endsWith(displayName)) {
        foundProject = project;
        break;
      }
    }

    if (foundProject) {
      // Add tmux info to existing project
      foundProject.tmuxWindows = tmuxWindows;
      foundProject.tmuxSession = tmuxSession;
    } else {
      // Create new project entry for tmux-only session
      projectsMap.set(tmuxSession, {
        project: displayName,
        sessionName: tmuxSession, // Use tmux session as identifier
        interactions: [],
        tmuxWindows,
        tmuxSession,
      });
    }
  }

  return Array.from(projectsMap.values());
}

/**
 * Scan all sessions with tmux integration and process tracking.
 * Returns projects with interactions, tmux windows, and running agent processes.
 */
export async function scanAllSessionsWithProcesses(): Promise<
  ProjectInteractions[]
> {
  // Get sessions with tmux
  const projects = await scanAllSessionsWithTmux();

  // Scan for running agent processes
  scanIfNeeded();
  const aliveProcesses = getAliveProcesses();

  // Group processes by project name
  const processesByProject = new Map<string, TrackedProcess[]>();
  for (const proc of aliveProcesses) {
    if (!proc.project) continue;
    const existing = processesByProject.get(proc.project) || [];
    existing.push(proc);
    processesByProject.set(proc.project, existing);
  }

  // Attach processes to matching projects
  for (const project of projects) {
    const procs = processesByProject.get(project.project);
    if (procs && procs.length > 0) {
      project.processes = procs;
      // Remove from map so we know which are unmatched
      processesByProject.delete(project.project);
    }
  }

  // Create project entries for processes that don't match existing projects
  for (const [projectName, procs] of processesByProject) {
    const firstProc = procs[0];
    projects.push({
      project: projectName,
      sessionName: firstProc.sessionName || projectName,
      interactions: [],
      processes: procs,
    });
  }

  return projects;
}
