import { Box, Text, useInput, useApp } from 'ink';
import { useState } from 'react';
import { readFileSync } from 'fs';
import { spawn } from 'child_process';
import { useTerminalSize, ScrollBar, useMouseScroll, useFileWatch } from './shared/index.js';
import {
  detectDiagramType,
  stripMarkdownFences,
  renderFlowchartAscii,
  renderSequenceAscii,
  renderClassAscii,
  renderStateAscii,
  type DiagramType,
} from './mermaid-measure.js';

declare const onComplete: (result: unknown) => void;
declare const args: {
  file?: string;
  code?: string;
  title?: string;
  editor?: string; // e.g. "code", "vim", "nano"
  'no-header'?: boolean; // Hide header when pane host shows title
};

export default function MermaidViewer() {
  const { exit } = useApp();
  const { rows, columns } = useTerminalSize();

  const [diagramType, setDiagramType] = useState<DiagramType>('unknown');
  const [asciiLines, setAsciiLines] = useState<string[]>([]);
  const [sourceLines, setSourceLines] = useState<string[]>([]);
  const [verticalScroll, setVerticalScroll] = useState(0);
  const [horizontalScroll, setHorizontalScroll] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'ascii' | 'source'>('ascii');
  const [asciiSupported, setAsciiSupported] = useState(true);
  const [warnings, setWarnings] = useState<string[]>([]);

  const title = args?.title || 'Mermaid Diagram';
  const visibleRows = Math.max(5, rows - 6);
  // Account for padding (2), scrollbar (1), and margin
  const visibleCols = Math.max(20, columns - 4);

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
      let result: { lines: string[]; error?: string; warnings?: string[] } | null = null;

      if (type === 'flowchart') {
        result = renderFlowchartAscii(cleanSource);
      } else if (type === 'sequence') {
        result = renderSequenceAscii(cleanSource);
      } else if (type === 'class') {
        result = renderClassAscii(cleanSource);
      } else if (type === 'state') {
        result = renderStateAscii(cleanSource, { maxWidth: visibleCols });
      }

      if (result) {
        setAsciiLines(result.lines);
        // Always show ASCII view - don't fall back to source on error
        // User can press 'v' to toggle to source if needed
        setAsciiSupported(true);
        setViewMode('ascii');
        setWarnings(result.warnings || (result.error ? [result.error] : []));
      } else {
        // Other diagram types: source view only (no ASCII renderer available)
        setAsciiLines([]);
        setAsciiSupported(false);
        setViewMode('source');
        setWarnings([]);
      }

      // Reset scroll positions on content change
      setVerticalScroll(0);
      setHorizontalScroll(0);
      setError(null);
    } catch (e) {
      setError(`Error loading diagram: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  const lines = viewMode === 'ascii' && asciiSupported ? asciiLines : sourceLines;
  const maxVerticalScroll = Math.max(0, lines.length - visibleRows);
  const maxLineWidth = Math.max(...lines.map(l => l.length), 0);
  const maxHorizontalScroll = Math.max(0, maxLineWidth - visibleCols);
  const showVerticalScrollBar = lines.length > visibleRows;
  const showHorizontalScrollIndicator = maxLineWidth > visibleCols;

  // Mouse scroll support (vertical only)
  useMouseScroll({ scroll: verticalScroll, maxScroll: maxVerticalScroll, setScroll: setVerticalScroll });

  useInput((input, key) => {
    if (key.escape) {
      onComplete({ action: 'accept', type: diagramType });
      exit();
      return;
    }

    if (input === 'v' && asciiSupported) {
      setViewMode(m => m === 'ascii' ? 'source' : 'ascii');
      setVerticalScroll(0);
      setHorizontalScroll(0);
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

    // Vertical scroll
    if (key.upArrow || input === 'k') {
      setVerticalScroll(s => Math.max(0, s - 1));
    }
    if (key.downArrow || input === 'j') {
      setVerticalScroll(s => Math.min(maxVerticalScroll, s + 1));
    }
    if (key.pageUp) {
      setVerticalScroll(s => Math.max(0, s - visibleRows));
    }
    if (key.pageDown) {
      setVerticalScroll(s => Math.min(maxVerticalScroll, s + visibleRows));
    }

    // Horizontal scroll
    if (key.leftArrow || input === 'h') {
      setHorizontalScroll(s => Math.max(0, s - 3));
    }
    if (key.rightArrow || input === 'l') {
      setHorizontalScroll(s => Math.min(maxHorizontalScroll, s + 3));
    }
    // Home/End for horizontal
    if (input === '0' || input === '^') {
      setHorizontalScroll(0);
    }
    if (input === '$') {
      setHorizontalScroll(maxHorizontalScroll);
    }
  });

  if (error) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="red">{error}</Text>
        <Text dimColor>Press Esc to close</Text>
      </Box>
    );
  }

  const displayLines = lines.slice(verticalScroll, verticalScroll + visibleRows);
  const verticalScrollPosition = maxVerticalScroll > 0 ? verticalScroll / maxVerticalScroll : 0;

  // Apply horizontal scroll to each line
  const scrolledLines = displayLines.map(line => {
    if (horizontalScroll === 0) return line;
    return line.slice(horizontalScroll);
  });

  return (
    <Box flexDirection="column">
      {!args?.['no-header'] && (
        <Box paddingX={1}>
          <Text bold color="cyan">{title}</Text>
          <Text dimColor> [{diagramType}]</Text>
          {warnings.length > 0 && <Text color="yellow"> ⚠</Text>}
          <Text dimColor> ({viewMode})</Text>
          {showVerticalScrollBar && (
            <Text dimColor> ({verticalScroll + 1}-{Math.min(verticalScroll + visibleRows, lines.length)}/{lines.length})</Text>
          )}
          {showHorizontalScrollIndicator && horizontalScroll > 0 && (
            <Text dimColor> [←{horizontalScroll}]</Text>
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
          {scrolledLines.map((line, idx) => {
            // Truncate line to visible width
            const truncatedLine = line.length > visibleCols
              ? line.slice(0, visibleCols - 1) + '→'
              : line;

            if (viewMode === 'source') {
              // Syntax highlight source
              let color: string | undefined;
              if (line.startsWith('%%')) color = 'gray';
              else if (line.match(/^(flowchart|graph|sequenceDiagram|classDiagram)/i)) color = 'magenta';
              else if (line.includes('-->') || line.includes('---') || line.includes('->>')) color = 'cyan';
              else if (line.match(/^\s*participant\s/i)) color = 'green';
              else if (line.match(/^\w+\[/)) color = 'green';

              return <Text key={idx} color={color}>{truncatedLine}</Text>;
            } else {
              // ASCII rendering - show as-is
              return <Text key={idx}>{truncatedLine}</Text>;
            }
          })}
        </Box>

        {showVerticalScrollBar && (
          <ScrollBar position={verticalScrollPosition} height={displayLines.length} />
        )}
      </Box>

      {/* Horizontal scroll indicator */}
      {showHorizontalScrollIndicator && (
        <Box paddingX={1}>
          <Text dimColor>
            {'←'.repeat(Math.min(3, Math.ceil(horizontalScroll / 10)))}
            {'─'.repeat(Math.max(1, visibleCols - 6 - Math.min(3, Math.ceil(horizontalScroll / 10)) - Math.min(3, Math.ceil((maxHorizontalScroll - horizontalScroll) / 10))))}
            {'→'.repeat(Math.min(3, Math.ceil((maxHorizontalScroll - horizontalScroll) / 10)))}
          </Text>
        </Box>
      )}

      <Box paddingX={1} marginTop={1}>
        <Text dimColor>
          {asciiSupported ? 'v=toggle view  ' : ''}
          ↑↓/jk=scroll  {showHorizontalScrollIndicator ? '←→/hl=pan  ' : ''}q=close
          {args?.editor && args?.file ? '  e=edit' : ''}
          {showVerticalScrollBar ? '  mouse=scroll' : ''}
        </Text>
      </Box>
    </Box>
  );
}
