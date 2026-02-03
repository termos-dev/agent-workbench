import { useCallback, useEffect, useRef, useState } from "react";

export interface Interaction {
  id: string;
  component: string;
  title?: string;
  prompt?: string;
  options?: Array<{ label: string; value: string }>;
  args?: Record<string, unknown>;
  ts: number;
  agentSessionId?: string;
  project?: string;
}

export interface ProjectInteractions {
  project: string;
  sessionName: string;
  interactions: Interaction[];
}

interface WebSocketMessage {
  type:
    | "update"
    | "connected"
    | "error"
    | "file-content"
    | "file-saved"
    | "focus";
  projects?: ProjectInteractions[];
  message?: string;
  interactionId?: string;
  projectName?: string;
}

interface UseWebSocketOptions {
  onUpdate?: (projects: ProjectInteractions[]) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onFocus?: (interactionId: string, projectName: string) => void;
}

interface UseWebSocketResult {
  projects: ProjectInteractions[];
  connected: boolean;
  connecting: boolean; // True during initial connection attempt (before first connect/fail)
  retryIn: number; // Seconds until next retry (0 if connected)
  respond: (
    interactionId: string,
    sessionName: string,
    response: unknown
  ) => void;
  sendMessage: (message: unknown) => void;
  sendTextMessage: (sessionName: string, text: string) => void;
}

const WS_URL = `ws://${window.location.hostname}:${window.location.port || 3847}/ws`;
const RECONNECT_DELAY = 2000;
const MAX_RECONNECT_DELAY = 30000;

export function useWebSocket(
  options: UseWebSocketOptions = {}
): UseWebSocketResult {
  const { onUpdate, onConnect, onDisconnect, onFocus } = options;
  const [projects, setProjects] = useState<ProjectInteractions[]>([]);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true); // True until first successful connect or failed attempt
  const [retryIn, setRetryIn] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const reconnectDelayRef = useRef(RECONNECT_DELAY);

  // Use refs for callbacks to avoid reconnection loops
  const onUpdateRef = useRef(onUpdate);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onFocusRef = useRef(onFocus);

  // Keep refs in sync
  useEffect(() => {
    onUpdateRef.current = onUpdate;
    onConnectRef.current = onConnect;
    onDisconnectRef.current = onDisconnect;
    onFocusRef.current = onFocus;
  }, [onUpdate, onConnect, onDisconnect, onFocus]);

  const connect = useCallback(() => {
    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[WebSocket] Connected");
        setConnected(true);
        setConnecting(false);
        setRetryIn(0);
        // Clear countdown interval
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        reconnectDelayRef.current = RECONNECT_DELAY; // Reset delay on successful connection
        onConnectRef.current?.();
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;

          if (message.type === "update" && message.projects) {
            setProjects(message.projects);
            onUpdateRef.current?.(message.projects);
          } else if (message.type === "connected") {
            console.log("[WebSocket] Server acknowledged connection");
          } else if (message.type === "error") {
            console.error("[WebSocket] Server error:", message.message);
          } else if (
            message.type === "file-content" ||
            message.type === "file-saved"
          ) {
            // Forward file-related messages to the window for components to receive
            window.postMessage(event.data, "*");
          } else if (
            message.type === "focus" &&
            message.interactionId &&
            message.projectName
          ) {
            onFocusRef.current?.(message.interactionId, message.projectName);
          }
        } catch (err) {
          console.error("[WebSocket] Failed to parse message:", err);
        }
      };

      ws.onclose = (event) => {
        console.log("[WebSocket] Disconnected:", event.code, event.reason);
        setConnected(false);
        setConnecting(false);
        wsRef.current = null;
        onDisconnectRef.current?.();

        // Start countdown for retry
        const delayMs = reconnectDelayRef.current;
        let remaining = Math.ceil(delayMs / 1000);
        setRetryIn(remaining);

        // Update countdown every second
        countdownIntervalRef.current = setInterval(() => {
          remaining -= 1;
          setRetryIn(Math.max(0, remaining));
        }, 1000);

        // Schedule reconnect with exponential backoff
        reconnectTimeoutRef.current = setTimeout(() => {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          console.log("[WebSocket] Attempting reconnect...");
          reconnectDelayRef.current = Math.min(
            reconnectDelayRef.current * 2,
            MAX_RECONNECT_DELAY
          );
          connect();
        }, delayMs);
      };

      ws.onerror = (error) => {
        console.error("[WebSocket] Error:", error);
      };
    } catch (err) {
      console.error("[WebSocket] Failed to connect:", err);
      // Schedule reconnect
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectDelayRef.current = Math.min(
          reconnectDelayRef.current * 2,
          MAX_RECONNECT_DELAY
        );
        connect();
      }, reconnectDelayRef.current);
    }
  }, []); // No dependencies - callbacks are accessed via refs

  // Connect on mount
  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Respond to an interaction
  const respond = useCallback(
    (interactionId: string, sessionName: string, response: unknown) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        console.error("[WebSocket] Cannot respond: not connected");
        return;
      }

      wsRef.current.send(
        JSON.stringify({
          type: "respond",
          interactionId,
          sessionName,
          response,
        })
      );
    },
    []
  );

  // Send any message via WebSocket
  const sendMessage = useCallback((message: unknown) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error("[WebSocket] Cannot send message: not connected");
      return;
    }

    wsRef.current.send(JSON.stringify(message));
  }, []);

  // Send a text message to an agent
  const sendTextMessage = useCallback((sessionName: string, text: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error("[WebSocket] Cannot send message: not connected");
      return;
    }

    wsRef.current.send(
      JSON.stringify({
        type: "message",
        sessionName,
        text,
      })
    );
  }, []);

  return {
    projects,
    connected,
    connecting,
    retryIn,
    respond,
    sendMessage,
    sendTextMessage,
  };
}
