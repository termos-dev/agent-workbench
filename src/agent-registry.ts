/**
 * Agent Registry - Extensible definitions for coding agent processes
 *
 * Add new agents by adding entries to AGENTS array.
 * Each agent needs a name and regex patterns to match in `ps` output.
 */

export interface AgentDefinition {
  /** Display name for the agent */
  name: string;
  /** Regex patterns to match in process command line */
  processPatterns: RegExp[];
  /** Patterns to exclude (e.g., child processes, MCP servers) */
  excludePatterns?: RegExp[];
  /** Icon identifier for UI display */
  icon?: string;
}

/**
 * Registry of known coding agents
 */
export const AGENTS: AgentDefinition[] = [
  {
    name: "claude",
    processPatterns: [/\bclaude\b/],
    excludePatterns: [
      /--claude-in-chrome-mcp/,
      /mcp-server/,
      /\.local\/share\/claude\/versions/,
    ],
    icon: "claude",
  },
  {
    name: "codex",
    processPatterns: [/\bcodex\b/],
    excludePatterns: [/node_modules/],
    icon: "codex",
  },
  {
    name: "opencode",
    processPatterns: [/\bopencode\b/],
    excludePatterns: [],
    icon: "opencode",
  },
  {
    name: "aider",
    processPatterns: [/\baider\b/],
    excludePatterns: [/node_modules/],
    icon: "aider",
  },
];

/**
 * Find matching agent for a command string
 */
export function matchAgent(command: string): AgentDefinition | null {
  for (const agent of AGENTS) {
    // Check if command matches any of the patterns
    const matches = agent.processPatterns.some((pattern) =>
      pattern.test(command)
    );
    if (!matches) continue;

    // Check if command should be excluded
    const excluded = agent.excludePatterns?.some((pattern) =>
      pattern.test(command)
    );
    if (excluded) continue;

    return agent;
  }
  return null;
}

/**
 * Get agent by name
 */
export function getAgent(name: string): AgentDefinition | undefined {
  return AGENTS.find((a) => a.name === name);
}

/**
 * Get all registered agent names
 */
export function getAgentNames(): string[] {
  return AGENTS.map((a) => a.name);
}
