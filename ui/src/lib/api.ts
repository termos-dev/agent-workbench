/**
 * HTTP API client for the awb UI server.
 */

const API_BASE = `http://${window.location.hostname}:${window.location.port || 3847}`;

export interface InteractionResponse {
  action: "accept" | "decline" | "cancel";
  answers?: Record<string, string | string[]>;
  result?: unknown;
  feedback?: string;
}

/**
 * Respond to an interaction via HTTP API.
 * This is a fallback when WebSocket is not available.
 */
export async function respondToInteraction(
  sessionName: string,
  interactionId: string,
  response: InteractionResponse
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/respond`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sessionName,
      interactionId,
      response,
    }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
}

/**
 * Send a message to an agent via HTTP API.
 * This is a fallback when WebSocket is not available.
 */
export async function sendMessage(
  sessionName: string,
  text: string,
  agentSessionId?: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sessionName,
      text,
      agentSessionId,
    }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
}

/**
 * Get all pending interactions.
 */
export async function getInteractions(): Promise<{
  projects: Array<{
    project: string;
    sessionName: string;
    interactions: Array<{
      id: string;
      component: string;
      title?: string;
      prompt?: string;
      options?: Array<{ label: string; value: string }>;
      args?: Record<string, unknown>;
      ts: number;
    }>;
  }>;
}> {
  const res = await fetch(`${API_BASE}/api/interactions`);

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  return res.json();
}
