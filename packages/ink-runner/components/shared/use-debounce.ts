import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Debounce a value - returns value after it has stopped changing for `delay` ms.
 *
 * @param value - The value to debounce
 * @param delay - Debounce delay in milliseconds
 * @returns The debounced value
 *
 * @example
 * const [searchTerm, setSearchTerm] = useState("");
 * const debouncedSearch = useDebounce(searchTerm, 300);
 * // debouncedSearch updates 300ms after user stops typing
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Debounce a callback function - delays invocation until after `delay` ms
 * have elapsed since the last call.
 *
 * @param callback - The function to debounce
 * @param delay - Debounce delay in milliseconds
 * @returns A debounced version of the callback
 *
 * @example
 * const handleSearch = useDebouncedCallback((term: string) => {
 *   api.search(term);
 * }, 300);
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  // Keep callback ref up to date
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  );
}

/**
 * Throttle a value - returns value at most once per `interval` ms.
 *
 * @param value - The value to throttle
 * @param interval - Throttle interval in milliseconds
 * @returns The throttled value
 *
 * @example
 * const [scrollPosition, setScrollPosition] = useState(0);
 * const throttledScroll = useThrottle(scrollPosition, 100);
 * // throttledScroll updates at most every 100ms
 */
export function useThrottle<T>(value: T, interval: number): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastUpdated = useRef<number>(Date.now());

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastUpdated.current;

    if (elapsed >= interval) {
      // Enough time has passed, update immediately
      setThrottledValue(value);
      lastUpdated.current = now;
    } else {
      // Schedule update for remaining time
      const remainingTime = interval - elapsed;
      const timer = setTimeout(() => {
        setThrottledValue(value);
        lastUpdated.current = Date.now();
      }, remainingTime);

      return () => {
        clearTimeout(timer);
      };
    }
  }, [value, interval]);

  return throttledValue;
}

/**
 * Throttle a callback function - limits invocation to at most once per `interval` ms.
 * Uses leading edge throttling (first call executes immediately).
 *
 * @param callback - The function to throttle
 * @param interval - Throttle interval in milliseconds
 * @returns A throttled version of the callback
 *
 * @example
 * const handleScroll = useThrottledCallback((position: number) => {
 *   updateUI(position);
 * }, 100);
 */
export function useThrottledCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  interval: number
): (...args: Parameters<T>) => void {
  const lastCalledRef = useRef<number>(0);
  const pendingArgsRef = useRef<Parameters<T> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  // Keep callback ref up to date
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      const elapsed = now - lastCalledRef.current;

      if (elapsed >= interval) {
        // Execute immediately
        lastCalledRef.current = now;
        callbackRef.current(...args);
        pendingArgsRef.current = null;
      } else {
        // Store args and schedule trailing call
        pendingArgsRef.current = args;

        if (!timeoutRef.current) {
          const remainingTime = interval - elapsed;
          timeoutRef.current = setTimeout(() => {
            if (pendingArgsRef.current) {
              lastCalledRef.current = Date.now();
              callbackRef.current(...pendingArgsRef.current);
              pendingArgsRef.current = null;
            }
            timeoutRef.current = null;
          }, remainingTime);
        }
      }
    },
    [interval]
  );
}
