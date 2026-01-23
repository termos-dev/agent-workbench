/**
 * Mermaid diagram measurement utility.
 * Pre-renders diagrams to measure their dimensions for auto-sizing panes.
 */

import { mermaidToAscii } from "mermaid-ascii";

export type DiagramType =
  | "flowchart"
  | "sequence"
  | "class"
  | "state"
  | "er"
  | "unknown";

export interface DiagramDimensions {
  width: number;
  height: number;
  type: DiagramType;
}

export function detectDiagramType(source: string): DiagramType {
  const firstLine = source.trim().split("\n")[0]?.toLowerCase() || "";

  if (firstLine.startsWith("flowchart") || firstLine.startsWith("graph")) {
    return "flowchart";
  }
  if (firstLine.startsWith("sequencediagram")) {
    return "sequence";
  }
  if (firstLine.startsWith("classdiagram")) {
    return "class";
  }
  if (firstLine.startsWith("statediagram")) {
    return "state";
  }
  if (firstLine.startsWith("erdiagram")) {
    return "er";
  }
  return "unknown";
}

export function stripMarkdownFences(source: string): string {
  let clean = source.trim();

  // Full fence match: ```mermaid ... ```
  const fenceMatch = clean.match(/^```(?:mermaid)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fenceMatch) {
    return fenceMatch[1];
  }

  // Opening fence only
  if (clean.startsWith("```mermaid")) {
    clean = clean.replace(/^```mermaid\s*\n?/, "");
  } else if (clean.startsWith("```")) {
    clean = clean.replace(/^```\s*\n?/, "");
  }

  // Trailing fence
  clean = clean.replace(/\n```\s*$/, "");

  return clean;
}

interface PreprocessResult {
  source: string;
  warnings: string[];
}

function preprocessFlowchart(source: string): PreprocessResult {
  // Convert semicolon-separated statements to newlines (common mermaid shorthand)
  const normalizedSource = source.replace(/;\s*/g, "\n");
  const lines = normalizedSource.split("\n");
  const processed: string[] = [];
  const nodeLabels = new Map<string, string>();
  const warnings: string[] = [];
  let subgraphDepth = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("%%")) continue;

    if (trimmed.match(/^subgraph\s/i)) {
      subgraphDepth++;
      continue;
    }

    if (trimmed === "end" && subgraphDepth > 0) {
      subgraphDepth--;
      continue;
    }

    if (trimmed.match(/^(graph|flowchart)\s/i)) {
      const headerMatch = trimmed.match(
        /^(graph|flowchart)\s+(TB|TD|BT|LR|RL)/i
      );
      if (headerMatch) {
        const [fullMatch, , direction] = headerMatch;
        const normalizedDirection =
          direction.toUpperCase() === "TB" ? "TD" : direction.toUpperCase();
        // Always use 'graph' keyword - mermaid-ascii renders it more reliably than 'flowchart'
        const cleanHeader = `graph ${normalizedDirection}`;

        const extraContent = trimmed.slice(fullMatch.length).trim();
        if (extraContent) {
          warnings.push(`Ignored extra content in header: "${extraContent}"`);
        }

        processed.push(cleanHeader);
      } else {
        // Default to 'graph TD' for reliable rendering
        processed.push("graph TD");
        warnings.push("Could not parse direction, defaulting to TD");
      }
      continue;
    }

    const standaloneMatch = trimmed.match(
      /^(\w+)\s*[\[\(\{<]([^\]\)\}>]+)[\]\)\}>]\s*$/
    );
    if (standaloneMatch) {
      const [, id, label] = standaloneMatch;
      nodeLabels.set(id, label);
      continue;
    }

    const edgeMatch = trimmed.match(
      /^(\w+)(?:\s*[\[\(\{<][^\]\)\}>]+[\]\)\}>])?\s*(-->|---|\.-\.>|==>|--?>)\s*(?:\|[^|]*\|)?\s*(\w+)(?:\s*[\[\(\{<]([^\]\)\}>]+)[\]\)\}>])?/
    );
    if (edgeMatch) {
      const [, , , toId, toLabel] = edgeMatch;
      if (toLabel) nodeLabels.set(toId, toLabel);
      processed.push(trimmed);
      continue;
    }

    processed.push(trimmed);
  }

  return { source: processed.join("\n"), warnings };
}

export function renderFlowchartAscii(source: string): {
  lines: string[];
  error?: string;
  warnings?: string[];
} {
  const originalDebug = console.debug;
  console.debug = () => {};

  try {
    const { source: processed, warnings } = preprocessFlowchart(source);
    const ascii = mermaidToAscii(processed);

    if (
      ascii.includes("flowchart ") ||
      ascii.includes("graph ") ||
      ascii.match(/\w+\s*-->\s*\w+/) ||
      ascii.match(/\w+\s*---\s*\w+/)
    ) {
      throw new Error(
        "mermaid-ascii could not render this diagram - showing source view"
      );
    }

    return { lines: ascii.split("\n"), warnings };
  } catch (e) {
    return {
      lines: source.split("\n"),
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    console.debug = originalDebug;
  }
}

// ============================================================================
// Sequence Diagram ASCII Renderer
// ============================================================================

interface Participant {
  id: string;
  label: string;
}

interface Message {
  from: string;
  to: string;
  label: string;
  style: "solid" | "dashed";
  arrowType: "filled" | "open";
}

function parseSequenceDiagram(source: string): {
  participants: Participant[];
  messages: Message[];
} {
  const lines = source
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("%%"));
  const participants: Participant[] = [];
  const participantMap = new Map<string, Participant>();
  const messages: Message[] = [];

  for (const line of lines) {
    if (line.toLowerCase() === "sequencediagram") continue;

    const participantMatch = line.match(
      /^participant\s+(\w+)(?:\s+as\s+(.+))?$/i
    );
    if (participantMatch) {
      const [, id, label] = participantMatch;
      const p: Participant = { id, label: label || id };
      participants.push(p);
      participantMap.set(id, p);
      continue;
    }

    const messageMatch = line.match(/^(\w+)\s*(--?>?>)\s*(\w+)\s*:\s*(.*)$/);
    if (messageMatch) {
      const [, from, arrow, to, label] = messageMatch;

      if (!participantMap.has(from)) {
        const p: Participant = { id: from, label: from };
        participants.push(p);
        participantMap.set(from, p);
      }
      if (!participantMap.has(to)) {
        const p: Participant = { id: to, label: to };
        participants.push(p);
        participantMap.set(to, p);
      }

      messages.push({
        from,
        to,
        label,
        style: arrow.includes("--") ? "dashed" : "solid",
        arrowType: arrow.includes(">>") ? "filled" : "open",
      });
    }
  }

  return { participants, messages };
}

export function renderSequenceAscii(source: string): {
  lines: string[];
  error?: string;
} {
  try {
    const { participants, messages } = parseSequenceDiagram(source);

    if (participants.length === 0) {
      return { lines: ["(no participants found)"], error: "No participants" };
    }

    const minBoxWidth = 10;
    const colWidths = participants.map((p) =>
      Math.max(minBoxWidth, p.label.length + 4)
    );
    const colSpacing = 6;

    const positions: number[] = [];
    let x = 0;
    for (let i = 0; i < participants.length; i++) {
      positions.push(x + Math.floor(colWidths[i] / 2));
      x += colWidths[i] + colSpacing;
    }
    const totalWidth = x - colSpacing;

    const output: string[] = [];

    const drawParticipantBoxes = () => {
      let topLine = "";
      let midLine = "";
      let botLine = "";

      for (let i = 0; i < participants.length; i++) {
        const p = participants[i];
        const w = colWidths[i];
        const pad = i > 0 ? " ".repeat(colSpacing) : "";
        topLine += `${pad}┌${"─".repeat(w - 2)}┐`;
        const labelPad = Math.floor((w - 2 - p.label.length) / 2);
        midLine += `${pad}│${" ".repeat(labelPad)}${p.label}${" ".repeat(w - 2 - labelPad - p.label.length)}│`;
        botLine += `${pad}└${"─".repeat(w - 2)}┘`;
      }
      output.push(topLine);
      output.push(midLine);
      output.push(botLine);
    };

    const drawLifelines = () => {
      let line = "";
      for (let i = 0; i < participants.length; i++) {
        const pos = positions[i];
        while (line.length < pos) line += " ";
        line = `${line.slice(0, pos)}│${line.slice(pos + 1)}`;
      }
      while (line.length < totalWidth) line += " ";
      return line;
    };

    const drawMessage = (msg: Message) => {
      const fromIdx = participants.findIndex((p) => p.id === msg.from);
      const toIdx = participants.findIndex((p) => p.id === msg.to);
      if (fromIdx === -1 || toIdx === -1) return;

      const fromPos = positions[fromIdx];
      const toPos = positions[toIdx];
      const leftToRight = fromPos < toPos;
      const startPos = Math.min(fromPos, toPos);
      const endPos = Math.max(fromPos, toPos);
      const arrowLen = endPos - startPos;

      if (fromIdx === toIdx) {
        const base = drawLifelines();
        const selfLine1 = `${base.slice(0, fromPos + 1)}─┐${base.slice(fromPos + 3)}`;
        const selfLine2 = `${base.slice(0, fromPos)} │ ${msg.label}`;
        const selfLine3 = `${base.slice(0, fromPos + 1)}◄┘${base.slice(fromPos + 3)}`;
        output.push(selfLine1);
        output.push(selfLine2);
        output.push(selfLine3);
        return;
      }

      const lineChar = msg.style === "dashed" ? "╌" : "─";
      const arrowHead = leftToRight
        ? msg.arrowType === "filled"
          ? "▶"
          : ">"
        : msg.arrowType === "filled"
          ? "◀"
          : "<";

      let arrowLine = "";
      for (let i = 0; i < totalWidth; i++) {
        if (i === fromPos || i === toPos) {
          if ((leftToRight && i === toPos) || (!leftToRight && i === fromPos)) {
            arrowLine += arrowHead;
          } else {
            arrowLine += lineChar;
          }
        } else if (i > startPos && i < endPos) {
          arrowLine += lineChar;
        } else if (positions.includes(i)) {
          arrowLine += "│";
        } else {
          arrowLine += " ";
        }
      }

      const labelPos = startPos + Math.floor((arrowLen - msg.label.length) / 2);
      let labelLine = drawLifelines();
      if (msg.label && labelPos > 0) {
        labelLine =
          labelLine.slice(0, labelPos) +
          msg.label +
          labelLine.slice(labelPos + msg.label.length);
      }

      output.push(labelLine);
      output.push(arrowLine);
    };

    drawParticipantBoxes();

    for (const msg of messages) {
      output.push(drawLifelines());
      drawMessage(msg);
    }

    output.push(drawLifelines());

    return { lines: output };
  } catch (e) {
    return {
      lines: source.split("\n"),
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ============================================================================
// Class Diagram ASCII Renderer
// ============================================================================

interface ClassDef {
  name: string;
  members: string[];
  methods: string[];
  annotation?: string;
}

interface ClassRelation {
  from: string;
  to: string;
  type:
    | "inheritance"
    | "composition"
    | "aggregation"
    | "association"
    | "dependency";
  label?: string;
}

function parseClassDiagram(source: string): {
  classes: ClassDef[];
  relations: ClassRelation[];
} {
  const lines = source
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("%%"));
  const classes: ClassDef[] = [];
  const classMap = new Map<string, ClassDef>();
  const relations: ClassRelation[] = [];

  let currentClass: ClassDef | null = null;
  let inClassBlock = false;

  for (const line of lines) {
    if (line.toLowerCase() === "classdiagram") continue;

    const classStartMatch = line.match(/^class\s+(\w+)\s*\{?\s*$/);
    if (classStartMatch) {
      const [, name] = classStartMatch;
      currentClass = { name, members: [], methods: [] };
      inClassBlock = line.includes("{");
      if (!inClassBlock) {
        classes.push(currentClass);
        classMap.set(name, currentClass);
        currentClass = null;
      }
      continue;
    }

    if (line === "}" && currentClass) {
      classes.push(currentClass);
      classMap.set(currentClass.name, currentClass);
      currentClass = null;
      inClassBlock = false;
      continue;
    }

    if (currentClass && inClassBlock) {
      const annotationMatch = line.match(/^<<(\w+)>>$/);
      if (annotationMatch) {
        currentClass.annotation = annotationMatch[1];
        continue;
      }

      if (line.includes("(")) {
        currentClass.methods.push(line);
      } else if (line.length > 0) {
        currentClass.members.push(line);
      }
      continue;
    }

    const inlineClassMatch = line.match(/^class\s+(\w+)\s*\{\s*(.+)\s*\}$/);
    if (inlineClassMatch) {
      const [, name, content] = inlineClassMatch;
      const cls: ClassDef = { name, members: [], methods: [] };
      content.split(/\s+/).forEach((item) => {
        if (item.includes("(")) cls.methods.push(item);
        else if (item.length > 0) cls.members.push(item);
      });
      classes.push(cls);
      classMap.set(name, cls);
      continue;
    }

    const simpleClassMatch = line.match(/^class\s+(\w+)$/);
    if (simpleClassMatch) {
      const [, name] = simpleClassMatch;
      if (!classMap.has(name)) {
        const cls: ClassDef = { name, members: [], methods: [] };
        classes.push(cls);
        classMap.set(name, cls);
      }
      continue;
    }

    const relationMatch = line.match(
      /^(\w+)\s*(<?\.?\.?-+[\|*o>]?[\|*o>]?\.?\.?>?)\s*(\w+)(?:\s*:\s*(.+))?$/
    );
    if (relationMatch) {
      const [, from, arrow, to, label] = relationMatch;

      if (!classMap.has(from)) {
        const cls: ClassDef = { name: from, members: [], methods: [] };
        classes.push(cls);
        classMap.set(from, cls);
      }
      if (!classMap.has(to)) {
        const cls: ClassDef = { name: to, members: [], methods: [] };
        classes.push(cls);
        classMap.set(to, cls);
      }

      let type: ClassRelation["type"] = "association";
      if (arrow.includes("|>")) type = "inheritance";
      else if (arrow.includes("*")) type = "composition";
      else if (arrow.includes("o")) type = "aggregation";
      else if (arrow.includes("..")) type = "dependency";

      relations.push({ from, to, type, label });
    }
  }

  return { classes, relations };
}

export function renderClassAscii(source: string): {
  lines: string[];
  error?: string;
} {
  try {
    const { classes, relations } = parseClassDiagram(source);

    if (classes.length === 0) {
      return { lines: ["(no classes found)"], error: "No classes" };
    }

    const output: string[] = [];

    const getBoxWidth = (cls: ClassDef): number => {
      let maxLen = cls.name.length;
      if (cls.annotation) maxLen = Math.max(maxLen, cls.annotation.length + 4);
      cls.members.forEach((m) => (maxLen = Math.max(maxLen, m.length)));
      cls.methods.forEach((m) => (maxLen = Math.max(maxLen, m.length)));
      return maxLen + 4;
    };

    const drawClass = (cls: ClassDef): string[] => {
      const width = getBoxWidth(cls);
      const lines: string[] = [];
      const hr = "─".repeat(width - 2);

      lines.push(`┌${hr}┐`);

      if (cls.annotation) {
        const annot = `<<${cls.annotation}>>`;
        const pad = Math.floor((width - 2 - annot.length) / 2);
        lines.push(
          `│${" ".repeat(pad)}${annot}${" ".repeat(width - 2 - pad - annot.length)}│`
        );
      }

      const namePad = Math.floor((width - 2 - cls.name.length) / 2);
      lines.push(
        `│${" ".repeat(namePad)}${cls.name}${" ".repeat(width - 2 - namePad - cls.name.length)}│`
      );

      if (cls.members.length > 0 || cls.methods.length > 0) {
        lines.push(`├${hr}┤`);
      }

      for (const m of cls.members) {
        lines.push(`│ ${m}${" ".repeat(width - 3 - m.length)}│`);
      }

      if (cls.members.length > 0 && cls.methods.length > 0) {
        lines.push(`├${hr}┤`);
      }

      for (const m of cls.methods) {
        lines.push(`│ ${m}${" ".repeat(width - 3 - m.length)}│`);
      }

      lines.push(`└${hr}┘`);
      return lines;
    };

    const classBoxes = classes.map((cls) => drawClass(cls));
    const maxHeight = Math.max(...classBoxes.map((b) => b.length));
    const spacing = 4;

    classBoxes.forEach((box) => {
      if (box.length === 0) return;
      const width = box[0].length;
      while (box.length < maxHeight) {
        box.splice(box.length - 1, 0, `│${" ".repeat(width - 2)}│`);
      }
    });

    for (let row = 0; row < maxHeight; row++) {
      let line = "";
      for (let i = 0; i < classBoxes.length; i++) {
        if (i > 0) line += " ".repeat(spacing);
        line += classBoxes[i][row];
      }
      output.push(line);
    }

    if (relations.length > 0) {
      output.push("");
      output.push("Relations:");
      for (const rel of relations) {
        const arrowMap = {
          inheritance: "──▷",
          composition: "──◆",
          aggregation: "──◇",
          association: "───",
          dependency: "╌╌>",
        };
        const arrow = arrowMap[rel.type];
        const label = rel.label ? ` : ${rel.label}` : "";
        output.push(`  ${rel.from} ${arrow} ${rel.to}${label}`);
      }
    }

    return { lines: output };
  } catch (e) {
    return {
      lines: source.split("\n"),
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ============================================================================
// State Diagram ASCII Renderer
// ============================================================================

interface State {
  id: string;
  label: string;
  isStart?: boolean;
  isEnd?: boolean;
}

interface StateTransition {
  from: string;
  to: string;
  label?: string;
}

function parseStateDiagram(source: string): {
  states: State[];
  transitions: StateTransition[];
} {
  const lines = source
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("%%"));
  const states: State[] = [];
  const stateMap = new Map<string, State>();
  const transitions: StateTransition[] = [];

  stateMap.set("[*]", { id: "[*]", label: "●", isStart: true, isEnd: true });

  for (const line of lines) {
    if (line.toLowerCase().startsWith("statediagram")) continue;
    if (line === "direction LR" || line === "direction TB") continue;

    const stateDefMatch = line.match(/^state\s+"([^"]+)"\s+as\s+(\w+)$/);
    if (stateDefMatch) {
      const [, label, id] = stateDefMatch;
      const state: State = { id, label };
      states.push(state);
      stateMap.set(id, state);
      continue;
    }

    const simpleStateMatch = line.match(/^state\s+(\w+)$/);
    if (simpleStateMatch) {
      const [, id] = simpleStateMatch;
      if (!stateMap.has(id)) {
        const state: State = { id, label: id };
        states.push(state);
        stateMap.set(id, state);
      }
      continue;
    }

    const transitionMatch = line.match(
      /^(\[\*\]|\w+)\s*-->\s*(\[\*\]|\w+)(?:\s*:\s*(.+))?$/
    );
    if (transitionMatch) {
      const [, from, to, label] = transitionMatch;

      if (!stateMap.has(from) && from !== "[*]") {
        const state: State = { id: from, label: from };
        states.push(state);
        stateMap.set(from, state);
      }
      if (!stateMap.has(to) && to !== "[*]") {
        const state: State = { id: to, label: to };
        states.push(state);
        stateMap.set(to, state);
      }

      transitions.push({ from, to, label });
    }
  }

  if (transitions.some((t) => t.from === "[*]" || t.to === "[*]")) {
    if (!states.some((s) => s.id === "[*]")) {
      states.unshift({ id: "[*]", label: "●", isStart: true });
    }
  }

  return { states, transitions };
}

export interface StateRenderOptions {
  maxWidth?: number;
}

/**
 * Calculate grid layout for states based on max width
 */
function calculateStateGridLayout(
  states: State[],
  widths: number[],
  maxWidth: number,
  spacing: number
): State[][] {
  const rows: State[][] = [];
  let currentRow: State[] = [];
  let currentWidth = 0;

  for (let i = 0; i < states.length; i++) {
    const stateWidth = widths[i];
    const additionalWidth =
      currentRow.length > 0 ? spacing + stateWidth : stateWidth;

    if (currentWidth + additionalWidth > maxWidth && currentRow.length > 0) {
      // Start new row
      rows.push(currentRow);
      currentRow = [states[i]];
      currentWidth = stateWidth;
    } else {
      currentRow.push(states[i]);
      currentWidth += additionalWidth;
    }
  }

  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  return rows;
}

export function renderStateAscii(
  source: string,
  options?: StateRenderOptions
): { lines: string[]; error?: string } {
  try {
    const { states, transitions } = parseStateDiagram(source);

    if (states.length === 0) {
      return { lines: ["(no states found)"], error: "No states" };
    }

    const output: string[] = [];
    const spacing = 4;
    const maxWidth = options?.maxWidth || Number.POSITIVE_INFINITY;

    const getBoxWidth = (state: State): number => {
      if (state.id === "[*]") return 3;
      return Math.max(8, state.label.length + 4);
    };

    const drawState = (state: State): string[] => {
      if (state.id === "[*]") {
        return [" ● "];
      }

      const width = getBoxWidth(state);
      const lines: string[] = [];

      lines.push(`╭${"─".repeat(width - 2)}╮`);
      const pad = Math.floor((width - 2 - state.label.length) / 2);
      lines.push(
        `│${" ".repeat(pad)}${state.label}${" ".repeat(width - 2 - pad - state.label.length)}│`
      );
      lines.push(`╰${"─".repeat(width - 2)}╯`);

      return lines;
    };

    // Calculate widths for all states
    const stateWidths = states.map((s) => getBoxWidth(s));
    const totalWidth =
      stateWidths.reduce((a, b) => a + b, 0) + (states.length - 1) * spacing;

    // Determine if we need grid layout
    const needsGrid = totalWidth > maxWidth && states.length > 1;
    const stateRows = needsGrid
      ? calculateStateGridLayout(states, stateWidths, maxWidth, spacing)
      : [states];

    // Render each row of states
    for (let rowIdx = 0; rowIdx < stateRows.length; rowIdx++) {
      const rowStates = stateRows[rowIdx];
      const stateBoxes = rowStates.map((s) => drawState(s));
      const maxHeight = Math.max(...stateBoxes.map((b) => b.length));

      // Normalize heights within this row
      stateBoxes.forEach((box, idx) => {
        const state = rowStates[idx];
        if (state.id === "[*]") {
          const topPad = Math.floor((maxHeight - 1) / 2);
          const newBox: string[] = [];
          for (let i = 0; i < maxHeight; i++) {
            newBox.push(i === topPad ? box[0] : "   ");
          }
          stateBoxes[idx] = newBox;
        } else {
          const topPad = Math.floor((maxHeight - box.length) / 2);
          const width = box[0].length;
          const newBox: string[] = [];
          for (let i = 0; i < maxHeight; i++) {
            if (i < topPad || i >= topPad + box.length) {
              newBox.push(" ".repeat(width));
            } else {
              newBox.push(box[i - topPad]);
            }
          }
          stateBoxes[idx] = newBox;
        }
      });

      // Render this row
      for (let row = 0; row < maxHeight; row++) {
        let line = "";
        for (let i = 0; i < stateBoxes.length; i++) {
          if (i > 0) line += " ".repeat(spacing);
          line += stateBoxes[i][row];
        }
        output.push(line);
      }

      // Add blank line between rows (except after last row)
      if (rowIdx < stateRows.length - 1) {
        output.push("");
      }
    }

    if (transitions.length > 0) {
      output.push("");
      output.push("Transitions:");
      for (const t of transitions) {
        const fromLabel = t.from === "[*]" ? "●" : t.from;
        const toLabel = t.to === "[*]" ? "●" : t.to;
        const label = t.label ? ` [${t.label}]` : "";
        output.push(`  ${fromLabel} ──▶ ${toLabel}${label}`);
      }
    }

    return { lines: output };
  } catch (e) {
    return {
      lines: source.split("\n"),
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ============================================================================
// Main Measurement Function
// ============================================================================

/**
 * Measure a mermaid diagram's rendered dimensions without displaying it.
 * Returns the width and height in characters.
 */
export function measureDiagram(code: string): DiagramDimensions {
  const cleanSource = stripMarkdownFences(code);
  const type = detectDiagramType(cleanSource);

  let lines: string[];

  if (type === "flowchart") {
    const result = renderFlowchartAscii(cleanSource);
    lines = result.lines;
  } else if (type === "sequence") {
    const result = renderSequenceAscii(cleanSource);
    lines = result.lines;
  } else if (type === "class") {
    const result = renderClassAscii(cleanSource);
    lines = result.lines;
  } else if (type === "state") {
    const result = renderStateAscii(cleanSource);
    lines = result.lines;
  } else {
    // For unsupported types, use source dimensions
    lines = cleanSource.split("\n");
  }

  const height = lines.length;
  const width = Math.max(...lines.map((line) => line.length), 0);

  return { width, height, type };
}

/**
 * Calculate the minimum size modifier needed for the given dimensions.
 * Thresholds are based on percentage-based pane sizes:
 * - small: 30%x40% ≈ 45 cols, 10 rows (conservative for wrapped content)
 * - medium: 45%x55% ≈ 75 cols, 18 rows
 * - large: 60%x70% ≈ 110 cols, 28 rows
 */
export type SizeModifier = "small" | "medium" | "large";

export function calculateMinimumSize(
  width: number,
  height: number
): SizeModifier {
  // Add padding for component chrome (header, footer, scrollbar, margins)
  const effectiveWidth = width + 4; // 2 chars padding each side
  const effectiveHeight = height + 6; // header, footer, margins

  if (effectiveWidth <= 45 && effectiveHeight <= 10) return "small";
  if (effectiveWidth <= 75 && effectiveHeight <= 18) return "medium";
  return "large";
}

/**
 * Expand size if needed. Only expands, never shrinks.
 * @param currentSize - The size specified by user (or default 'small')
 * @param requiredSize - The size required by content
 * @returns The larger of the two sizes
 */
export function expandIfNeeded(
  currentSize: SizeModifier | undefined,
  requiredSize: SizeModifier
): SizeModifier {
  const order: SizeModifier[] = ["small", "medium", "large"];
  const currentIdx = order.indexOf(currentSize || "small");
  const requiredIdx = order.indexOf(requiredSize);
  return order[Math.max(currentIdx, requiredIdx)] as SizeModifier;
}
