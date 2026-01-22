import { Box, Text, useInput } from "ink";

export interface Tab {
  id: string; // 'all' or project name
  label: string; // Display label
  count: number; // Number of pending interactions
  hasAgent: boolean; // Whether this project has an active agent
}

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onTabChange: (tabId: string) => void;
  width?: number;
}

/**
 * Horizontal tab bar for project filtering.
 *
 * Keyboard navigation:
 * - Tab / Shift+Tab: Next/previous tab
 * - [ / ]: vim-style tab cycling
 * - 1-9: Jump to tab (1 = first project)
 * - 0: Jump to "All" tab
 */
export function TabBar({ tabs, activeTabId, onTabChange, width }: TabBarProps) {
  useInput((input, key) => {
    const activeIndex = tabs.findIndex((t) => t.id === activeTabId);

    // Tab / Shift+Tab navigation
    if (key.tab) {
      if (key.shift) {
        // Shift+Tab: previous tab
        const prevIndex = activeIndex <= 0 ? tabs.length - 1 : activeIndex - 1;
        onTabChange(tabs[prevIndex].id);
      } else {
        // Tab: next tab
        const nextIndex = (activeIndex + 1) % tabs.length;
        onTabChange(tabs[nextIndex].id);
      }
      return;
    }

    // [ / ] cycling (vim-style)
    if (input === "[") {
      const prevIndex = activeIndex <= 0 ? tabs.length - 1 : activeIndex - 1;
      onTabChange(tabs[prevIndex].id);
      return;
    }
    if (input === "]") {
      const nextIndex = (activeIndex + 1) % tabs.length;
      onTabChange(tabs[nextIndex].id);
      return;
    }

    // Number keys: 0 = All, 1-9 = project tabs
    if (input === "0") {
      const allTab = tabs.find((t) => t.id === "all");
      if (allTab) onTabChange("all");
      return;
    }

    const num = Number.parseInt(input, 10);
    if (num >= 1 && num <= 9) {
      // 1-9 map to project tabs (excluding 'all')
      const projectTabs = tabs.filter((t) => t.id !== "all");
      if (num <= projectTabs.length) {
        onTabChange(projectTabs[num - 1].id);
      }
      return;
    }
  });

  // Calculate tab display
  const availableWidth = width || 80;

  return (
    <Box paddingX={1} width={availableWidth}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;

        return (
          <Box key={tab.id} marginRight={1}>
            <Text
              color={isActive ? "cyan" : undefined}
              bold={isActive}
              inverse={isActive}
            >
              {" "}
              {tab.label} [{tab.count}]{" "}
            </Text>
          </Box>
        );
      })}

      <Box flexGrow={1} />

      <Text dimColor>Tab switch</Text>
    </Box>
  );
}

/**
 * Build tabs from agents and interactions.
 * Returns a list of tabs with "All" always first if there are multiple projects.
 */
export function buildTabs(
  projects: string[],
  interactionsByProject: Map<string, number>,
  agentProjects: Set<string>
): Tab[] {
  const tabs: Tab[] = [];

  // Get unique projects
  const uniqueProjects = Array.from(
    new Set([
      ...projects,
      ...Array.from(interactionsByProject.keys()),
      ...Array.from(agentProjects),
    ])
  ).sort();

  // Always add "All" tab if there are multiple projects
  if (uniqueProjects.length > 1) {
    let totalCount = 0;
    for (const count of interactionsByProject.values()) {
      totalCount += count;
    }

    tabs.push({
      id: "all",
      label: "All",
      count: totalCount,
      hasAgent: agentProjects.size > 0,
    });
  }

  // Add project tabs
  for (const project of uniqueProjects) {
    tabs.push({
      id: project,
      label: project,
      count: interactionsByProject.get(project) || 0,
      hasAgent: agentProjects.has(project),
    });
  }

  return tabs;
}
