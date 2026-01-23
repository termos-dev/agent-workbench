import {
  type FSWatcher,
  existsSync,
  unwatchFile,
  watch,
  watchFile,
} from "node:fs";
import * as path from "node:path";
import { useEffect, useRef } from "react";

const DEFAULT_DEBOUNCE_MS = 100;
const FALLBACK_POLL_INTERVAL = 1000;

interface FileWatchOptions {
  deps?: readonly unknown[];
  /** Debounce delay in ms (default: 100ms) */
  debounceMs?: number;
  /** @deprecated Use debounceMs instead */
  interval?: number;
}

/**
 * Create a debounced function that delays invocation until after
 * `delay` milliseconds have elapsed since the last call.
 */
function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): { call: T; cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const call = ((...args: unknown[]) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn(...args);
    }, delay);
  }) as T;

  const cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return { call, cancel };
}

/**
 * Hook to watch one or more files for changes using event-driven fs.watch().
 * Falls back to polling fs.watchFile() on error (e.g., certain network filesystems).
 *
 * Features:
 * - Event-driven (lower CPU than polling)
 * - Debounced callbacks (handles rapid file changes)
 * - Robust fallback for macOS quirks and error conditions
 * - Auto-reattaches on 'rename' events (file rotation)
 *
 * @param filePaths - Path(s) to watch. Accepts string, string[], or undefined.
 * @param onLoad - Callback to run on mount and when file changes
 * @param options - Optional deps array and debounceMs (default 100ms)
 */
export function useFileWatch(
  filePaths: string | (string | undefined)[] | undefined,
  onLoad: () => void,
  options: FileWatchOptions = {}
): void {
  const { deps = [], debounceMs = DEFAULT_DEBOUNCE_MS } = options;

  // Normalize to array
  const pathsArray = Array.isArray(filePaths) ? filePaths : [filePaths];

  // Track if we've fallen back to polling for each path
  const usingPollingRef = useRef<Set<string>>(new Set());

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional - don't restart watchers when callbacks change
  useEffect(() => {
    const safeOnLoad = () => {
      try {
        onLoad();
      } catch (err) {
        console.error("useFileWatch callback error:", err);
      }
    };

    // Create debounced callback
    const debouncedOnLoad = debounce(safeOnLoad, debounceMs);

    // Call immediately on mount
    safeOnLoad();

    const validPaths = pathsArray.filter((p): p is string => !!p);
    const watchers: FSWatcher[] = [];
    const pollingPaths: string[] = [];

    /**
     * Setup event-driven watcher for a file with fallback to polling.
     */
    const setupWatcher = (filePath: string): FSWatcher | null => {
      try {
        const watcher = watch(filePath, (eventType) => {
          if (eventType === "change") {
            debouncedOnLoad.call();
          } else if (eventType === "rename") {
            // File was renamed/rotated - reattach watcher
            // Close current watcher and setup new one
            try {
              watcher.close();
            } catch {
              // Ignore close errors
            }
            // Wait briefly for file to reappear, then reattach
            setTimeout(() => {
              if (existsSync(filePath)) {
                const newWatcher = setupWatcher(filePath);
                if (newWatcher) {
                  watchers.push(newWatcher);
                }
                debouncedOnLoad.call();
              }
            }, 50);
          }
        });

        watcher.on("error", () => {
          // fs.watch failed - fall back to polling
          try {
            watcher.close();
          } catch {
            // Ignore
          }
          if (!usingPollingRef.current.has(filePath)) {
            usingPollingRef.current.add(filePath);
            watchFile(filePath, { interval: FALLBACK_POLL_INTERVAL }, () => {
              debouncedOnLoad.call();
            });
            pollingPaths.push(filePath);
          }
        });

        return watcher;
      } catch {
        // fs.watch not supported - use polling fallback
        if (!usingPollingRef.current.has(filePath)) {
          usingPollingRef.current.add(filePath);
          try {
            watchFile(filePath, { interval: FALLBACK_POLL_INTERVAL }, () => {
              debouncedOnLoad.call();
            });
            pollingPaths.push(filePath);
          } catch {
            // Skip paths that can't be watched at all
          }
        }
        return null;
      }
    };

    for (const filePath of validPaths) {
      try {
        const normalizedPath = path.resolve(filePath);
        const parentDir = path.dirname(normalizedPath);
        if (existsSync(parentDir)) {
          const watcher = setupWatcher(normalizedPath);
          if (watcher) {
            watchers.push(watcher);
          }
        }
      } catch {
        // Skip paths that can't be watched
      }
    }

    return () => {
      // Cancel any pending debounced calls
      debouncedOnLoad.cancel();

      // Close event-driven watchers
      for (const watcher of watchers) {
        try {
          watcher.close();
        } catch {
          // Ignore close errors
        }
      }

      // Unwatch polling paths
      for (const pollingPath of pollingPaths) {
        try {
          unwatchFile(pollingPath);
          usingPollingRef.current.delete(pollingPath);
        } catch {
          // Ignore unwatch errors
        }
      }
    };
  }, [...pathsArray, ...deps]);
}

/** @deprecated Use useFileWatch with array instead */
export const useMultiFileWatch = useFileWatch;
