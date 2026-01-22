import { Box, Text } from 'ink';
import React from 'react';

export type TableRow = Record<string, unknown>;

export interface ParsedTableData {
  rows: TableRow[];
  columns: string[];
}

export interface TableParseError {
  message: string;
  context?: string;
}

/**
 * Parse JSON string into table data with validation
 */
export function parseTableData(
  input: string | unknown[] | Record<string, unknown>,
  columnOverride?: string
): { data: ParsedTableData } | { error: TableParseError } {
  try {
    let rows: TableRow[];

    if (typeof input === 'string') {
      const parsed = JSON.parse(input);
      rows = normalizeToRows(parsed);
    } else if (Array.isArray(input)) {
      rows = normalizeToRows(input);
    } else if (typeof input === 'object' && input !== null) {
      rows = normalizeToRows(input);
    } else {
      return { error: { message: 'Invalid input: expected JSON string, array, or object' } };
    }

    if (rows.length === 0) {
      return { error: { message: 'No data to display' } };
    }

    // Determine columns
    let columns: string[];
    if (columnOverride) {
      columns = columnOverride.split(',').map(c => c.trim());
    } else {
      columns = Object.keys(rows[0]);
    }

    if (columns.length === 0) {
      return { error: { message: 'No columns found in data' } };
    }

    return { data: { rows, columns } };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    const context = typeof input === 'string' ? getJsonErrorContext(input, err) : undefined;
    return { error: { message: err.message, context } };
  }
}

function normalizeToRows(data: unknown): TableRow[] {
  if (Array.isArray(data)) {
    return data.map(item => {
      if (typeof item === 'object' && item !== null) {
        return item as TableRow;
      }
      return { value: item };
    });
  }

  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    // Support {headers, rows} format
    if (Array.isArray(obj.headers) && Array.isArray(obj.rows)) {
      const headers = obj.headers as string[];
      return (obj.rows as unknown[][]).map(row => {
        const result: TableRow = {};
        headers.forEach((h, i) => {
          result[h] = row[i] ?? '';
        });
        return result;
      });
    }
    // Single object becomes single row
    return [obj as TableRow];
  }

  return [];
}

function getJsonErrorContext(content: string, error: Error): string {
  const msg = error.message;
  const posMatch = msg.match(/position\s+(\d+)/i);
  if (posMatch) {
    const pos = parseInt(posMatch[1], 10);
    const start = Math.max(0, pos - 20);
    const end = Math.min(content.length, pos + 20);
    const snippet = content.slice(start, end);
    const pointer = ' '.repeat(Math.min(20, pos - start)) + '^';
    return `...${snippet}...\n${pointer}`;
  }
  const lineMatch = msg.match(/line\s+(\d+)/i);
  if (lineMatch) {
    const lineNum = parseInt(lineMatch[1], 10);
    const lines = content.split('\n');
    if (lineNum > 0 && lineNum <= lines.length) {
      const line = lines[lineNum - 1];
      return `Line ${lineNum}: ${line.length > 60 ? line.slice(0, 60) + '...' : line}`;
    }
  }
  return content.length > 80 ? content.slice(0, 80) + '...' : content;
}

/**
 * Calculate optimal column widths based on data
 */
export function getColumnWidths(
  rows: TableRow[],
  columns: string[],
  maxWidth: number
): number[] {
  return columns.map(col => {
    const headerLen = col.length;
    const maxDataLen = rows.reduce((max, row) => {
      const val = String(row[col] ?? '');
      return Math.max(max, val.length);
    }, 0);
    return Math.min(Math.max(headerLen, maxDataLen, 3), maxWidth);
  });
}

/**
 * Truncate string to fit width with ellipsis
 */
export function truncateCell(str: string, len: number): string {
  if (str.length <= len) return str.padEnd(len);
  return str.slice(0, len - 1) + '…';
}

// Box drawing characters
const BOX = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
  teeDown: '┬',
  teeUp: '┴',
  teeRight: '├',
  teeLeft: '┤',
  cross: '┼',
};

export interface TableRendererProps {
  data: ParsedTableData;
  width: number;
  maxRows?: number;
  selectedRow?: number | null;
  scroll?: number;
  compact?: boolean;
}

/**
 * Pure table renderer component - no input handling, just rendering
 */
export function TableRenderer({
  data,
  width,
  maxRows,
  selectedRow = null,
  scroll = 0,
  compact = false,
}: TableRendererProps) {
  const { rows, columns } = data;

  // Calculate column widths
  const padding = columns.length * 3 + 4; // borders + spacing
  const maxColWidth = Math.max(8, Math.floor((width - padding) / columns.length));
  const colWidths = getColumnWidths(rows, columns, maxColWidth);

  // Slice rows for display
  const displayRows = maxRows ? rows.slice(scroll, scroll + maxRows) : rows;

  // Build borders
  const topBorder = BOX.topLeft + colWidths.map(w => BOX.horizontal.repeat(w + 2)).join(BOX.teeDown) + BOX.topRight;
  const headerSep = BOX.teeRight + colWidths.map(w => BOX.horizontal.repeat(w + 2)).join(BOX.cross) + BOX.teeLeft;
  const bottomBorder = BOX.bottomLeft + colWidths.map(w => BOX.horizontal.repeat(w + 2)).join(BOX.teeUp) + BOX.bottomRight;

  if (compact) {
    // Compact mode: no borders, just aligned columns
    return (
      <Box flexDirection="column">
        {/* Header */}
        <Text>
          {columns.map((col, i) => (
            <Text key={col} bold color="cyan">
              {truncateCell(col, colWidths[i])}{i < columns.length - 1 ? '  ' : ''}
            </Text>
          ))}
        </Text>
        {/* Data rows */}
        {displayRows.map((row, displayIdx) => {
          const actualIdx = scroll + displayIdx;
          const isSelected = actualIdx === selectedRow;
          return (
            <Text key={actualIdx} inverse={isSelected}>
              {columns.map((col, i) => (
                <Text key={col}>
                  {truncateCell(String(row[col] ?? ''), colWidths[i])}{i < columns.length - 1 ? '  ' : ''}
                </Text>
              ))}
            </Text>
          );
        })}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {/* Top border */}
      <Text dimColor>{topBorder}</Text>

      {/* Header row */}
      <Text>
        <Text dimColor>{BOX.vertical}</Text>
        {columns.map((col, i) => (
          <Text key={col}>
            <Text bold color="cyan"> {truncateCell(col, colWidths[i])} </Text>
            <Text dimColor>{BOX.vertical}</Text>
          </Text>
        ))}
      </Text>

      {/* Header separator */}
      <Text dimColor>{headerSep}</Text>

      {/* Data rows */}
      {displayRows.map((row, displayIdx) => {
        const actualIdx = scroll + displayIdx;
        const isSelected = actualIdx === selectedRow;

        return (
          <Text key={actualIdx} inverse={isSelected}>
            <Text dimColor>{BOX.vertical}</Text>
            {columns.map((col, i) => (
              <Text key={col}>
                <Text> {truncateCell(String(row[col] ?? ''), colWidths[i])} </Text>
                <Text dimColor>{BOX.vertical}</Text>
              </Text>
            ))}
          </Text>
        );
      })}

      {/* Bottom border */}
      <Text dimColor>{bottomBorder}</Text>
    </Box>
  );
}

/**
 * Error display component for table parsing errors
 */
export function TableError({ error }: { error: TableParseError }) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color="red">Error: {error.message}</Text>
      {error.context && <Text dimColor>{error.context}</Text>}
    </Box>
  );
}
