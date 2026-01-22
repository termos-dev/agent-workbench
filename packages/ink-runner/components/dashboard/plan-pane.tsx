import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { readFileSync, existsSync } from 'fs';
import { spawn } from 'child_process';
import * as path from 'path';
import { useFileWatch, ScrollBar, useMouseScroll } from '../shared/index.js';

interface PlanPaneProps {
  planFile: string | undefined;
  isActive: boolean;
  height: number;
  width: number;
  onEdit?: () => void;
}

// Simple markdown rendering (adapted from markdown.tsx)
function renderLine(line: string, idx: number) {
  if (line.startsWith('### ')) {
    return <Text key={idx} color="yellow">{line.slice(4)}</Text>;
  }
  if (line.startsWith('## ')) {
    return <Text key={idx} bold color="cyan">{line.slice(3)}</Text>;
  }
  if (line.startsWith('# ')) {
    return <Text key={idx} bold color="green">{line.slice(2)}</Text>;
  }
  if (line.startsWith('- [ ] ')) {
    return <Text key={idx}><Text color="gray">☐</Text> {line.slice(6)}</Text>;
  }
  if (line.startsWith('- [x] ')) {
    return <Text key={idx}><Text color="green">☑</Text> {line.slice(6)}</Text>;
  }
  if (line.startsWith('- ')) {
    return <Text key={idx}><Text color="blue">•</Text> {line.slice(2)}</Text>;
  }
  if (line.startsWith('```')) {
    return <Text key={idx} dimColor>{line}</Text>;
  }
  if (!line.trim()) {
    return <Text key={idx}> </Text>;
  }
  return <Text key={idx}>{line}</Text>;
}

// Detect editor from environment
function getEditor(): string {
  return process.env.VISUAL || process.env.EDITOR || 'vim';
}

export function PlanPane({ planFile, isActive, height, width, onEdit }: PlanPaneProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [scroll, setScroll] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [editorStatus, setEditorStatus] = useState<string | null>(null);

  // Validate and normalize plan file path
  const validPlanFile = React.useMemo(() => {
    if (!planFile || typeof planFile !== 'string') return undefined;
    try {
      // Ensure the path is absolute and valid
      const resolved = path.resolve(planFile);
      return resolved;
    } catch {
      return undefined;
    }
  }, [planFile]);

  const visibleLines = Math.max(3, height - 3); // Leave room for header and hints
  const maxScroll = Math.max(0, lines.length - visibleLines);
  const showScrollBar = lines.length > visibleLines;

  // Load file content
  const loadContent = useCallback(() => {
    if (!validPlanFile) {
      setLines(['No plan file associated with this session']);
      setError(null);
      return;
    }

    try {
      if (!existsSync(validPlanFile)) {
        setLines([`Plan file not found: ${validPlanFile}`]);
        setError('not_found');
        return;
      }

      const content = readFileSync(validPlanFile, 'utf-8');
      setLines(content.split('\n'));
      setError(null);
    } catch (e) {
      setLines([`Error reading plan file: ${e instanceof Error ? e.message : String(e)}`]);
      setError('read_error');
    }
  }, [validPlanFile]);

  // Watch plan file for changes
  useFileWatch(validPlanFile, loadContent, { interval: 500 });

  // Mouse scroll support
  useMouseScroll({ scroll, maxScroll, setScroll });

  // Keyboard handling
  useInput((input, key) => {
    if (!isActive) return;

    // Scroll
    if (key.upArrow || input === 'k') {
      setScroll(s => Math.max(0, s - 1));
      return;
    }
    if (key.downArrow || input === 'j') {
      setScroll(s => Math.min(maxScroll, s + 1));
      return;
    }
    if (key.pageUp) {
      setScroll(s => Math.max(0, s - visibleLines));
      return;
    }
    if (key.pageDown) {
      setScroll(s => Math.min(maxScroll, s + visibleLines));
      return;
    }

    // Go to top/bottom
    if (input === 'g') {
      setScroll(0);
      return;
    }
    if (input === 'G') {
      setScroll(maxScroll);
      return;
    }

    // Edit plan file (detached mode - editor opens in background)
    if (input === 'e' && validPlanFile && !error) {
      const editor = getEditor();
      const line = scroll + 1;

      // Build editor command with line number support
      let editorCmd: string;
      if (editor.includes('vim') || editor.includes('nvim')) {
        editorCmd = `${editor} +${line} "${validPlanFile}"`;
      } else if (editor.includes('code')) {
        editorCmd = `${editor} --goto "${validPlanFile}:${line}"`;
      } else if (editor.includes('hx') || editor.includes('helix')) {
        editorCmd = `${editor} "${validPlanFile}:${line}"`;
      } else if (editor.includes('nano')) {
        editorCmd = `${editor} +${line} "${validPlanFile}"`;
      } else {
        editorCmd = `${editor} "${validPlanFile}"`;
      }

      // Launch editor in background (detached) - TUI continues running
      const child = spawn(editorCmd, [], {
        shell: true,
        detached: true,
        stdio: 'ignore',
      });
      child.unref();

      // Show status message
      const editorName = path.basename(editor.split(' ')[0]);
      setEditorStatus(`Opened in ${editorName}. Switch to editor, save to refresh.`);

      // Clear status after 5 seconds
      setTimeout(() => setEditorStatus(null), 5000);

      child.on('error', (err) => {
        setEditorStatus(`Failed to open editor: ${err.message}`);
        setTimeout(() => setEditorStatus(null), 5000);
      });

      onEdit?.();
    }
  });

  const displayLines = lines.slice(scroll, scroll + visibleLines);
  const scrollPosition = maxScroll > 0 ? scroll / maxScroll : 0;
  const fileName = validPlanFile ? path.basename(validPlanFile) : 'No Plan';

  return (
    <Box flexDirection="column" height={height} width={width}>
      {/* Header */}
      <Box>
        <Text bold color={isActive ? 'cyan' : 'gray'}>📋 {fileName}</Text>
        {showScrollBar && (
          <Text dimColor> ({scroll + 1}-{Math.min(scroll + visibleLines, lines.length)}/{lines.length})</Text>
        )}
        {editorStatus && (
          <Text color="yellow"> • {editorStatus}</Text>
        )}
      </Box>

      {/* Content */}
      <Box flexDirection="row" flexGrow={1}>
        <Box flexDirection="column" flexGrow={1} overflow="hidden">
          {displayLines.map((line, idx) => renderLine(line, idx))}
        </Box>

        {showScrollBar && (
          <ScrollBar position={scrollPosition} height={displayLines.length} />
        )}
      </Box>

      {/* Hints (only when active) */}
      {isActive && (
        <Box>
          <Text dimColor>
            j/k scroll  g/G top/bottom
            {validPlanFile && !error && '  e edit'}
          </Text>
        </Box>
      )}
    </Box>
  );
}

export default PlanPane;
