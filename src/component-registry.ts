/**
 * Registry of built-in components and their file mappings.
 */

/**
 * Mapping from component name (case-insensitive) to actual file name.
 * Both "confirm" and "confirm.tsx" resolve to "confirm.tsx".
 */
export const builtinComponents: Record<string, string> = {
  markdown: "markdown.tsx",
  "markdown.tsx": "markdown.tsx",
  "plan-viewer": "plan-viewer.tsx",
  "plan-viewer.tsx": "plan-viewer.tsx",
  confirm: "confirm.tsx",
  "confirm.tsx": "confirm.tsx",
  checklist: "checklist.tsx",
  "checklist.tsx": "checklist.tsx",
  code: "code.tsx",
  "code.tsx": "code.tsx",
  diff: "diff.tsx",
  "diff.tsx": "diff.tsx",
  table: "table.tsx",
  "table.tsx": "table.tsx",
  progress: "progress.tsx",
  "progress.tsx": "progress.tsx",
  mermaid: "mermaid.tsx",
  "mermaid.tsx": "mermaid.tsx",
  chart: "chart.tsx",
  "chart.tsx": "chart.tsx",
  select: "select.tsx",
  "select.tsx": "select.tsx",
  tree: "tree.tsx",
  "tree.tsx": "tree.tsx",
  json: "json.tsx",
  "json.tsx": "json.tsx",
  gauge: "gauge.tsx",
  "gauge.tsx": "gauge.tsx",
  card: "card.tsx",
  "card.tsx": "card.tsx",
};

/**
 * Map of component to their positional argument.
 * When a positional argument is provided after the component name,
 * it's assigned to this key.
 */
export const positionalArgMap: Record<string, string> = {
  confirm: "prompt",
  "confirm.tsx": "prompt",
  checklist: "items",
  "checklist.tsx": "items",
  progress: "steps",
  "progress.tsx": "steps",
  markdown: "file",
  "markdown.tsx": "file",
  "plan-viewer": "file",
  "plan-viewer.tsx": "file",
};

/**
 * Check if a component name is a built-in component.
 */
export function isBuiltinComponent(name: string): boolean {
  return name.toLowerCase() in builtinComponents;
}

/**
 * Get the file name for a built-in component.
 */
export function getBuiltinComponentFile(name: string): string | undefined {
  return builtinComponents[name.toLowerCase()];
}
