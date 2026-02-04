import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import type { IDockviewPanelProps } from "dockview";
import {
  AlertTriangle,
  ArrowDown,
  Check,
  Copy,
  Search,
  Terminal as TerminalIcon,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import { copyToClipboard } from "@/lib/clipboard";

export interface TmuxPanelParams {
  tmuxSession: string;
  windowIndex: number;
  windowName: string;
  command: string;
}

export default function TmuxPanel({
  params,
  api,
}: IDockviewPanelProps<TmuxPanelParams>) {
  const { tmuxSession, windowIndex, windowName, command } = params;
  const [isAttached, setIsAttached] = useState(false);
  const [isFallbackMode, setIsFallbackMode] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "success" | "error">(
    "idle"
  );
  const [autoScroll, setAutoScroll] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const fullContentRef = useRef("");
  const attachIdRef = useRef<string | null>(null);
  const autoScrollRef = useRef(autoScroll);

  // Keep autoScrollRef in sync
  useEffect(() => {
    autoScrollRef.current = autoScroll;
  }, [autoScroll]);

  // Helper to get CSS variable as hsl color string
  const getCssVar = (name: string): string => {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    return value ? `hsl(${value})` : "";
  };

  // Initialize xterm.js
  useEffect(() => {
    if (!terminalRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: "bar",
      disableStdin: false, // Allow input for tmux
      fontSize: 12,
      fontFamily:
        "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace",
      theme: {
        background: getCssVar("--background"),
        foreground: getCssVar("--foreground"),
        cursor: getCssVar("--foreground"),
        cursorAccent: getCssVar("--background"),
        selectionBackground: getCssVar("--xterm-selection"),
        black: getCssVar("--xterm-black"),
        red: getCssVar("--xterm-red"),
        green: getCssVar("--xterm-green"),
        yellow: getCssVar("--xterm-yellow"),
        blue: getCssVar("--xterm-blue"),
        magenta: getCssVar("--xterm-magenta"),
        cyan: getCssVar("--xterm-cyan"),
        white: getCssVar("--xterm-white"),
        brightBlack: getCssVar("--xterm-bright-black"),
        brightRed: getCssVar("--xterm-bright-red"),
        brightGreen: getCssVar("--xterm-bright-green"),
        brightYellow: getCssVar("--xterm-bright-yellow"),
        brightBlue: getCssVar("--xterm-bright-blue"),
        brightMagenta: getCssVar("--xterm-bright-magenta"),
        brightCyan: getCssVar("--xterm-bright-cyan"),
        brightWhite: getCssVar("--xterm-bright-white"),
      },
      scrollback: 10000,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
    terminal.loadAddon(webLinksAddon);

    terminal.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      // Notify backend of terminal size change
      const sendMessage = (
        window as unknown as {
          awbSendMessage?: (message: unknown) => void;
        }
      ).awbSendMessage;
      if (sendMessage && attachIdRef.current) {
        sendMessage({
          type: "tmux-resize",
          attachId: attachIdRef.current,
          cols: terminal.cols,
          rows: terminal.rows,
        });
      }
    });
    resizeObserver.observe(terminalRef.current);

    // Handle user input - send to tmux
    terminal.onData((data: string) => {
      const sendMessage = (
        window as unknown as {
          awbSendMessage?: (message: unknown) => void;
        }
      ).awbSendMessage;
      if (sendMessage && attachIdRef.current) {
        sendMessage({
          type: "tmux-input",
          attachId: attachIdRef.current,
          data,
        });
      }
    });

    // Detect user scroll to disable auto-scroll
    terminal.onScroll(() => {
      const viewport = terminal.element?.querySelector(".xterm-viewport");
      if (viewport) {
        const isAtBottom =
          viewport.scrollTop >=
          viewport.scrollHeight - viewport.clientHeight - 10;
        if (!isAtBottom && autoScroll) {
          setAutoScroll(false);
        }
      }
    });

    return () => {
      resizeObserver.disconnect();
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, []);

  // Request tmux attach and handle output
  useEffect(() => {
    const attachId = `tmux-${tmuxSession}-${windowIndex}-${Date.now()}`;
    attachIdRef.current = attachId;

    // Request attach
    const sendMessage = (
      window as unknown as {
        awbSendMessage?: (message: unknown) => void;
      }
    ).awbSendMessage;

    if (sendMessage) {
      sendMessage({
        type: "tmux-attach",
        attachId,
        tmuxSession,
        windowIndex,
        cols: xtermRef.current?.cols || 80,
        rows: xtermRef.current?.rows || 24,
      });
      setIsAttached(true);
    }

    // Handle tmux output messages
    const handleMessage = (event: MessageEvent) => {
      try {
        const data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data.type === "tmux-fallback" && data.attachId === attachId) {
          // Server is using fallback mode (polling instead of pty)
          setIsFallbackMode(true);
        } else if (data.type === "tmux-output" && data.attachId === attachId) {
          if (xtermRef.current && data.data) {
            if (data.fullRefresh) {
              // In fallback mode, clear and replace content
              xtermRef.current.clear();
              xtermRef.current.write(data.data);
              fullContentRef.current = data.data;
            } else {
              xtermRef.current.write(data.data);
              fullContentRef.current += data.data;
            }

            if (autoScrollRef.current) {
              xtermRef.current.scrollToBottom();
            }
          }
        } else if (
          data.type === "tmux-detached" &&
          data.attachId === attachId
        ) {
          setIsAttached(false);
          setIsFallbackMode(false);
        }
      } catch {
        // Ignore parse errors
      }
    };

    window.addEventListener("message", handleMessage);

    // Cleanup: detach on unmount
    return () => {
      window.removeEventListener("message", handleMessage);
      if (sendMessage) {
        sendMessage({
          type: "tmux-detach",
          attachId,
        });
      }
    };
  }, [tmuxSession, windowIndex]); // Don't include autoScroll - it would cause reconnect on scroll

  // Update tab title
  useEffect(() => {
    if (api) {
      api.setTitle(windowName || `tmux:${windowIndex}`);
    }
  }, [api, windowName, windowIndex]);

  const handleCopy = async () => {
    const content = fullContentRef.current;
    const success = await copyToClipboard(content);
    setCopyState(success ? "success" : "error");
    setTimeout(() => setCopyState("idle"), 2000);
  };

  const toggleAutoScroll = () => {
    const newAutoScroll = !autoScroll;
    setAutoScroll(newAutoScroll);
    if (newAutoScroll && xtermRef.current) {
      xtermRef.current.scrollToBottom();
    }
  };

  const toggleSearch = () => {
    setShowSearch(!showSearch);
    if (showSearch) {
      setSearchQuery("");
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (searchAddonRef.current && query) {
      searchAddonRef.current.findNext(query, {
        caseSensitive: false,
        wholeWord: false,
        regex: false,
      });
    }
  };

  const handleSearchNext = () => {
    if (searchAddonRef.current && searchQuery) {
      searchAddonRef.current.findNext(searchQuery);
    }
  };

  const handleSearchPrev = () => {
    if (searchAddonRef.current && searchQuery) {
      searchAddonRef.current.findPrevious(searchQuery);
    }
  };

  const handleClosePanel = () => {
    api.close();
  };

  // Handle keyboard shortcut for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setShowSearch(true);
      }
      if (e.key === "Escape" && showSearch) {
        setShowSearch(false);
        setSearchQuery("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showSearch]);

  return (
    <Card className="tmux-panel-container w-full h-full border-0 rounded-none shadow-none flex flex-col bg-background">
      {/* Header */}
      <CardHeader className="panel-header py-2 px-3 flex-shrink-0 bg-background">
        <div className="flex items-center gap-2 ml-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 flex-shrink-0"
            onClick={handleCopy}
            title={copyState === "error" ? "Copy failed" : "Copy"}
          >
            {copyState === "success" ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : copyState === "error" ? (
              <AlertTriangle className="h-4 w-4 text-red-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-6 w-6 p-0 flex-shrink-0 ${autoScroll ? "text-primary" : ""}`}
            onClick={toggleAutoScroll}
            title={autoScroll ? "Auto-scroll enabled" : "Auto-scroll disabled"}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-6 w-6 p-0 flex-shrink-0 ${showSearch ? "text-primary" : ""}`}
            onClick={toggleSearch}
            title="Search (Cmd+F)"
          >
            <Search className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 flex-shrink-0 hover:text-destructive"
            onClick={handleClosePanel}
            title="Close"
          >
            <XCircle className="h-4 w-4" />
          </Button>
          <span
            className={`text-xs px-2 py-0.5 rounded flex-shrink-0 flex items-center gap-1 ${
              isAttached
                ? isFallbackMode
                  ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                  : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
            }`}
            title={
              isFallbackMode ? "Using polling mode (node-pty unavailable)" : ""
            }
          >
            <TerminalIcon className="h-3 w-3" />
            {isAttached ? (isFallbackMode ? "poll" : "tmux") : "detached"}
          </span>
          {command && (
            <div
              className="text-xs text-muted-foreground font-mono truncate flex-1"
              title={command}
            >
              {command}
            </div>
          )}
        </div>
      </CardHeader>

      {/* Search bar */}
      {showSearch && (
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/50">
          <Input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="h-7 text-sm flex-1"
            autoFocus
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={handleSearchPrev}
          >
            ↑
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={handleSearchNext}
          >
            ↓
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={toggleSearch}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Terminal content */}
      <CardContent className="p-0 flex-1 overflow-hidden relative">
        <div ref={terminalRef} className="h-full w-full" />
      </CardContent>
    </Card>
  );
}
