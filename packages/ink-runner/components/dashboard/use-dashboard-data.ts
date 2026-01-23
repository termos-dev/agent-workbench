/**
 * Response type for interactions.
 * Used by dashboard components to respond to user inputs.
 */
export interface InteractionResponse {
  action: "accept" | "decline" | "cancel";
  value?: unknown;
  answers?: Record<string, string | string[]>;
  feedback?: string; // User feedback text for display components
  checked?: number[]; // Checklist: indices of checked items
  checkedLabels?: string[]; // Checklist: labels of checked items
}
