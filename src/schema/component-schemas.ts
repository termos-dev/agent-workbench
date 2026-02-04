/**
 * Component schemas - source of truth for CLI help generation
 */

export interface ArgSchema {
  type: "string" | "number" | "boolean" | "json";
  required?: boolean;
  default?: string;
  description: string;
}

export interface ComponentSchema {
  name: string;
  description: string;
  args: Record<string, ArgSchema>;
  returns: Record<string, string>;
  examples?: string[];
  validation?: {
    oneOf?: string[]; // At least one of these args must be provided
  };
}

export const componentSchemas: Record<string, ComponentSchema> = {
  ask: {
    name: "ask",
    description: `Multi-question interactive form (1-4 questions visible at once).

Question schema:
  {
    "question": string,           // Required: the question text
    "header": string,             // Required: key for the answer in results
    "options": [                  // Optional: for selection questions
      { "label": string, "description"?: string }
    ],
    "multiSelect": boolean,       // Optional: allow multiple selections (default: false)
    "placeholder": string,        // Optional: placeholder for text input
    "inputType": "text"|"password" // Optional: input type (default: text)
  }

Navigation: ↑↓ options, Tab/Shift+Tab questions, Space toggle, Enter submit`,
    args: {
      questions: {
        type: "json",
        required: true,
        description: "JSON array of question objects (1-4 questions)",
      },
    },
    returns: {
      action: "accept | cancel",
      answers: "Record<header, value> - answers keyed by question header",
    },
    examples: [
      'awb run --title "Setup" ask --questions \'[{"question":"What is your name?","header":"name"}]\'',
      'awb run --title "Config" ask --questions \'[{"question":"Select language","header":"lang","options":[{"label":"TypeScript"},{"label":"Python"},{"label":"Go"}]}]\'',
      'awb run --title "Preferences" ask --questions \'[{"question":"Auth method?","header":"auth","options":[{"label":"OAuth","description":"Industry standard"},{"label":"JWT","description":"Stateless"}]},{"question":"Database?","header":"db","options":[{"label":"PostgreSQL"},{"label":"MongoDB"}]}]\'',
      'awb run --title "Features" ask --questions \'[{"question":"Select features","header":"features","multiSelect":true,"options":[{"label":"Auth"},{"label":"API"},{"label":"Admin"}]}]\'',
    ],
  },

  confirm: {
    name: "confirm",
    description: "Yes/No confirmation dialog",
    args: {
      prompt: {
        type: "string",
        required: true,
        description: "Question to ask",
      },
      yes: { type: "string", default: "Yes", description: "Yes button label" },
      no: { type: "string", default: "No", description: "No button label" },
    },
    returns: {
      action: "accept | cancel",
      confirmed: "boolean - true if user selected yes",
    },
    examples: [
      'awb run --title "Confirm" confirm --prompt "Delete all files?"',
      'awb run --title "Confirm" confirm --prompt "Continue?" --yes "Proceed" --no "Abort"',
    ],
  },

  checklist: {
    name: "checklist",
    description: "Interactive checklist with toggleable items",
    args: {
      items: {
        type: "string",
        required: true,
        description: "Comma-separated list of items",
      },
      title: { type: "string", description: "Title above checklist" },
      checked: {
        type: "string",
        description: "Pre-checked indices (comma-separated)",
      },
    },
    returns: {
      action: "accept | cancel",
      checked: "number[] - indices of checked items",
      checkedLabels: "string[] - labels of checked items",
    },
    examples: [
      'awb run --title "Checklist" checklist --items "Build,Test,Deploy"',
      'awb run --title "Checklist" checklist --items "A,B,C" --checked "0,2"',
    ],
  },

  code: {
    name: "code",
    description: "Syntax-highlighted code viewer with embedded editing",
    args: {
      file: {
        type: "string",
        required: true,
        description: "Path to source file",
      },
      highlight: {
        type: "string",
        description: "Line range to highlight (e.g. '10-20')",
      },
      line: { type: "number", description: "Scroll to line number" },
      editor: {
        type: "string",
        description:
          "External editor command (e.g. 'code --goto', 'vim +{line}')",
      },
    },
    returns: {
      action: "accept | edit",
      file: "string - path to file",
      line: "number - current line (when action=edit)",
    },
    examples: [
      'awb run --title "Code" code --file src/index.ts',
      'awb run --title "Code" code --file src/app.tsx --highlight "15-25" --line 15',
    ],
  },

  table: {
    name: "table",
    description: "Display tabular data from JSON or CSV",
    args: {
      file: { type: "string", description: "Path to JSON or CSV file" },
      data: { type: "json", description: "Inline JSON array of objects" },
      columns: {
        type: "string",
        description: "Columns to display (comma-separated)",
      },
      select: { type: "boolean", description: "Enable row selection mode" },
    },
    validation: {
      oneOf: ["file", "data"],
    },
    returns: {
      action: "accept",
      selectedRow: "object - selected row data (when select=true)",
      selectedIndex: "number - index of selected row (when select=true)",
    },
    examples: [
      'awb run --title "Table" table --file data.json',
      'awb run --title "Table" table --file data.csv --columns "name,status,date"',
      'awb run --title "Table" table --data \'[{"name":"Alice","age":30},{"name":"Bob","age":25}]\'',
    ],
  },

  markdown: {
    name: "markdown",
    description: "Render markdown content or file with scrolling",
    args: {
      file: { type: "string", description: "Path to markdown file" },
      content: { type: "string", description: "Inline markdown content" },
      title: { type: "string", description: "Title above content" },
    },
    validation: {
      oneOf: ["file", "content"],
    },
    returns: {
      action: "accept",
      file: "string - path to file (when using --file)",
    },
    examples: [
      'awb run --title "Markdown" markdown --file README.md',
      'awb run --title "Markdown" markdown --content "# Hello\\n\\n**Bold** text"',
    ],
  },

  "plan-viewer": {
    name: "plan-viewer",
    description: "Review a plan file with approve/reject controls",
    args: {
      file: {
        type: "string",
        required: true,
        description: "Path to plan file",
      },
    },
    returns: {
      action: "accept | cancel",
      result: "{ approved: boolean, file?: string }",
    },
    examples: ['awb run --title "Plan" plan-viewer --file /path/to/plan.md'],
  },

  html: {
    name: "html",
    description: `Render interactive HTML playgrounds with awb web components.

Claude generates full HTML pages that can use <awb-*> web components:
- <awb-tree> - Interactive tree view
- <awb-table> - Data table with row selection
- <awb-mermaid> - Mermaid diagram renderer
- <awb-chart> - Bar/line charts
- <awb-code> - Syntax highlighted code
- <awb-markdown> - Markdown content
- <awb-json> - JSON tree viewer
- <awb-gauge> - Circular progress gauge

## Interactive HTML API

HTML content has access to the \`window.awb\` API for interactivity:

### awb.submit(data)
Send data back to the agent and close the panel. The data will be returned
in the wait command's result.

\`\`\`javascript
// Example: Submit user configuration back to agent
window.awb.submit({
  theme: selectedTheme,
  options: { darkMode: true, fontSize: 14 }
});
\`\`\`

### awb.copyToClipboard(text, button)
Copy text to clipboard with visual feedback on the button.

\`\`\`javascript
// Example: Copy with button feedback
<button onclick="awb.copyToClipboard(generatedCode, this)">Copy Code</button>
\`\`\`

## Creating Interactive Playgrounds

1. Create HTML with controls (inputs, buttons, selectors)
2. Add JavaScript to handle user interactions
3. Call awb.submit(data) when user confirms their selection
4. The agent receives the data via \`awb wait\`

The components.js script and awb API are auto-injected.`,
    args: {
      content: {
        type: "string",
        description: "HTML content to render (inline)",
      },
      file: {
        type: "string",
        description: "Path to HTML file to render",
      },
    },
    returns: {
      action: "accept | cancel",
      result: "Data submitted via awb.submit() (if any)",
    },
    validation: {
      oneOf: ["content", "file"],
    },
    examples: [
      'awb run --title "Dashboard" html --content \'<awb-mermaid code="graph TD; A-->B"></awb-mermaid>\'',
      'awb run --title "Report" html --file ./dashboard.html',
      'awb run --title "Theme Picker" html --content \'<button onclick="awb.submit({theme: \\"dark\\"})">Dark</button>\'',
    ],
  },
};

/**
 * Global options schema - applies to all `awb run` commands
 */
export const globalOptionsSchema: Record<string, ArgSchema> = {
  title: {
    type: "string",
    required: true,
    description: "Title for the interaction",
  },
};

/**
 * Generate help text for a component
 */
export function generateComponentHelp(schema: ComponentSchema): string {
  const lines: string[] = [];

  lines.push(`${schema.name} - ${schema.description}`);
  lines.push("");

  // Usage
  const requiredArgs = Object.entries(schema.args)
    .filter(([_, arg]) => arg.required)
    .map(([name, _]) => `--${name} <value>`)
    .join(" ");
  const oneOfHint = schema.validation?.oneOf
    ? `<${schema.validation.oneOf.map((a) => `--${a}`).join(" | ")}>`
    : "";
  lines.push(
    `  Usage: awb run --title "<text>" ${schema.name} ${requiredArgs} ${oneOfHint}`.trimEnd()
  );
  lines.push("");

  // oneOf validation note
  if (schema.validation?.oneOf) {
    const opts = schema.validation.oneOf.map((a) => `--${a}`).join(" or ");
    lines.push(`  Note: Either ${opts} is required`);
    lines.push("");
  }

  // Options
  lines.push("  Options:");
  for (const [name, arg] of Object.entries(schema.args)) {
    const req = arg.required ? "(required)" : "";
    const oneOf = schema.validation?.oneOf?.includes(name) ? "(oneOf)" : "";
    const def = arg.default ? `(default: ${arg.default})` : "";
    lines.push(
      `    --${name.padEnd(12)} ${arg.description} ${req} ${oneOf} ${def}`.trimEnd()
    );
  }
  lines.push("");

  // Returns
  lines.push("  Returns:");
  for (const [name, desc] of Object.entries(schema.returns)) {
    lines.push(`    ${name}: ${desc}`);
  }

  // Examples
  if (schema.examples?.length) {
    lines.push("");
    lines.push("  Examples:");
    for (const ex of schema.examples) {
      lines.push(`    ${ex}`);
    }
  }

  return lines.join("\n");
}

/**
 * Generate help text for global options from schema
 */
function generateGlobalOptionsHelp(): string {
  const lines: string[] = [];
  for (const [name, arg] of Object.entries(globalOptionsSchema)) {
    const req = arg.required ? "(required)" : "";
    lines.push(`  --${name.padEnd(20)} ${arg.description} ${req}`.trimEnd());
  }
  return lines.join("\n");
}

/**
 * Generate full help text for all components
 */
export function generateFullHelp(): string {
  const sections: string[] = [];

  sections.push(`awb run - Run interactive components

Usage:
  awb run <component> [options]           Run a built-in component
  awb run --help                          Show this help

Background Processes:
  Use tmux for long-running commands (dev servers, builds, watchers).
  Run 'awb --help' to see your tmux session name.
  Example:
    tmux new-window -t <session> -n "dev" "npm run dev"

Global Options:
${generateGlobalOptionsHelp()}
`);

  for (const schema of Object.values(componentSchemas)) {
    sections.push("━".repeat(80));
    sections.push("");
    sections.push(generateComponentHelp(schema));
    sections.push("");
  }

  sections.push("━".repeat(80));
  sections.push("");
  return sections.join("\n");
}
