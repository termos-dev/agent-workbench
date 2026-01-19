import { Box, Text, useInput, useApp } from 'ink';
import { useState } from 'react';
import { readFileSync } from 'fs';
import { spawn } from 'child_process';
import { mermaidToAscii } from 'mermaid-ascii';
import { useTerminalSize, ScrollBar, useMouseScroll, useFileWatch } from './shared/index.js';

declare const onComplete: (result: unknown) => void;
declare const args: {
  file?: string;
  code?: string;
  title?: string;
  editor?: string; // e.g. "code", "vim", "nano"
  'no-header'?: boolean; // Hide header when pane host shows title
};

type DiagramType = 'flowchart' | 'sequence' | 'class' | 'state' | 'er' | 'unknown';

function detectDiagramType(source: string): DiagramType {
  const firstLine = source.trim().split('\n')[0]?.toLowerCase() || '';

  if (firstLine.startsWith('flowchart') || firstLine.startsWith('graph')) {
    return 'flowchart';
  } else if (firstLine.startsWith('sequencediagram')) {
    return 'sequence';
  } else if (firstLine.startsWith('classdiagram')) {
    return 'class';
  } else if (firstLine.startsWith('statediagram')) {
    return 'state';
  } else if (firstLine.startsWith('erdiagram')) {
    return 'er';
  }
  return 'unknown';
}

function stripMarkdownFences(source: string): string {
  let clean = source.trim();

  // Full fence match: ```mermaid ... ```
  const fenceMatch = clean.match(/^```(?:mermaid)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fenceMatch) {
    return fenceMatch[1];
  }

  // Opening fence only
  if (clean.startsWith('```mermaid')) {
    clean = clean.replace(/^```mermaid\s*\n?/, '');
  } else if (clean.startsWith('```')) {
    clean = clean.replace(/^```\s*\n?/, '');
  }

  // Trailing fence
  clean = clean.replace(/\n```\s*$/, '');

  return clean;
}

interface PreprocessResult {
  source: string;
  warnings: string[];
}

function preprocessFlowchart(source: string): PreprocessResult {
  // mermaid-ascii doesn't support subgraphs or standalone node definitions
  // We need to:
  // 1. Remove subgraph/end blocks
  // 2. Collect node labels from definitions like Node[Label]
  // 3. Keep only edge definitions and the header

  const lines = source.split('\n');
  const processed: string[] = [];
  const nodeLabels = new Map<string, string>(); // id -> label
  const warnings: string[] = [];
  let subgraphDepth = 0;

  // First pass: collect node labels and filter lines
  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('%%')) continue;

    // Skip subgraph declarations
    if (trimmed.match(/^subgraph\s/i)) {
      subgraphDepth++;
      continue;
    }

    // Skip 'end' that closes subgraph
    if (trimmed === 'end' && subgraphDepth > 0) {
      subgraphDepth--;
      continue;
    }

    // Keep header line (graph/flowchart)
    // Normalize TB to TD (mermaid-ascii only supports TD, not TB)
    // Best effort: extract just the direction, ignore extra tokens
    if (trimmed.match(/^(graph|flowchart)\s/i)) {
      const headerMatch = trimmed.match(/^(graph|flowchart)\s+(TB|TD|BT|LR|RL)/i);
      if (headerMatch) {
        const [fullMatch, keyword, direction] = headerMatch;
        const normalizedDirection = direction.toUpperCase() === 'TB' ? 'TD' : direction.toUpperCase();
        const cleanHeader = `${keyword} ${normalizedDirection}`;

        // Check if there was extra content after the direction
        const extraContent = trimmed.slice(fullMatch.length).trim();
        if (extraContent) {
          warnings.push(`Ignored extra content in header: "${extraContent}"`);
        }

        processed.push(cleanHeader);
      } else {
        // No valid direction found, default to TD
        const keywordMatch = trimmed.match(/^(graph|flowchart)/i);
        const keyword = keywordMatch ? keywordMatch[1] : 'graph';
        processed.push(`${keyword} TD`);
        warnings.push(`Could not parse direction, defaulting to TD`);
      }
      continue;
    }

    // Check for standalone node definition: Node[Label] or Node(Label) etc.
    const standaloneMatch = trimmed.match(/^(\w+)\s*[\[\(\{<]([^\]\)\}>]+)[\]\)\}>]\s*$/);
    if (standaloneMatch) {
      const [, id, label] = standaloneMatch;
      nodeLabels.set(id, label);
      continue; // Don't add standalone definitions
    }

    // Check for edge with inline node definitions
    // e.g., A[Label A] --> B[Label B] or A --> B[Label]
    const edgeMatch = trimmed.match(/^(\w+)(?:\s*[\[\(\{<][^\]\)\}>]+[\]\)\}>])?\s*(-->|---|\.-\.>|==>|--?>)\s*(?:\|[^|]*\|)?\s*(\w+)(?:\s*[\[\(\{<]([^\]\)\}>]+)[\]\)\}>])?/);
    if (edgeMatch) {
      const [, , , toId, toLabel] = edgeMatch;
      if (toLabel) nodeLabels.set(toId, toLabel);

      // mermaid-ascii handles labels in edges fine, so keep as-is
      processed.push(trimmed);
      continue;
    }

    // Keep other lines (might be edges in different formats)
    processed.push(trimmed);
  }

  return { source: processed.join('\n'), warnings };
}

function renderFlowchartAscii(source: string): { lines: string[]; error?: string; warnings?: string[] } {
  // Suppress console.debug from mermaid-ascii library
  const originalDebug = console.debug;
  console.debug = () => {};

  try {
    // Preprocess to handle subgraphs
    const { source: processed, warnings } = preprocessFlowchart(source);
    const ascii = mermaidToAscii(processed);
    return { lines: ascii.split('\n'), warnings };
  } catch (e) {
    return {
      lines: source.split('\n'),
      error: e instanceof Error ? e.message : String(e)
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
  style: 'solid' | 'dashed';
  arrowType: 'filled' | 'open';
}

function parseSequenceDiagram(source: string): { participants: Participant[]; messages: Message[] } {
  const lines = source.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));
  const participants: Participant[] = [];
  const participantMap = new Map<string, Participant>();
  const messages: Message[] = [];

  for (const line of lines) {
    // Skip the diagram declaration
    if (line.toLowerCase() === 'sequencediagram') continue;

    // Parse: participant A as Alice
    const participantMatch = line.match(/^participant\s+(\w+)(?:\s+as\s+(.+))?$/i);
    if (participantMatch) {
      const [, id, label] = participantMatch;
      const p: Participant = { id, label: label || id };
      participants.push(p);
      participantMap.set(id, p);
      continue;
    }

    // Parse: A->>B: Message  or  A-->>B: Message  or  A->B: Message  or  A-->B: Message
    const messageMatch = line.match(/^(\w+)\s*(--?>?>)\s*(\w+)\s*:\s*(.*)$/);
    if (messageMatch) {
      const [, from, arrow, to, label] = messageMatch;

      // Auto-create participants if not declared
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
        style: arrow.includes('--') ? 'dashed' : 'solid',
        arrowType: arrow.includes('>>') ? 'filled' : 'open',
      });
    }
  }

  return { participants, messages };
}

function renderSequenceAscii(source: string): { lines: string[]; error?: string } {
  try {
    const { participants, messages } = parseSequenceDiagram(source);

    if (participants.length === 0) {
      return { lines: ['(no participants found)'], error: 'No participants' };
    }

    // Calculate column widths
    const minBoxWidth = 10;
    const colWidths = participants.map(p => Math.max(minBoxWidth, p.label.length + 4));
    const colSpacing = 6; // Space between columns

    // Calculate positions (center of each participant column)
    const positions: number[] = [];
    let x = 0;
    for (let i = 0; i < participants.length; i++) {
      positions.push(x + Math.floor(colWidths[i] / 2));
      x += colWidths[i] + colSpacing;
    }
    const totalWidth = x - colSpacing;

    const output: string[] = [];

    // Draw participant boxes (top)
    const drawParticipantBoxes = () => {
      // Top border
      let topLine = '';
      let midLine = '';
      let botLine = '';

      for (let i = 0; i < participants.length; i++) {
        const p = participants[i];
        const w = colWidths[i];
        const pad = i > 0 ? ' '.repeat(colSpacing) : '';
        topLine += pad + '┌' + '─'.repeat(w - 2) + '┐';
        const labelPad = Math.floor((w - 2 - p.label.length) / 2);
        midLine += pad + '│' + ' '.repeat(labelPad) + p.label + ' '.repeat(w - 2 - labelPad - p.label.length) + '│';
        botLine += pad + '└' + '─'.repeat(w - 2) + '┘';
      }
      output.push(topLine);
      output.push(midLine);
      output.push(botLine);
    };

    // Draw lifelines (vertical lines from each participant)
    const drawLifelines = () => {
      let line = '';
      for (let i = 0; i < participants.length; i++) {
        const pos = positions[i];
        while (line.length < pos) line += ' ';
        line = line.slice(0, pos) + '│' + line.slice(pos + 1);
      }
      // Pad to total width
      while (line.length < totalWidth) line += ' ';
      return line;
    };

    // Draw a message arrow between two participants
    const drawMessage = (msg: Message) => {
      const fromIdx = participants.findIndex(p => p.id === msg.from);
      const toIdx = participants.findIndex(p => p.id === msg.to);
      if (fromIdx === -1 || toIdx === -1) return;

      const fromPos = positions[fromIdx];
      const toPos = positions[toIdx];
      const leftToRight = fromPos < toPos;
      const startPos = Math.min(fromPos, toPos);
      const endPos = Math.max(fromPos, toPos);
      const arrowLen = endPos - startPos;

      // Self-message
      if (fromIdx === toIdx) {
        const base = drawLifelines();
        const selfLine1 = base.slice(0, fromPos + 1) + '─┐' + base.slice(fromPos + 3);
        const selfLine2 = base.slice(0, fromPos) + ' │ ' + msg.label;
        const selfLine3 = base.slice(0, fromPos + 1) + '◄┘' + base.slice(fromPos + 3);
        output.push(selfLine1);
        output.push(selfLine2);
        output.push(selfLine3);
        return;
      }

      // Build the arrow line
      const lineChar = msg.style === 'dashed' ? '╌' : '─';
      const arrowHead = leftToRight ? (msg.arrowType === 'filled' ? '▶' : '>') : (msg.arrowType === 'filled' ? '◀' : '<');

      let arrowLine = '';
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
          arrowLine += '│';
        } else {
          arrowLine += ' ';
        }
      }

      // Center the label above the arrow
      const labelPos = startPos + Math.floor((arrowLen - msg.label.length) / 2);
      let labelLine = drawLifelines();
      if (msg.label && labelPos > 0) {
        labelLine = labelLine.slice(0, labelPos) + msg.label + labelLine.slice(labelPos + msg.label.length);
      }

      output.push(labelLine);
      output.push(arrowLine);
    };

    // Render the diagram
    drawParticipantBoxes();

    for (const msg of messages) {
      output.push(drawLifelines()); // Spacing line
      drawMessage(msg);
    }

    output.push(drawLifelines()); // Final lifeline

    return { lines: output };
  } catch (e) {
    return {
      lines: source.split('\n'),
      error: e instanceof Error ? e.message : String(e)
    };
  }
}

// ============================================================================
// Class Diagram ASCII Renderer
// ============================================================================

interface ClassDef {
  name: string;
  members: string[];      // Properties
  methods: string[];      // Methods
  annotation?: string;    // <<interface>>, <<abstract>>, etc.
}

interface ClassRelation {
  from: string;
  to: string;
  type: 'inheritance' | 'composition' | 'aggregation' | 'association' | 'dependency';
  label?: string;
}

function parseClassDiagram(source: string): { classes: ClassDef[]; relations: ClassRelation[] } {
  const lines = source.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));
  const classes: ClassDef[] = [];
  const classMap = new Map<string, ClassDef>();
  const relations: ClassRelation[] = [];

  let currentClass: ClassDef | null = null;
  let inClassBlock = false;

  for (const line of lines) {
    if (line.toLowerCase() === 'classdiagram') continue;

    // Class block start: class Animal {
    const classStartMatch = line.match(/^class\s+(\w+)\s*\{?\s*$/);
    if (classStartMatch) {
      const [, name] = classStartMatch;
      currentClass = { name, members: [], methods: [] };
      inClassBlock = line.includes('{');
      if (!inClassBlock) {
        // Single line class declaration
        classes.push(currentClass);
        classMap.set(name, currentClass);
        currentClass = null;
      }
      continue;
    }

    // Class block end
    if (line === '}' && currentClass) {
      classes.push(currentClass);
      classMap.set(currentClass.name, currentClass);
      currentClass = null;
      inClassBlock = false;
      continue;
    }

    // Inside class block - parse members/methods
    if (currentClass && inClassBlock) {
      // Annotation: <<interface>>
      const annotationMatch = line.match(/^<<(\w+)>>$/);
      if (annotationMatch) {
        currentClass.annotation = annotationMatch[1];
        continue;
      }

      // Method: +method() or -method() or method()
      if (line.includes('(')) {
        currentClass.methods.push(line);
      } else if (line.length > 0) {
        // Property
        currentClass.members.push(line);
      }
      continue;
    }

    // Inline class with members: class Duck { +swim() }
    const inlineClassMatch = line.match(/^class\s+(\w+)\s*\{\s*(.+)\s*\}$/);
    if (inlineClassMatch) {
      const [, name, content] = inlineClassMatch;
      const cls: ClassDef = { name, members: [], methods: [] };
      content.split(/\s+/).forEach(item => {
        if (item.includes('(')) cls.methods.push(item);
        else if (item.length > 0) cls.members.push(item);
      });
      classes.push(cls);
      classMap.set(name, cls);
      continue;
    }

    // Simple class declaration: class Animal
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

    // Relations: A --|> B (inheritance), A --* B (composition), A --o B (aggregation), A --> B (association)
    const relationMatch = line.match(/^(\w+)\s*(<?\.?\.?-+[\|*o>]?[\|*o>]?\.?\.?>?)\s*(\w+)(?:\s*:\s*(.+))?$/);
    if (relationMatch) {
      const [, from, arrow, to, label] = relationMatch;

      // Auto-create classes
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

      let type: ClassRelation['type'] = 'association';
      if (arrow.includes('|>')) type = 'inheritance';
      else if (arrow.includes('*')) type = 'composition';
      else if (arrow.includes('o')) type = 'aggregation';
      else if (arrow.includes('..')) type = 'dependency';

      relations.push({ from, to, type, label });
    }
  }

  return { classes, relations };
}

function renderClassAscii(source: string): { lines: string[]; error?: string } {
  try {
    const { classes, relations } = parseClassDiagram(source);

    if (classes.length === 0) {
      return { lines: ['(no classes found)'], error: 'No classes' };
    }

    const output: string[] = [];

    // Calculate box widths for each class
    const getBoxWidth = (cls: ClassDef): number => {
      let maxLen = cls.name.length;
      if (cls.annotation) maxLen = Math.max(maxLen, cls.annotation.length + 4);
      cls.members.forEach(m => maxLen = Math.max(maxLen, m.length));
      cls.methods.forEach(m => maxLen = Math.max(maxLen, m.length));
      return maxLen + 4; // padding
    };

    // Draw a single class box
    const drawClass = (cls: ClassDef): string[] => {
      const width = getBoxWidth(cls);
      const lines: string[] = [];
      const hr = '─'.repeat(width - 2);

      lines.push('┌' + hr + '┐');

      // Annotation
      if (cls.annotation) {
        const annot = `<<${cls.annotation}>>`;
        const pad = Math.floor((width - 2 - annot.length) / 2);
        lines.push('│' + ' '.repeat(pad) + annot + ' '.repeat(width - 2 - pad - annot.length) + '│');
      }

      // Class name (centered, bold implied)
      const namePad = Math.floor((width - 2 - cls.name.length) / 2);
      lines.push('│' + ' '.repeat(namePad) + cls.name + ' '.repeat(width - 2 - namePad - cls.name.length) + '│');

      // Separator if has members or methods
      if (cls.members.length > 0 || cls.methods.length > 0) {
        lines.push('├' + hr + '┤');
      }

      // Members (properties)
      for (const m of cls.members) {
        lines.push('│ ' + m + ' '.repeat(width - 3 - m.length) + '│');
      }

      // Separator between members and methods
      if (cls.members.length > 0 && cls.methods.length > 0) {
        lines.push('├' + hr + '┤');
      }

      // Methods
      for (const m of cls.methods) {
        lines.push('│ ' + m + ' '.repeat(width - 3 - m.length) + '│');
      }

      lines.push('└' + hr + '┘');
      return lines;
    };

    // Arrange classes horizontally with spacing
    const classBoxes = classes.map(cls => drawClass(cls));
    const maxHeight = Math.max(...classBoxes.map(b => b.length));
    const spacing = 4;

    // Pad all boxes to same height
    classBoxes.forEach(box => {
      if (box.length === 0) return;
      const width = box[0].length;
      while (box.length < maxHeight) {
        box.splice(box.length - 1, 0, '│' + ' '.repeat(width - 2) + '│');
      }
    });

    // Merge horizontally
    for (let row = 0; row < maxHeight; row++) {
      let line = '';
      for (let i = 0; i < classBoxes.length; i++) {
        if (i > 0) line += ' '.repeat(spacing);
        line += classBoxes[i][row];
      }
      output.push(line);
    }

    // Add relations below
    if (relations.length > 0) {
      output.push('');
      output.push('Relations:');
      for (const rel of relations) {
        const arrowMap = {
          inheritance: '──▷',
          composition: '──◆',
          aggregation: '──◇',
          association: '───',
          dependency: '╌╌>',
        };
        const arrow = arrowMap[rel.type];
        const label = rel.label ? ` : ${rel.label}` : '';
        output.push(`  ${rel.from} ${arrow} ${rel.to}${label}`);
      }
    }

    return { lines: output };
  } catch (e) {
    return {
      lines: source.split('\n'),
      error: e instanceof Error ? e.message : String(e)
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

function parseStateDiagram(source: string): { states: State[]; transitions: StateTransition[] } {
  const lines = source.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));
  const states: State[] = [];
  const stateMap = new Map<string, State>();
  const transitions: StateTransition[] = [];

  // Add special start/end states
  stateMap.set('[*]', { id: '[*]', label: '●', isStart: true, isEnd: true });

  for (const line of lines) {
    if (line.toLowerCase().startsWith('statediagram')) continue;
    if (line === 'direction LR' || line === 'direction TB') continue;

    // State definition: state "Description" as s1
    const stateDefMatch = line.match(/^state\s+"([^"]+)"\s+as\s+(\w+)$/);
    if (stateDefMatch) {
      const [, label, id] = stateDefMatch;
      const state: State = { id, label };
      states.push(state);
      stateMap.set(id, state);
      continue;
    }

    // Simple state: state StateName
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

    // Transition: s1 --> s2 : label  or  [*] --> s1
    const transitionMatch = line.match(/^(\[\*\]|\w+)\s*-->\s*(\[\*\]|\w+)(?:\s*:\s*(.+))?$/);
    if (transitionMatch) {
      const [, from, to, label] = transitionMatch;

      // Auto-create states
      if (!stateMap.has(from) && from !== '[*]') {
        const state: State = { id: from, label: from };
        states.push(state);
        stateMap.set(from, state);
      }
      if (!stateMap.has(to) && to !== '[*]') {
        const state: State = { id: to, label: to };
        states.push(state);
        stateMap.set(to, state);
      }

      transitions.push({ from, to, label });
    }
  }

  // Add [*] to states if used
  if (transitions.some(t => t.from === '[*]' || t.to === '[*]')) {
    if (!states.some(s => s.id === '[*]')) {
      states.unshift({ id: '[*]', label: '●', isStart: true });
    }
  }

  return { states, transitions };
}

function renderStateAscii(source: string): { lines: string[]; error?: string } {
  try {
    const { states, transitions } = parseStateDiagram(source);

    if (states.length === 0) {
      return { lines: ['(no states found)'], error: 'No states' };
    }

    const output: string[] = [];

    // Calculate box widths
    const getBoxWidth = (state: State): number => {
      if (state.id === '[*]') return 3;
      return Math.max(8, state.label.length + 4);
    };

    // Draw a state box
    const drawState = (state: State): string[] => {
      if (state.id === '[*]') {
        return [' ● '];
      }

      const width = getBoxWidth(state);
      const lines: string[] = [];

      // Rounded corners for states
      lines.push('╭' + '─'.repeat(width - 2) + '╮');
      const pad = Math.floor((width - 2 - state.label.length) / 2);
      lines.push('│' + ' '.repeat(pad) + state.label + ' '.repeat(width - 2 - pad - state.label.length) + '│');
      lines.push('╰' + '─'.repeat(width - 2) + '╯');

      return lines;
    };

    // Arrange states horizontally
    const stateBoxes = states.map(s => drawState(s));
    const maxHeight = Math.max(...stateBoxes.map(b => b.length));
    const spacing = 4;

    // Pad boxes to same height (center vertically)
    stateBoxes.forEach((box, idx) => {
      const state = states[idx];
      if (state.id === '[*]') {
        // Center the dot vertically
        const topPad = Math.floor((maxHeight - 1) / 2);
        const newBox: string[] = [];
        for (let i = 0; i < maxHeight; i++) {
          newBox.push(i === topPad ? box[0] : '   ');
        }
        stateBoxes[idx] = newBox;
      } else {
        const topPad = Math.floor((maxHeight - box.length) / 2);
        const width = box[0].length;
        const newBox: string[] = [];
        for (let i = 0; i < maxHeight; i++) {
          if (i < topPad || i >= topPad + box.length) {
            newBox.push(' '.repeat(width));
          } else {
            newBox.push(box[i - topPad]);
          }
        }
        stateBoxes[idx] = newBox;
      }
    });

    // Merge horizontally
    for (let row = 0; row < maxHeight; row++) {
      let line = '';
      for (let i = 0; i < stateBoxes.length; i++) {
        if (i > 0) line += ' '.repeat(spacing);
        line += stateBoxes[i][row];
      }
      output.push(line);
    }

    // Add transitions below
    if (transitions.length > 0) {
      output.push('');
      output.push('Transitions:');
      for (const t of transitions) {
        const fromLabel = t.from === '[*]' ? '●' : t.from;
        const toLabel = t.to === '[*]' ? '●' : t.to;
        const label = t.label ? ` [${t.label}]` : '';
        output.push(`  ${fromLabel} ──▶ ${toLabel}${label}`);
      }
    }

    return { lines: output };
  } catch (e) {
    return {
      lines: source.split('\n'),
      error: e instanceof Error ? e.message : String(e)
    };
  }
}

export default function MermaidViewer() {
  const { exit } = useApp();
  const { rows } = useTerminalSize();

  const [diagramType, setDiagramType] = useState<DiagramType>('unknown');
  const [asciiLines, setAsciiLines] = useState<string[]>([]);
  const [sourceLines, setSourceLines] = useState<string[]>([]);
  const [scroll, setScroll] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'ascii' | 'source'>('ascii');
  const [asciiSupported, setAsciiSupported] = useState(true);
  const [warnings, setWarnings] = useState<string[]>([]);

  const title = args?.title || 'Mermaid Diagram';
  const visibleLines = Math.max(5, rows - 6);

  useFileWatch(args?.file, () => {
    try {
      let source = '';

      if (args?.code) {
        source = args.code;
      } else if (args?.file) {
        source = readFileSync(args.file, 'utf-8');
      } else {
        setError('No diagram. Use --file <path> or --code <mermaid>');
        return;
      }

      // Strip markdown fences
      const cleanSource = stripMarkdownFences(source);
      const type = detectDiagramType(cleanSource);
      setDiagramType(type);
      setSourceLines(cleanSource.split('\n'));

      // Render ASCII based on diagram type
      let result: { lines: string[]; error?: string } | null = null;

      if (type === 'flowchart') {
        result = renderFlowchartAscii(cleanSource);
      } else if (type === 'sequence') {
        result = renderSequenceAscii(cleanSource);
      } else if (type === 'class') {
        result = renderClassAscii(cleanSource);
      } else if (type === 'state') {
        result = renderStateAscii(cleanSource);
      }

      if (result) {
        setAsciiLines(result.lines);
        setAsciiSupported(!result.error);
        setViewMode(result.error ? 'source' : 'ascii');
        setWarnings(result.warnings || []);
      } else {
        // Other diagram types: source view only
        setAsciiLines([]);
        setAsciiSupported(false);
        setViewMode('source');
        setWarnings([]);
      }

      setError(null);
    } catch (e) {
      setError(`Error loading diagram: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  const lines = viewMode === 'ascii' && asciiSupported ? asciiLines : sourceLines;
  const maxScroll = Math.max(0, lines.length - visibleLines);
  const showScrollBar = lines.length > visibleLines;

  // Mouse scroll support
  useMouseScroll({ scroll, maxScroll, setScroll });

  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      onComplete({ action: 'accept', type: diagramType });
      exit();
      return;
    }

    if (input === 'v' && asciiSupported) {
      setViewMode(m => m === 'ascii' ? 'source' : 'ascii');
      setScroll(0);
    }

    // Open in editor
    if (input === 'e' && args?.editor && args?.file) {
      const fullCmd = `${args.editor} "${args.file}"`;
      spawn(fullCmd, [], {
        shell: true,
        detached: true,
        stdio: 'ignore',
      }).unref();

      onComplete({ action: 'edit', file: args.file, editor: fullCmd });
      exit();
      return;
    }

    if (key.upArrow || input === 'k') {
      setScroll(s => Math.max(0, s - 1));
    }
    if (key.downArrow || input === 'j') {
      setScroll(s => Math.min(maxScroll, s + 1));
    }
    if (key.pageUp) {
      setScroll(s => Math.max(0, s - visibleLines));
    }
    if (key.pageDown) {
      setScroll(s => Math.min(maxScroll, s + visibleLines));
    }
  });

  if (error) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="red">{error}</Text>
        <Text dimColor>Press q to close</Text>
      </Box>
    );
  }

  const displayLines = lines.slice(scroll, scroll + visibleLines);
  const scrollPosition = maxScroll > 0 ? scroll / maxScroll : 0;

  return (
    <Box flexDirection="column">
      {!args?.['no-header'] && (
        <Box paddingX={1}>
          <Text bold color="cyan">{title}</Text>
          <Text dimColor> [{diagramType}]</Text>
          {warnings.length > 0 && <Text color="yellow"> ⚠</Text>}
          <Text dimColor> ({viewMode})</Text>
          {showScrollBar && (
            <Text dimColor> ({scroll + 1}-{Math.min(scroll + visibleLines, lines.length)}/{lines.length})</Text>
          )}
        </Box>
      )}
      {warnings.length > 0 && viewMode === 'ascii' && (
        <Box paddingX={1}>
          <Text color="yellow" dimColor>⚠ {warnings[0]}</Text>
        </Box>
      )}

      <Box flexDirection="row">
        <Box flexDirection="column" paddingX={1} marginTop={1} flexGrow={1}>
          {displayLines.map((line, idx) => {
            if (viewMode === 'source') {
              // Syntax highlight source
              let color: string | undefined;
              if (line.startsWith('%%')) color = 'gray';
              else if (line.match(/^(flowchart|graph|sequenceDiagram|classDiagram)/i)) color = 'magenta';
              else if (line.includes('-->') || line.includes('---') || line.includes('->>')) color = 'cyan';
              else if (line.match(/^\s*participant\s/i)) color = 'green';
              else if (line.match(/^\w+\[/)) color = 'green';

              return <Text key={idx} color={color}>{line}</Text>;
            } else {
              // ASCII rendering - show as-is
              return <Text key={idx}>{line}</Text>;
            }
          })}
        </Box>

        {showScrollBar && (
          <ScrollBar position={scrollPosition} height={displayLines.length} />
        )}
      </Box>

      <Box paddingX={1} marginTop={1}>
        <Text dimColor>
          {asciiSupported ? 'v=toggle view  ' : ''}
          ↑↓/jk=scroll  q=close
          {args?.editor && args?.file ? '  e=edit' : ''}
          {showScrollBar ? '  mouse=scroll' : ''}
        </Text>
      </Box>
    </Box>
  );
}
