import { Box, Text, useInput, useApp } from 'ink';
import { useState, useRef } from 'react';
import { readFileSync } from 'fs';
import {
  useTerminalSize,
  ScrollBar,
  useMouseScroll,
  useFileWatch,
  parseTableData,
  TableRenderer,
  TableError,
  type ParsedTableData,
  type TableParseError,
} from './shared/index.js';

declare const onComplete: (result: unknown) => void;
declare const args: {
  file?: string;
  data?: string;      // JSON string
  rows?: string;      // alias for data
  content?: string;   // alias for data
  columns?: string;   // comma-separated column names
  title?: string;
  select?: string;    // "true" to enable row selection
  'no-header'?: boolean; // Hide header when pane host shows title
};

export default function TableViewer() {
  const { exit } = useApp();
  const { rows: termRows, columns: termCols } = useTerminalSize();

  const [tableData, setTableData] = useState<ParsedTableData | null>(null);
  const [scroll, setScroll] = useState(0);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [error, setError] = useState<TableParseError | null>(null);

  const title = args?.title || 'Table';
  const selectMode = args?.select === 'true';
  const visibleRows = Math.max(3, termRows - 8);

  const isFirstLoad = useRef(true);

  useFileWatch(args?.file, () => {
    try {
      let input: string | undefined;

      const dataArg = args?.data || args?.rows || args?.content;
      if (dataArg) {
        input = dataArg;
      } else if (args?.file) {
        input = readFileSync(args.file, 'utf-8');
      } else {
        setError({ message: 'No data. Use --file <path> or --data <json>' });
        return;
      }

      const result = parseTableData(input, args?.columns);

      if ('error' in result) {
        setError(result.error);
        return;
      }

      setTableData(result.data);
      setError(null);

      // Only set initial selection on first load
      if (isFirstLoad.current && selectMode) {
        isFirstLoad.current = false;
        setSelectedRow(0);
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError({ message: err.message });
    }
  });

  const rows = tableData?.rows || [];
  const maxScroll = Math.max(0, rows.length - visibleRows);
  const showScrollBar = rows.length > visibleRows;

  // Mouse scroll support
  useMouseScroll({ scroll, maxScroll, setScroll });

  useInput((input, key) => {
    if (key.escape) {
      onComplete({
        action: 'accept',
        rows: rows.length,
        selectedRow: selectedRow !== null ? rows[selectedRow] : null,
        selectedIndex: selectedRow,
      });
      exit();
      return;
    }

    if (key.return && selectMode && selectedRow !== null) {
      onComplete({
        action: 'accept',
        rows: rows.length,
        selectedRow: rows[selectedRow],
        selectedIndex: selectedRow,
      });
      exit();
      return;
    }

    if (key.upArrow || input === 'k') {
      if (selectMode && selectedRow !== null) {
        const newSel = Math.max(0, selectedRow - 1);
        setSelectedRow(newSel);
        if (newSel < scroll) setScroll(newSel);
      } else {
        setScroll(s => Math.max(0, s - 1));
      }
    }

    if (key.downArrow || input === 'j') {
      if (selectMode && selectedRow !== null) {
        const newSel = Math.min(rows.length - 1, selectedRow + 1);
        setSelectedRow(newSel);
        if (newSel >= scroll + visibleRows) setScroll(Math.min(maxScroll, newSel - visibleRows + 1));
      } else {
        setScroll(s => Math.min(maxScroll, s + 1));
      }
    }

    if (key.pageUp) {
      setScroll(s => Math.max(0, s - visibleRows));
      if (selectMode && selectedRow !== null) {
        setSelectedRow(s => Math.max(0, (s ?? 0) - visibleRows));
      }
    }

    if (key.pageDown) {
      setScroll(s => Math.min(maxScroll, s + visibleRows));
      if (selectMode && selectedRow !== null) {
        setSelectedRow(s => Math.min(rows.length - 1, (s ?? 0) + visibleRows));
      }
    }
  });

  if (error) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <TableError error={error} />
        <Text dimColor>Press Esc to close</Text>
      </Box>
    );
  }

  if (!tableData) {
    return (
      <Box paddingX={1}>
        <Text dimColor>Loading...</Text>
      </Box>
    );
  }

  const scrollPosition = maxScroll > 0 ? scroll / maxScroll : 0;

  return (
    <Box flexDirection="column">
      {!args?.['no-header'] && (
        <Box paddingX={1}>
          <Text dimColor>{title} ({rows.length} rows)</Text>
          {showScrollBar && (
            <Text dimColor> [{scroll + 1}-{Math.min(scroll + visibleRows, rows.length)}]</Text>
          )}
        </Box>
      )}

      <Box flexDirection="row">
        <Box flexDirection="column" paddingX={1} flexGrow={1}>
          <TableRenderer
            data={tableData}
            width={termCols - 4}
            maxRows={visibleRows}
            selectedRow={selectMode ? selectedRow : null}
            scroll={scroll}
          />
        </Box>

        {showScrollBar && (
          <ScrollBar position={scrollPosition} height={Math.min(visibleRows, rows.length) + 3} />
        )}
      </Box>

      <Box paddingX={1}>
        <Text dimColor>
          ↑↓/jk=scroll  PgUp/PgDn  {selectMode ? 'Enter=select  ' : ''}q=close
          {showScrollBar ? '  mouse=scroll' : ''}
        </Text>
      </Box>
    </Box>
  );
}
