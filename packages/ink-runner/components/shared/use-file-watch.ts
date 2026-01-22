import { existsSync, unwatchFile, watchFile } from "node:fs";
import * as path from "node:path";
import { useEffect } from "react";

const DEFAULT_INTERVAL = 1000;

interface FileWatchOptions {
  deps?: readonly unknown[];
  interval?: number;
}

/**
 * Hook to watch one or more files for changes.
 * Calls the callback immediately on mount and when any watched file changes.
 *
 * @param filePaths - Path(s) to watch. Accepts string, string[], or undefined.
 * @param onLoad - Callback to run on mount and when file changes
 * @param options - Optional deps array and interval (default 1000ms)
 */
export function useFileWatch(
  filePaths: string | (string | undefined)[] | undefined,
  onLoad: () => void,
  options: FileWatchOptions = {}
): void {
  const { deps = [], interval = DEFAULT_INTERVAL } = options;

  // Normalize to array
  const pathsArray = Array.isArray(filePaths) ? filePaths : [filePaths];

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional - don't restart watchers when callbacks change
  useEffect(() => {
    const safeOnLoad = () => {
      try {
        onLoad();
      } catch (err) {
        console.error("useFileWatch callback error:", err);
      }
    };

    safeOnLoad();

    const validPaths = pathsArray.filter((p): p is string => !!p);
    const watchedPaths: string[] = [];

    for (const filePath of validPaths) {
      try {
        const normalizedPath = path.resolve(filePath);
        const parentDir = path.dirname(normalizedPath);
        if (existsSync(parentDir)) {
          watchFile(normalizedPath, { interval }, safeOnLoad);
          watchedPaths.push(normalizedPath);
        }
      } catch {
        // Skip paths that can't be watched
      }
    }

    return () => {
      for (const watchedPath of watchedPaths) {
        try {
          unwatchFile(watchedPath);
        } catch {
          // Ignore unwatch errors
        }
      }
    };
  }, [...pathsArray, ...deps]);
}

/** @deprecated Use useFileWatch with array instead */
export const useMultiFileWatch = useFileWatch;
