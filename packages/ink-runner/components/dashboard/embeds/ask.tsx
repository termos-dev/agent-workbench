/**
 * Ask embed component - Multi-question form with options or text input.
 */

import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useCallback, useMemo, useState } from "react";
import type { DashboardInteraction } from "../types.js";

export interface FormQuestion {
  question: string;
  header: string;
  options?: Array<{ label: string; description?: string }>;
  multiSelect?: boolean;
  placeholder?: string;
}

const OTHER_VALUE = "__other__";

export interface AskEmbedProps {
  interaction: DashboardInteraction;
  isActive: boolean;
  onRespond: (answers: Record<string, string | string[]>) => void;
  onCancel?: () => void;
  onTabNext?: () => void;
  onTabPrev?: () => void;
}

export function AskEmbed({
  interaction,
  isActive,
  onRespond,
  onCancel,
  onTabNext,
  onTabPrev,
}: AskEmbedProps) {
  const schema = (
    interaction.args as { schema?: { questions: FormQuestion[] } }
  )?.schema;
  const questions = schema?.questions || [];

  const [activeQ, setActiveQ] = useState(0);
  const [cursors, setCursors] = useState<number[]>(() =>
    questions.map(() => 0)
  );
  const [selections, setSelections] = useState<Map<number, Set<string>>>(
    () => new Map(questions.map((_, i) => [i, new Set()]))
  );
  const [textInputs, setTextInputs] = useState<Map<number, string>>(
    () => new Map(questions.map((_, i) => [i, ""]))
  );
  const [otherTexts, setOtherTexts] = useState<Map<number, string>>(
    () => new Map(questions.map((_, i) => [i, ""]))
  );
  const [pendingSkip, setPendingSkip] = useState(false);
  const [lastEnter, setLastEnter] = useState(0);

  const q = questions[activeQ];
  const opts = q?.options || [];
  const isText = !q?.options;
  const totalOpts = opts.length + 1; // +1 for "Other"

  // Check if "Other" is selected for current question
  const isOtherSelected = useMemo(() => {
    const sel = selections.get(activeQ) || new Set();
    return sel.has(OTHER_VALUE);
  }, [selections, activeQ]);

  const buildAnswers = useCallback(() => {
    const answers: Record<string, string | string[]> = {};
    questions.forEach((question, i) => {
      if (question.options) {
        const sel = selections.get(i) || new Set();
        if (question.multiSelect) {
          // Replace __other__ with the custom text
          const result = Array.from(sel).map((item) =>
            item === OTHER_VALUE ? otherTexts.get(i) || "" : item
          );
          answers[question.header] = result;
        } else {
          const arr = Array.from(sel);
          if (arr.length > 0 && arr[0] === OTHER_VALUE) {
            answers[question.header] = otherTexts.get(i) || "";
          } else {
            answers[question.header] = arr[0] || "";
          }
        }
      } else {
        answers[question.header] = textInputs.get(i) || "";
      }
    });
    return answers;
  }, [questions, selections, textInputs, otherTexts]);

  const unanswered = useMemo(
    () =>
      questions.filter((question, i) => {
        if (question.options) {
          const sel = selections.get(i) || new Set();
          if (sel.size === 0) return true;
          // If "Other" is selected, require non-empty text
          if (sel.has(OTHER_VALUE)) {
            const otherText = otherTexts.get(i) || "";
            return otherText.trim().length === 0;
          }
          return false;
        }
        return !(textInputs.get(i) || "").trim();
      }).length,
    [questions, selections, textInputs, otherTexts]
  );

  const canSubmit = unanswered === 0;

  // Check if current question is answered
  const currentAnswered = useMemo(() => {
    if (!q) return false;
    if (q.options) {
      const sel = selections.get(activeQ) || new Set();
      if (sel.size === 0) return false;
      // If "Other" is selected, require non-empty text
      if (sel.has(OTHER_VALUE)) {
        const otherText = otherTexts.get(activeQ) || "";
        return otherText.trim().length > 0;
      }
      return true;
    }
    return !!(textInputs.get(activeQ) || "").trim();
  }, [q, activeQ, selections, textInputs, otherTexts]);

  useInput((input, key) => {
    if (!isActive || !q) return;

    // Escape cancels the interaction (or pending skip if active)
    if (key.escape) {
      if (pendingSkip) {
        setPendingSkip(false);
      } else {
        onCancel?.();
      }
      return;
    }

    // Skip navigation when Other is selected and we're typing
    if (!isText && !isOtherSelected) {
      if (key.upArrow) {
        setPendingSkip(false);
        const cursor = cursors[activeQ];
        if (cursor === 0 && activeQ > 0) {
          // At first option, move to previous question
          setActiveQ(activeQ - 1);
        } else {
          setCursors((p) => {
            const n = [...p];
            n[activeQ] = (n[activeQ] - 1 + totalOpts) % totalOpts;
            return n;
          });
        }
        return;
      }
      if (key.downArrow) {
        setPendingSkip(false);
        const cursor = cursors[activeQ];
        if (cursor === totalOpts - 1 && activeQ < questions.length - 1) {
          // At last option (Other), move to next question
          setActiveQ(activeQ + 1);
        } else {
          setCursors((p) => {
            const n = [...p];
            n[activeQ] = (n[activeQ] + 1) % totalOpts;
            return n;
          });
        }
        return;
      }
      if (input === " ") {
        setPendingSkip(false);
        const cursor = cursors[activeQ];
        const isOnOther = cursor === opts.length;
        // Don't handle space on Other row - just type directly
        if (isOnOther) return;
        const label = opts[cursor]?.label;
        if (label) {
          setSelections((p) => {
            const m = new Map(p);
            const s = new Set(m.get(activeQ) || []);
            if (q.multiSelect) {
              s.has(label) ? s.delete(label) : s.add(label);
            } else {
              s.clear();
              s.add(label);
            }
            m.set(activeQ, s);
            return m;
          });
          // For single-select, clear Other text when selecting a regular option
          if (!q.multiSelect) {
            setOtherTexts((p) => {
              const m = new Map(p);
              m.set(activeQ, "");
              return m;
            });
          }
        }
        return;
      }
    }

    // Tab navigates questions - exits to next/prev interaction at boundaries
    if (key.tab) {
      setPendingSkip(false);
      if (key.shift && activeQ === 0) {
        // Shift+Tab on first question - move to previous interaction
        onTabPrev?.();
        return;
      }
      if (!key.shift && activeQ === questions.length - 1) {
        // Tab on last question - move to next interaction
        onTabNext?.();
        return;
      }
      setActiveQ((p) => (key.shift ? p - 1 : p + 1));
      return;
    }

    // Enter submits or advances
    if (key.return && !isText) {
      const now = Date.now();
      const elapsed = now - lastEnter;
      setLastEnter(now);

      if (canSubmit) {
        // All questions answered - submit
        onRespond(buildAnswers());
      } else if (currentAnswered) {
        // Current question answered - advance to next
        setPendingSkip(false);
        if (activeQ < questions.length - 1) setActiveQ((p) => p + 1);
        else onRespond(buildAnswers()); // On last question, submit with what we have
      } else if (pendingSkip && elapsed > 300) {
        // Skip confirmation - advance or submit
        setPendingSkip(false);
        if (activeQ < questions.length - 1) setActiveQ((p) => p + 1);
        else onRespond(buildAnswers());
      } else if (!pendingSkip) {
        // First Enter on unanswered - show skip warning
        setPendingSkip(true);
      }
    }
  });

  const handleTextChange = useCallback(
    (v: string) => {
      setTextInputs((p) => {
        const m = new Map(p);
        m.set(activeQ, v);
        return m;
      });
    },
    [activeQ]
  );

  const handleTextSubmit = useCallback(() => {
    if (!(textInputs.get(activeQ) || "").trim()) return;
    if (activeQ < questions.length - 1) setActiveQ(activeQ + 1);
    else if (canSubmit) onRespond(buildAnswers());
  }, [
    activeQ,
    questions.length,
    textInputs,
    canSubmit,
    buildAnswers,
    onRespond,
  ]);

  const handleOtherTextChange = useCallback(
    (qIdx: number) => (v: string) => {
      setOtherTexts((p) => {
        const m = new Map(p);
        m.set(qIdx, v);
        return m;
      });
      // Auto-select Other when typing, clear other selections for single-select
      const question = questions[qIdx];
      if (v.trim()) {
        setSelections((p) => {
          const m = new Map(p);
          const s = new Set(m.get(qIdx) || []);
          if (!question?.multiSelect) s.clear(); // Single-select: clear others
          s.add(OTHER_VALUE);
          m.set(qIdx, s);
          return m;
        });
      } else {
        // Clear Other selection when text is empty
        setSelections((p) => {
          const m = new Map(p);
          const s = new Set(m.get(qIdx) || []);
          s.delete(OTHER_VALUE);
          m.set(qIdx, s);
          return m;
        });
      }
    },
    [questions]
  );

  const handleOtherTextSubmit = useCallback(() => {
    if (canSubmit) onRespond(buildAnswers());
  }, [canSubmit, buildAnswers, onRespond]);

  if (!questions.length) return <Text dimColor>No questions</Text>;

  return (
    <Box flexDirection="column">
      {questions.map((question, i) => {
        const active = i === activeQ;
        const qOpts = question.options || [];
        const qText = !question.options;
        const cursor = cursors[i];
        const sel = selections.get(i) || new Set();
        const txt = textInputs.get(i) || "";

        return (
          <Box key={i} flexDirection="column" marginBottom={1}>
            <Text color={active ? "cyan" : "gray"} bold>
              {active ? "> " : "  "}[{question.header}]
            </Text>
            <Text color={active ? "white" : "gray"}>
              {active ? "  " : "  "}
              {question.question}
            </Text>
            {qText ? (
              <Box>
                <Text color="green">&gt; </Text>
                {active ? (
                  <TextInput
                    value={txt}
                    onChange={handleTextChange}
                    onSubmit={handleTextSubmit}
                    focus={isActive}
                    placeholder={question.placeholder || "Type..."}
                  />
                ) : (
                  <Text dimColor>
                    {txt || question.placeholder || "Type..."}
                  </Text>
                )}
              </Box>
            ) : (
              <Box flexDirection="column">
                {qOpts.map((opt, oi) => (
                  <Text
                    key={oi}
                    color={
                      active && cursor === oi
                        ? "cyan"
                        : sel.has(opt.label)
                          ? "green"
                          : active
                            ? "white"
                            : "gray"
                    }
                    bold={active && cursor === oi}
                  >
                    {active && cursor === oi ? "> " : "  "}
                    {question.multiSelect
                      ? sel.has(opt.label)
                        ? "[x] "
                        : "[ ] "
                      : sel.has(opt.label)
                        ? "● "
                        : "○ "}
                    {opt.label}
                    {opt.description && (
                      <Text dimColor> - {opt.description}</Text>
                    )}
                  </Text>
                ))}
                {/* Direct text input for custom answer */}
                {(() => {
                  const otherIdx = qOpts.length;
                  const isCursorOnOther = cursor === otherIdx;
                  const otherTextValue = otherTexts.get(i) || "";
                  const hasOtherText = otherTextValue.trim().length > 0;
                  return (
                    <Box>
                      <Text
                        color={
                          active && isCursorOnOther
                            ? "cyan"
                            : hasOtherText
                              ? "green"
                              : active
                                ? "white"
                                : "gray"
                        }
                        bold={active && isCursorOnOther}
                      >
                        {active && isCursorOnOther ? "> " : "  "}
                        {question.multiSelect
                          ? hasOtherText
                            ? "[x] "
                            : "[ ] "
                          : hasOtherText
                            ? "● "
                            : "○ "}
                      </Text>
                      {active && isCursorOnOther ? (
                        <TextInput
                          value={otherTextValue}
                          onChange={handleOtherTextChange(i)}
                          onSubmit={handleOtherTextSubmit}
                          focus={isActive}
                          placeholder="Other..."
                        />
                      ) : (
                        <Text
                          dimColor={!hasOtherText}
                          color={hasOtherText ? "green" : undefined}
                        >
                          {otherTextValue || "Other..."}
                        </Text>
                      )}
                    </Box>
                  );
                })()}
              </Box>
            )}
          </Box>
        );
      })}
      <Text dimColor>
        ↑↓ options {questions.length > 1 ? "Tab questions  " : ""}Space select{" "}
        {canSubmit ? (
          <Text color="green">Enter submit</Text>
        ) : currentAnswered ? (
          "Enter next"
        ) : (
          "Enter submit"
        )}{" "}
        Esc cancel
      </Text>
      {pendingSkip && !currentAnswered && (
        <Text color="yellow">
          ⚠{" "}
          {activeQ === questions.length - 1
            ? `${unanswered} unanswered. Enter to submit anyway`
            : "Enter to skip this question"}
        </Text>
      )}
    </Box>
  );
}
