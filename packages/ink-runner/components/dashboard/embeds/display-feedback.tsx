/**
 * Display feedback embed component - allows users to send feedback on display components.
 */

import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useState } from "react";

export interface DisplayFeedbackEmbedProps {
  isActive: boolean;
  onRespond: (feedback?: string) => void;
  onTypingChange?: (isTyping: boolean) => void;
}

export function DisplayFeedbackEmbed({
  isActive,
  onRespond,
  onTypingChange,
}: DisplayFeedbackEmbedProps) {
  const [feedback, setFeedback] = useState("");
  const [showInput, setShowInput] = useState(false);

  // Helper to update showInput and notify parent
  const updateShowInput = (value: boolean) => {
    setShowInput(value);
    onTypingChange?.(value);
  };

  // Helper to respond and reset typing state
  const respond = (feedback?: string) => {
    updateShowInput(false);
    setFeedback("");
    onRespond(feedback);
  };

  useInput((input, key) => {
    if (!isActive) return;

    // 'd' or Escape dismisses without feedback (when not in input mode)
    if ((input === "d" || input === "D" || key.escape) && !showInput) {
      respond();
      return;
    }

    // 'f' starts feedback mode
    if ((input === "f" || input === "F") && !showInput) {
      updateShowInput(true);
      return;
    }

    // Escape cancels feedback mode (when in input mode)
    if (key.escape && showInput) {
      updateShowInput(false);
      setFeedback("");
      return;
    }

    // Enter submits feedback if in input mode and has text
    if (key.return && showInput && feedback.trim()) {
      respond(feedback.trim());
      return;
    }

    // Enter without text in input mode dismisses
    if (key.return && showInput && !feedback.trim()) {
      respond();
      return;
    }
  });

  if (showInput) {
    return (
      <Box flexDirection="column">
        <Box>
          <Text color="cyan">Feedback: </Text>
          <TextInput
            value={feedback}
            onChange={setFeedback}
            focus={isActive}
            placeholder="Type feedback for agent..."
          />
        </Box>
        <Text dimColor>Enter send Esc cancel</Text>
      </Box>
    );
  }

  return <Text dimColor>[d/Esc] dismiss [f] feedback</Text>;
}
