import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import type { IDockviewPanelProps } from "dockview";
import { AlertTriangle, ArrowDown, Check, Copy, Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import { copyToClipboard } from "@/lib/clipboard";

export interface OutputPanelParams {
  interactionId: string;
  sessionName: string;
  title: string;
  command: string;
  outputFile: string;
}

export default function OutputPanel({
  params,
  api,
}: IDockviewPanelProps<OutputPanelParams>) {
  const { interactionId, sessionName, title, command, outputFile } = params;
  const [isComplete, setIsComplete] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "success" | "error">(
    "idle"
  );
  const [autoScroll, setAutoScroll] = useState(true);
  const [showKillConfirm, setShowKillConfirm] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const writtenLengthRef = useRef(0);
  const fullContentRef = useRef("");

  // Initialize xterm.js
  useEffect(() => {
    if (!terminalRef.current) return;

    const terminal = new Terminal({
      cursorBlink: false,
      cursorStyle: "bar",
      disableStdin: true,
      fontSize: 12,
      fontFamily:
        "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace",
      theme: {
        background: "hsl(224, 71%, 4%)", // Dark background matching card
        foreground: "hsl(213, 31%, 91%)",
        cursor: "transparent",
        cursorAccent: "transparent",
        selectionBackground: "rgba(255, 255, 255, 0.3)",
        black: "#1e1e2e",
        red: "#f38ba8",
        green: "#a6e3a1",
        yellow: "#f9e2af",
        blue: "#89b4fa",
        magenta: "#f5c2e7",
        cyan: "#94e2d5",
        white: "#cdd6f4",
        brightBlack: "#585b70",
        brightRed: "#f38ba8",
        brightGreen: "#a6e3a1",
        brightYellow: "#f9e2af",
        brightBlue: "#89b4fa",
        brightMagenta: "#f5c2e7",
        brightCyan: "#94e2d5",
        brightWhite: "#a6adc8",
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
    });
    resizeObserver.observe(terminalRef.current);

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

  // Poll for file updates
  const fetchContent = useCallback(() => {
    const sendMessage = (
      window as unknown as {
        awbSendMessage?: (message: unknown) => void;
      }
    ).awbSendMessage;

    if (sendMessage && outputFile) {
      sendMessage({ type: "read-file", path: outputFile });
    }
  }, [outputFile]);

  // Handle file content updates from WebSocket
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      try {
        const data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data.type === "file-content" && data.path === outputFile) {
          const newContent = data.content || "";
          fullContentRef.current = newContent;

          // Write only the new content to terminal
          if (
            xtermRef.current &&
            newContent.length > writtenLengthRef.current
          ) {
            const newPart = newContent.slice(writtenLengthRef.current);
            xtermRef.current.write(newPart);
            writtenLengthRef.current = newContent.length;

            // Auto-scroll to bottom if enabled
            if (autoScroll) {
              xtermRef.current.scrollToBottom();
            }
          }

          // Check if process has exited
          const exitMatch = newContent.match(
            /\[Process exited with code (\d+)\]/
          );
          if (exitMatch) {
            setIsComplete(true);
            setExitCode(Number.parseInt(exitMatch[1], 10));
          }
        }
      } catch {
        // Ignore parse errors
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [outputFile, autoScroll]);

  // Start polling when component mounts
  useEffect(() => {
    // Initial fetch
    fetchContent();

    // Poll every 500ms while not complete
    pollIntervalRef.current = setInterval(() => {
      if (!isComplete) {
        fetchContent();
      }
    }, 500);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [fetchContent, isComplete]);

  const handleKillProcess = async () => {
    try {
      const sendMessage = (
        window as unknown as {
          awbSendMessage?: (message: unknown) => void;
        }
      ).awbSendMessage;

      if (sendMessage) {
        sendMessage({ type: "kill-process", interactionId, sessionName });
      }

      // Mark as complete and close
      setIsComplete(true);
      setShowKillConfirm(false);

      // Wait a moment for the kill to process, then dismiss
      setTimeout(() => {
        const respond = (
          window as unknown as {
            awbRespond?: (
              id: string,
              sessionName: string,
              response: unknown
            ) => void;
          }
        ).awbRespond;
        if (respond) {
          respond(interactionId, sessionName, { action: "accept" });
        }
      }, 100);
    } catch (err) {
      console.error("Failed to kill process:", err);
    }
  };

  const handleCancelKill = () => {
    setShowKillConfirm(false);
  };

  const handleCopy = async () => {
    // Copy the full terminal content
    const content = fullContentRef.current;
    const success = await copyToClipboard(content);
    setCopyState(success ? "success" : "error");
    setTimeout(() => setCopyState("idle"), 2000);
  };

  const toggleAutoScroll = () => {
    const newAutoScroll = !autoScroll;
    setAutoScroll(newAutoScroll);
    if (newAutoScroll && xtermRef.current) {
      // If enabling, scroll to bottom immediately
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

  // Update tab title to show spinner when running
  useEffect(() => {
    if (api) {
      const baseTitle = title || "Output";
      const newTitle = !isComplete ? `⟳ ${baseTitle}` : baseTitle;
      api.setTitle(newTitle);
    }
  }, [api, title, isComplete]);

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
    <Card className="output-panel-container w-full h-full border-0 rounded-none shadow-none flex flex-col">
      {/* Header - single row */}
      <CardHeader className="panel-header py-2 px-3 flex-shrink-0">
        <div className="flex items-center gap-2">
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
          {isComplete ? (
            <span
              className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${
                exitCode === 0
                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                  : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
              }`}
            >
              Exit: {exitCode}
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded flex-shrink-0 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 animate-pulse">
              Running...
            </span>
          )}
          {command && (
            <div
              className="text-xs text-muted-foreground font-mono truncate flex-1"
              title={command}
            >
              $ {command}
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

        {/* Kill confirmation overlay */}
        {showKillConfirm && (
          <div className="absolute inset-0 bg-background/95 flex items-center justify-center z-50">
            <Card className="w-96 shadow-lg">
              <CardHeader>
                <div className="text-base font-semibold">
                  Process Still Running
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  This process is still running. Do you want to kill it?
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelKill}
                  >
                    No, Keep Running
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleKillProcess}
                  >
                    Yes, Kill Process
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
