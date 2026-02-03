import * as fsp from "node:fs/promises";
import { type CreatedEvent, getPendingInteractions } from "./events.js";
import { getRuntimeRoot, sessionNameToProject } from "./runtime.js";

/**
 * Interaction with project info for playground display
 */
export interface PlaygroundInteraction extends CreatedEvent {
  project: string;
  sessionName: string;
  agentSessionId?: string; // Inherited from CreatedEvent
}

/**
 * Interactions grouped by project
 */
export interface ProjectInteractions {
  project: string;
  sessionName: string;
  interactions: PlaygroundInteraction[];
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
