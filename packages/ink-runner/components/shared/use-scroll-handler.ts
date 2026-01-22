/**
 * Unified scroll handler hook that combines:
 * - Scroll state management
 * - Keyboard input handling (↑↓, PgUp/PgDn, g/G)
 * - Mouse scroll support
 *
 * Usage:
 * ```tsx
 * const { scroll, scrollPosition, showScrollBar, handleScrollInput } = useScrollHandler({
 *   totalItems: lines.length,
 *   visibleItems: visibleLines,
 * });
 *
 * useInput((input, key) => {
 *   if (handleScrollInput(input, key)) return;
 *   // ... other input handling
 * });
 * ```
 */

import type { Key } from "ink";
import { useCallback, useState } from "react";
import { useMouseScroll } from "./use-mouse-scroll.js";

export interface UseScrollHandlerOptions {
  /** Total number of items (e.g., lines.length) */
  totalItems: number;
  /** Number of visible items in the viewport */
  visibleItems: number;
  /** Initial scroll position (default: 0) */
  initialScroll?: number;
  /** Enable g/G for top/bottom navigation (default: true) */
  enableGotoKeys?: boolean;
  /** Enable mouse scroll (default: true) */
  enableMouse?: boolean;
}

export interface UseScrollHandlerResult {
  /** Current scroll offset (0-based index of first visible item) */
  scroll: number;
  /** Set scroll position directly */
  setScroll: React.Dispatch<React.SetStateAction<number>>;
  /** Maximum scroll value */
  maxScroll: number;
  /** Scroll position as 0-1 ratio (for scrollbar) */
  scrollPosition: number;
  /** Whether to show scrollbar (totalItems > visibleItems) */
  showScrollBar: boolean;
  /**
   * Handle scroll-related input. Returns true if input was handled.
   * Call this at the start of useInput callback.
   */
  handleScrollInput: (input: string, key: Key) => boolean;
  /** Scroll up by one line */
  scrollUp: () => void;
  /** Scroll down by one line */
  scrollDown: () => void;
  /** Scroll up by one page */
  pageUp: () => void;
  /** Scroll down by one page */
  pageDown: () => void;
  /** Go to top */
  goToTop: () => void;
  /** Go to bottom */
  goToBottom: () => void;
}

export function useScrollHandler(
  options: UseScrollHandlerOptions
): UseScrollHandlerResult {
  const {
    totalItems,
    visibleItems,
    initialScroll = 0,
    enableGotoKeys = true,
    enableMouse = true,
  } = options;

  const [scroll, setScroll] = useState(initialScroll);

  const maxScroll = Math.max(0, totalItems - visibleItems);
  const showScrollBar = totalItems > visibleItems;
  const scrollPosition = maxScroll > 0 ? scroll / maxScroll : 0;

  // Ensure scroll stays within bounds when totalItems changes
  if (scroll > maxScroll) {
    setScroll(Math.max(0, maxScroll));
  }

  const scrollUp = useCallback(() => {
    setScroll((s) => Math.max(0, s - 1));
  }, []);

  const scrollDown = useCallback(() => {
    setScroll((s) => Math.min(maxScroll, s + 1));
  }, [maxScroll]);

  const pageUp = useCallback(() => {
    setScroll((s) => Math.max(0, s - visibleItems));
  }, [visibleItems]);

  const pageDown = useCallback(() => {
    setScroll((s) => Math.min(maxScroll, s + visibleItems));
  }, [maxScroll, visibleItems]);

  const goToTop = useCallback(() => {
    setScroll(0);
  }, []);

  const goToBottom = useCallback(() => {
    setScroll(maxScroll);
  }, [maxScroll]);

  // Mouse scroll support
  if (enableMouse) {
    useMouseScroll({ scroll, maxScroll, setScroll });
  }

  const handleScrollInput = useCallback(
    (input: string, key: Key): boolean => {
      // Up arrow or 'k'
      if (key.upArrow) {
        scrollUp();
        return true;
      }

      // Down arrow or 'j'
      if (key.downArrow) {
        scrollDown();
        return true;
      }

      // Page up
      if (key.pageUp) {
        pageUp();
        return true;
      }

      // Page down
      if (key.pageDown) {
        pageDown();
        return true;
      }

      // g = go to top, G = go to bottom
      if (enableGotoKeys) {
        if (input === "g") {
          goToTop();
          return true;
        }
        if (input === "G") {
          goToBottom();
          return true;
        }
      }

      return false;
    },
    [
      scrollUp,
      scrollDown,
      pageUp,
      pageDown,
      goToTop,
      goToBottom,
      enableGotoKeys,
    ]
  );

  return {
    scroll,
    setScroll,
    maxScroll,
    scrollPosition,
    showScrollBar,
    handleScrollInput,
    scrollUp,
    scrollDown,
    pageUp,
    pageDown,
    goToTop,
    goToBottom,
  };
}
