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

  diff: {
    name: "diff",
    description: "Show file changes (git diff or file comparison)",
    args: {
      file: { type: "string", description: "File path for git diff" },
      staged: { type: "boolean", description: "Show staged changes" },
      before: { type: "string", description: "Before file for comparison" },
      after: { type: "string", description: "After file for comparison" },
    },
    returns: {
      action: "accept",
    },
    examples: [
      'awb run --title "Diff" diff --file src/index.ts',
      'awb run --title "Diff" diff --file src/index.ts --staged',
      'awb run --title "Diff" diff --before old.txt --after new.txt',
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

  progress: {
    name: "progress",
    description: "Progress indicator with steps",
    args: {
      steps: {
        type: "string",
        required: true,
        description: "Comma-separated list of steps",
      },
      tasks: { type: "string", description: "Alias for steps" },
      items: { type: "string", description: "Alias for steps" },
      step: { type: "string", description: "Current step number (1-indexed)" },
      status: {
        type: "string",
        description: "Status message for current step",
      },
      stateFile: {
        type: "string",
        description: "File to watch for state updates (JSON)",
      },
      title: { type: "string", description: "Progress title" },
    },
    returns: {
      action: "accept",
    },
    examples: [
      'awb run --title "Progress" progress --steps "Build,Test,Deploy"',
      'awb run --title "Progress" progress --steps "Step 1,Step 2" --step 2',
    ],
  },

  mermaid: {
    name: "mermaid",
    description:
      "Render Mermaid diagrams as ASCII art. SUPPORTED: flowchart/graph, sequenceDiagram, classDiagram, stateDiagram (renders as ASCII boxes/arrows). NOT SUPPORTED (shows source only): erDiagram, pie, gantt, journey, gitGraph, mindmap, timeline, quadrantChart, xychart, sankey, packet, block. Accepts raw mermaid or markdown with code fences.",
    args: {
      file: { type: "string", description: "Path to .mmd or .md file" },
      code: { type: "string", description: "Inline mermaid code" },
      title: { type: "string", description: "Title above diagram" },
      editor: {
        type: "string",
        description: "Editor command to open file (e.g. 'code', 'vim')",
      },
    },
    validation: {
      oneOf: ["file", "code"],
    },
    returns: {
      action: "accept | edit",
      file: "string - path to file (when action=edit)",
      editor: "string - editor command (when action=edit)",
    },
    examples: [
      'awb run --title "Flow" mermaid --code "flowchart LR; A-->B-->C"',
      'awb run --title "Sequence" mermaid --code "sequenceDiagram; A->>B: Hello; B->>A: Hi"',
      'awb run --title "Class" mermaid --code "classDiagram; class Animal { +name +eat() }; class Dog; Animal <|-- Dog"',
      'awb run --title "State" mermaid --code "stateDiagram-v2; [*] --> Active; Active --> [*]"',
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

  chart: {
    name: "chart",
    description: "Terminal charts (bar, sparkline, line, stacked)",
    args: {
      file: { type: "string", description: "Path to JSON or CSV data file" },
      data: { type: "json", description: "Inline JSON data array" },
      type: {
        type: "string",
        default: "bar",
        description: "Chart type: bar | sparkline | line | stacked",
      },
      title: { type: "string", description: "Chart title" },
      height: {
        type: "number",
        default: "8",
        description: "Chart height in rows (for line graphs)",
      },
      sort: {
        type: "string",
        default: "none",
        description: "Sort order: none | asc | desc (for bar charts)",
      },
      showValues: {
        type: "boolean",
        default: "true",
        description: "Show values next to bars",
      },
    },
    validation: {
      oneOf: ["file", "data"],
    },
    returns: {
      action: "accept",
      type: "string - chart type used",
    },
    examples: [
      'awb run --title "Sales" chart --file data.json',
      'awb run --title "Trend" chart --data "[5,10,15,8,12]" --type sparkline',
      'awb run --title "Revenue" chart --file sales.csv --type bar --sort desc',
      'awb run --title "Languages" chart --data \'[{"label":"TS","value":60},{"label":"JS","value":30}]\' --type stacked',
    ],
  },

  select: {
    name: "select",
    description: "Single-item picker with optional fuzzy search",
    args: {
      items: {
        type: "string",
        required: true,
        description: "Comma-separated items or JSON array",
      },
      title: { type: "string", description: "Title above list" },
      search: {
        type: "boolean",
        default: "false",
        description: "Enable fuzzy search filtering",
      },
      file: { type: "string", description: "JSON file with items array" },
    },
    returns: {
      action: "accept | cancel",
      selected: "string - selected item value",
      selectedLabel: "string - selected item label",
      selectedIndex: "number - index of selected item",
    },
    examples: [
      'awb run --title "Select" select --items "Option A,Option B,Option C"',
      'awb run --title "Select" select --items \'[{"label":"Node","value":"node"},{"label":"Python","value":"python"}]\' --search true',
      'awb run --title "Select" select --file options.json --search true',
    ],
  },

  tree: {
    name: "tree",
    description: "Directory/hierarchy tree viewer with expand/collapse",
    args: {
      path: {
        type: "string",
        description: "Directory path to display (default: cwd)",
      },
      file: { type: "string", description: "JSON file with tree structure" },
      depth: { type: "number", default: "5", description: "Max depth to show" },
      showHidden: {
        type: "boolean",
        default: "false",
        description: "Show hidden files",
      },
      title: { type: "string", description: "Title above tree" },
    },
    returns: {
      action: "accept | cancel",
      selected: "string - path of selected item",
      type: "string - 'file' or 'directory'",
    },
    examples: [
      'awb run --title "Tree" tree',
      'awb run --title "Tree" tree --path ./src --depth 3',
      'awb run --title "Tree" tree --path . --showHidden true',
    ],
  },

  json: {
    name: "json",
    description: "Interactive JSON explorer with collapsible nodes",
    args: {
      file: { type: "string", description: "Path to JSON file" },
      data: { type: "json", description: "Inline JSON data" },
      title: { type: "string", description: "Title above viewer" },
      expandDepth: {
        type: "number",
        default: "2",
        description: "Initial expand depth",
      },
    },
    validation: {
      oneOf: ["file", "data"],
    },
    returns: {
      action: "accept | cancel",
    },
    examples: [
      'awb run --title "JSON" json --file config.json',
      'awb run --title "JSON" json --data \'{"name":"test","items":[1,2,3]}\'',
      'awb run --title "JSON" json --file data.json --expandDepth 1',
    ],
  },

  gauge: {
    name: "gauge",
    description: "Visual meter/progress indicator for single values",
    args: {
      value: { type: "number", description: "Current value" },
      min: { type: "number", default: "0", description: "Minimum value" },
      max: { type: "number", default: "100", description: "Maximum value" },
      label: { type: "string", description: "Gauge label" },
      unit: {
        type: "string",
        default: "%",
        description: "Unit suffix (%, MB, °C, etc.)",
      },
      style: {
        type: "string",
        default: "bar",
        description: "Style: bar | arc | blocks | dots",
      },
      color: {
        type: "string",
        description: "Bar color (or 'auto' for threshold-based)",
      },
      thresholds: {
        type: "json",
        description: 'Color thresholds: {"warning":70,"danger":90}',
      },
      file: {
        type: "string",
        description: "JSON file to watch for value updates",
      },
      data: {
        type: "json",
        description: "JSON with single or multiple gauges",
      },
      width: { type: "number", default: "30", description: "Gauge bar width" },
      title: { type: "string", description: "Title above gauge" },
    },
    returns: {
      action: "accept",
      gauges: "array of {value, label} for each gauge",
    },
    examples: [
      'awb run --title "CPU" gauge --value 75 --label "CPU Usage"',
      'awb run --title "Memory" gauge --value 8 --max 16 --unit "GB" --style blocks',
      'awb run --title "Temp" gauge --value 65 --unit "°C" --thresholds \'{"warning":60,"danger":80}\'',
      'awb run --title "Stats" gauge --data \'[{"label":"CPU","value":45},{"label":"Memory","value":72}]\'',
    ],
  },

  card: {
    name: "card",
    description: "Display markdown content with custom action buttons",
    args: {
      content: {
        type: "string",
        description: "Markdown/text content to display",
      },
      file: { type: "string", description: "Path to markdown file" },
      actions: {
        type: "json",
        description: 'Action buttons: [{"label":"Ok","key":"o","value":"ok"}]',
      },
      layout: {
        type: "string",
        default: "auto",
        description: "Button layout: horizontal | vertical | auto",
      },
    },
    validation: {
      oneOf: ["content", "file"],
    },
    returns: {
      action: "accept | cancel",
      selected: "string - value of selected action",
      selectedLabel: "string - label of selected action",
    },
    examples: [
      'awb run --title "Joke" card --content "Why do programmers prefer dark mode?\\n\\nBecause light attracts bugs!"',
      'awb run --title "Notice" card --content "# Important\\n\\nMaintenance tonight."',
      'awb run --title "Rate" card --content "How was it?" --actions \'[{"label":"Good","key":"g","value":"good"},{"label":"Bad","key":"b","value":"bad"}]\'',
      'awb run --title "Review" card --file notes.md --layout vertical',
    ],
  },

  html: {
    name: "html",
    description: `Render Claude-generated HTML with awb web components.

Claude generates full HTML pages that use <awb-*> web components:
- <awb-tree> - Interactive tree view
- <awb-table> - Data table with row selection
- <awb-mermaid> - Mermaid diagram renderer
- <awb-chart> - Bar/line charts
- <awb-code> - Syntax highlighted code
- <awb-markdown> - Markdown content
- <awb-json> - JSON tree viewer
- <awb-gauge> - Circular progress gauge

The components.js script is auto-injected if not present.`,
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
    },
    validation: {
      oneOf: ["content", "file"],
    },
    examples: [
      'awb run --title "Dashboard" html --content \'<awb-mermaid code="graph TD; A-->B"></awb-mermaid>\'',
      'awb run --title "Report" html --file ./dashboard.html',
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
  cmd: {
    type: "string",
    required: false,
    description: "Inline shell command (supports &&, |, ||, etc.)",
  },
  "cmd-file": {
    type: "string",
    required: false,
    description: "Read command from file",
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
  awb run --cmd "<command>"               Run a shell command (recommended for agents)
  awb run --cmd-file <path>               Run a shell command from file
  awb run -- <command>                    Run a shell command (passthrough)
  awb run --help                          Show this help

Command Execution:
  Use --cmd for commands with shell operators (&&, |, ||):
    awb run --title "Build" --cmd "npm run build && echo Done"
    awb run --title "Deploy" --cmd "ssh user@host 'deploy.sh && restart'"
  Use --cmd-file for complex multi-line scripts:
    awb run --title "Setup" --cmd-file ./scripts/setup.sh
  Use -- passthrough for simple commands (no operators):
    awb run --title "List" -- ls -la

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
