/**
 * Registry of built-in components and their file mappings.
 */

/**
 * Mapping from component name (case-insensitive) to actual file name.
 * Both "confirm" and "confirm.tsx" resolve to "confirm.tsx".
 */
export const builtinComponents: Record<string, string> = {
  // Core components available via CLI
  markdown: "markdown.tsx",
  "plan-viewer": "plan-viewer.tsx",
  confirm: "confirm.tsx",
  checklist: "checklist.tsx",
  code: "code.tsx",
  table: "table.tsx",
  // Special components handled directly in run.ts
  ask: "ask",
  html: "html",
};

/**
 * Map of component to their positional argument.
 * When a positional argument is provided after the component name,
 * it's assigned to this key.
 */
export const positionalArgMap: Record<string, string> = {
  confirm: "prompt",
  checklist: "items",
  markdown: "file",
  "plan-viewer": "file",
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
