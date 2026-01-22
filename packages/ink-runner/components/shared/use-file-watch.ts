import { useEffect } from 'react';
import { watchFile, unwatchFile, existsSync } from 'fs';
import * as path from 'path';

const DEFAULT_INTERVAL = 1000;

interface FileWatchOptions {
  deps?: readonly unknown[];
  interval?: number;
}

/**
 * Hook to watch a file for changes and call a callback when it changes.
 * Also calls the callback immediately on mount.
 *
 * @param filePath - Path to watch (if undefined, only calls onLoad once)
 * @param onLoad - Callback to run on mount and when file changes
 * @param options - Optional deps array and interval (default 1000ms)
 */
export function useFileWatch(
  filePath: string | undefined,
  onLoad: () => void,
  options: FileWatchOptions = {}
): void {
  const { deps = [], interval = DEFAULT_INTERVAL } = options;

  useEffect(() => {
    // Safe callback wrapper
    const safeOnLoad = () => {
      try {
        onLoad();
      } catch (err) {
        console.error('useFileWatch callback error:', err);
      }
    };

    safeOnLoad();

    if (filePath) {
      try {
        // Validate path before watching
        const normalizedPath = path.resolve(filePath);

        // Only watch if the parent directory exists (file may not exist yet)
        const parentDir = path.dirname(normalizedPath);
        if (!existsSync(parentDir)) {
          return;
        }

        watchFile(normalizedPath, { interval }, safeOnLoad);
        return () => {
          try {
            unwatchFile(normalizedPath);
          } catch {
            // Ignore unwatch errors
          }
        };
      } catch (err) {
        console.error('useFileWatch setup error:', err);
      }
    }
  }, [filePath, ...deps]);
}

/**
 * Hook to watch multiple files for changes.
 * Calls the callback when any of the files change.
 *
 * @param filePaths - Array of paths to watch (filters out undefined)
 * @param onLoad - Callback to run on mount and when any file changes
 * @param options - Optional deps array and interval (default 1000ms)
 */
export function useMultiFileWatch(
  filePaths: (string | undefined)[],
  onLoad: () => void,
  options: FileWatchOptions = {}
): void {
  const { deps = [], interval = DEFAULT_INTERVAL } = options;

  useEffect(() => {
    // Safe callback wrapper
    const safeOnLoad = () => {
      try {
        onLoad();
      } catch (err) {
        console.error('useMultiFileWatch callback error:', err);
      }
    };

    safeOnLoad();

    const validPaths = filePaths.filter((p): p is string => !!p);
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
  }, [...filePaths, ...deps]);
}
