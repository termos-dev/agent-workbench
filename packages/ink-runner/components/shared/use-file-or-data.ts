/**
 * Hook for loading content from either a file or inline data.
 * Supports file watching for live updates and optional JSON parsing.
 *
 * Usage:
 * ```tsx
 * // String content (e.g., markdown, code)
 * const { content, lines, error, loading } = useFileOrData({
 *   file: args?.file,
 *   data: args?.content,
 * });
 *
 * // JSON data
 * const { data, error, loading } = useFileOrData<MyType>({
 *   file: args?.file,
 *   data: args?.data,
 *   parseJson: true,
 * });
 * ```
 */

import { readFileSync } from "node:fs";
import { useEffect, useState } from "react";
import { useFileWatch } from "./use-file-watch.js";

export interface UseFileOrDataOptions<T = string> {
  /** File path to read from */
  file?: string;
  /** Inline data (string or already parsed) */
  data?: string | T;
  /** Parse content as JSON (default: false) */
  parseJson?: boolean;
  /** Error message when neither file nor data is provided */
  noDataError?: string;
}

export interface UseFileOrDataResult<T = string> {
  /** Raw content as string (when parseJson is false) */
  content: string;
  /** Content split by newlines (convenience for display) */
  lines: string[];
  /** Parsed data (when parseJson is true) */
  data: T | null;
  /** Error message if loading failed */
  error: string | null;
  /** Loading state */
  loading: boolean;
}

export function useFileOrData<T = string>(
  options: UseFileOrDataOptions<T>
): UseFileOrDataResult<T> {
  const {
    file,
    data,
    parseJson = false,
    noDataError = "No data specified. Use --file <path> or --data <content>",
  } = options;

  const [content, setContent] = useState<string>("");
  const [lines, setLines] = useState<string[]>([]);
  const [parsedData, setParsedData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Handle inline data (no file watching needed)
  useEffect(() => {
    if (data !== undefined && data !== null) {
      try {
        if (parseJson) {
          // Data might already be parsed or be a string
          const parsed = typeof data === "string" ? JSON.parse(data) : data;
          setParsedData(parsed as T);
          const jsonStr =
            typeof data === "string" ? data : JSON.stringify(data, null, 2);
          setContent(jsonStr);
          setLines(jsonStr.split("\n"));
        } else {
          const strData =
            typeof data === "string" ? data : JSON.stringify(data, null, 2);
          setContent(strData);
          setLines(strData.split("\n"));
        }
        setError(null);
        setLoading(false);
      } catch (e) {
        setError(
          `Failed to parse data: ${e instanceof Error ? e.message : String(e)}`
        );
        setLoading(false);
      }
    }
  }, [data, parseJson]);

  // Handle file content with watching (only when no inline data)
  useFileWatch(data === undefined ? file : undefined, () => {
    if (data !== undefined) return; // Skip if using inline data

    if (!file) {
      setError(noDataError);
      setLoading(false);
      return;
    }

    try {
      const text = readFileSync(file, "utf-8");

      if (parseJson) {
        const parsed = JSON.parse(text);
        setParsedData(parsed as T);
      }

      setContent(text);
      setLines(text.split("\n"));
      setError(null);
      setLoading(false);
    } catch (e) {
      const isJsonError = parseJson && e instanceof SyntaxError;
      const errorMsg = isJsonError
        ? `Invalid JSON in ${file}: ${e.message}`
        : `Error reading ${file}: ${e instanceof Error ? e.message : String(e)}`;
      setError(errorMsg);
      setLoading(false);
    }
  });

  return {
    content,
    lines,
    data: parsedData,
    error,
    loading,
  };
}
