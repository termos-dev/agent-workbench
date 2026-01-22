import React, { useState, useCallback, useMemo } from "react";
import { Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import type { FormSchema, FormResult, FormOption } from "../types.js";
import { emitResult } from "../types.js";

interface Props {
  schema: FormSchema;
  title?: string;
}

type AnswerValue = string | string[];

export function SchemaForm({ schema, title }: Props) {
  const { exit } = useApp();

  // Unified state
  const [activeQuestion, setActiveQuestion] = useState(0);
  const [cursors, setCursors] = useState<number[]>(() =>
    schema.questions.map(() => 0)
  );
  const [selections, setSelections] = useState<Map<number, Set<string>>>(() =>
    new Map(schema.questions.map((_, idx) => [idx, new Set<string>()]))
  );
  const [textInputs, setTextInputs] = useState<Map<number, string>>(() =>
    new Map(schema.questions.map((_, idx) => [idx, ""]))
  );
  const [otherTexts, setOtherTexts] = useState<Map<number, string>>(() =>
    new Map(schema.questions.map((_, idx) => [idx, ""]))
  );

  const OTHER_VALUE = "__other__";

  const handleComplete = useCallback((result: FormResult) => {
    emitResult(result);
    exit();
  }, [exit]);

  // Build final answers from selections and text inputs
  const buildAnswers = useCallback(() => {
    const answers: Record<string, AnswerValue> = {};
    schema.questions.forEach((question, idx) => {
      const key = question.header;
      if (question.options) {
        const selected = selections.get(idx) || new Set();
        if (question.multiSelect) {
          // For multi-select, replace __other__ with the custom text
          const result = Array.from(selected).map(item =>
            item === OTHER_VALUE ? (otherTexts.get(idx) || "") : item
          );
          answers[key] = result;
        } else {
          // Single select - check if "Other" is selected
          const arr = Array.from(selected);
          if (arr.length > 0 && arr[0] === OTHER_VALUE) {
            answers[key] = otherTexts.get(idx) || "";
          } else {
            answers[key] = arr.length > 0 ? arr[0] : "";
          }
        }
      } else {
        // Text input
        answers[key] = textInputs.get(idx) || "";
      }
    });
    return answers;
  }, [schema.questions, selections, textInputs, otherTexts]);

  // Check if all required answers are filled
  const canSubmit = useMemo(() => {
    return schema.questions.every((question, idx) => {
      if (question.options) {
        const selected = selections.get(idx) || new Set();
        if (selected.size === 0) return false;
        // If "Other" is selected, require non-empty text
        if (selected.has(OTHER_VALUE)) {
          const otherText = otherTexts.get(idx) || "";
          if (otherText.trim().length === 0) return false;
        }
        return true;
      } else {
        const text = textInputs.get(idx) || "";
        return text.trim().length > 0;
      }
    });
  }, [schema.questions, selections, textInputs, otherTexts]);

  const currentQuestion = schema.questions[activeQuestion];
  const currentOptions = currentQuestion?.options || [];
  const isTextInput = !currentQuestion?.options;
  // Total options includes "Other" at the end
  const totalOptions = currentOptions.length + 1;

  // Check if "Other" is currently selected for the active question
  const isOtherSelected = useMemo(() => {
    const selected = selections.get(activeQuestion) || new Set();
    return selected.has(OTHER_VALUE);
  }, [selections, activeQuestion]);

  // Handle keyboard input
  useInput((input, key) => {
    // Escape to cancel
    if (key.escape) {
      handleComplete({ action: "cancel" });
      return;
    }

    // Navigate options within current question (only for option-based questions)
    // Skip navigation if "Other" is selected and we're typing in the text input
    if (!isTextInput && !isOtherSelected) {
      if (key.upArrow) {
        setCursors(prev => {
          const next = [...prev];
          next[activeQuestion] = (next[activeQuestion] - 1 + totalOptions) % totalOptions;
          return next;
        });
        return;
      }
      if (key.downArrow) {
        setCursors(prev => {
          const next = [...prev];
          next[activeQuestion] = (next[activeQuestion] + 1) % totalOptions;
          return next;
        });
        return;
      }

      // Toggle selection with Space
      if (input === " ") {
        const cursorPos = cursors[activeQuestion];
        // Check if cursor is on "Other" (last position) - skip, just type directly
        const isOnOther = cursorPos === currentOptions.length;
        if (isOnOther) return;

        const optionLabel = currentOptions[cursorPos]?.label;

        if (optionLabel) {
          setSelections(prev => {
            const newMap = new Map(prev);
            const currentSet = new Set(newMap.get(activeQuestion) || []);

            if (currentQuestion.multiSelect) {
              // Multi-select: toggle
              if (currentSet.has(optionLabel)) {
                currentSet.delete(optionLabel);
              } else {
                currentSet.add(optionLabel);
              }
            } else {
              // Single-select: replace
              currentSet.clear();
              currentSet.add(optionLabel);
            }

            newMap.set(activeQuestion, currentSet);
            return newMap;
          });
          // For single-select, clear Other text when selecting a regular option
          if (!currentQuestion.multiSelect) {
            setOtherTexts(prev => {
              const newMap = new Map(prev);
              newMap.set(activeQuestion, "");
              return newMap;
            });
          }
        }
        return;
      }
    }

    // Navigate between questions
    if (key.tab && !key.shift) {
      setActiveQuestion(prev => Math.min(prev + 1, schema.questions.length - 1));
      return;
    }
    if (key.tab && key.shift) {
      setActiveQuestion(prev => Math.max(prev - 1, 0));
      return;
    }
    if (key.rightArrow && !isTextInput) {
      setActiveQuestion(prev => Math.min(prev + 1, schema.questions.length - 1));
      return;
    }
    if (key.leftArrow && !isTextInput) {
      setActiveQuestion(prev => Math.max(prev - 1, 0));
      return;
    }

    // Submit all answers with Enter (only when not in text input)
    if (key.return && !isTextInput) {
      if (canSubmit) {
        handleComplete({ action: "accept", answers: buildAnswers() });
      }
      return;
    }
  });

  // Handle text input change
  const handleTextChange = useCallback((value: string) => {
    setTextInputs(prev => {
      const newMap = new Map(prev);
      newMap.set(activeQuestion, value);
      return newMap;
    });
  }, [activeQuestion]);

  // Handle "Other" text input change
  const handleOtherTextChange = useCallback((qIdx: number) => (value: string) => {
    setOtherTexts(prev => {
      const newMap = new Map(prev);
      newMap.set(qIdx, value);
      return newMap;
    });
    // Auto-select Other when typing, clear other selections for single-select
    const question = schema.questions[qIdx];
    if (value.trim()) {
      setSelections(prev => {
        const newMap = new Map(prev);
        const currentSet = new Set(newMap.get(qIdx) || []);
        if (!question?.multiSelect) currentSet.clear(); // Single-select: clear others
        currentSet.add(OTHER_VALUE);
        newMap.set(qIdx, currentSet);
        return newMap;
      });
    } else {
      // Clear Other selection when text is empty
      setSelections(prev => {
        const newMap = new Map(prev);
        const currentSet = new Set(newMap.get(qIdx) || []);
        currentSet.delete(OTHER_VALUE);
        newMap.set(qIdx, currentSet);
        return newMap;
      });
    }
  }, [schema.questions]);

  // Handle "Other" text input submission
  const handleOtherTextSubmit = useCallback(() => {
    if (canSubmit) {
      handleComplete({ action: "accept", answers: buildAnswers() });
    }
  }, [canSubmit, handleComplete, buildAnswers]);

  // Handle text input submission
  const handleTextSubmit = useCallback((value: string) => {
    const trimmed = value.replace(/[\r\n]+$/, "");
    const question = schema.questions[activeQuestion];

    if (question.validation) {
      const regex = new RegExp(question.validation);
      if (!regex.test(trimmed)) {
        // TODO: Show validation error
        return;
      }
    }

    // Save trimmed value
    setTextInputs(prev => {
      const newMap = new Map(prev);
      newMap.set(activeQuestion, trimmed);
      return newMap;
    });

    // Move to next question or submit if last
    if (activeQuestion < schema.questions.length - 1) {
      setActiveQuestion(activeQuestion + 1);
    } else {
      // On last question, check if we can submit
      const answers = buildAnswers();
      // Override with trimmed value for current question
      answers[question.header] = trimmed;
      handleComplete({ action: "accept", answers });
    }
  }, [activeQuestion, schema.questions, buildAnswers, handleComplete]);

  if (schema.questions.length === 0) {
    return <Text color="red">No questions in schema</Text>;
  }

  return (
    <Box flexDirection="column" padding={1}>
      {title && (
        <Box marginBottom={1}>
          <Text bold color="cyan">{title}</Text>
        </Box>
      )}

      {/* Render all questions */}
      {schema.questions.map((question, qIdx) => {
        const isActive = qIdx === activeQuestion;
        const questionOptions = question.options || [];
        const questionIsTextInput = !question.options;
        const questionCursor = cursors[qIdx];
        const questionSelections = selections.get(qIdx) || new Set();
        const textValue = textInputs.get(qIdx) || "";

        return (
          <Box
            key={qIdx}
            flexDirection="column"
            marginBottom={1}
            borderStyle={isActive ? "single" : undefined}
            borderColor={isActive ? "cyan" : undefined}
            paddingLeft={isActive ? 1 : 0}
            paddingRight={isActive ? 1 : 0}
          >
            {/* Header chip */}
            {question.header && (
              <Text color={isActive ? "cyan" : "gray"} bold>
                [{question.header}]
              </Text>
            )}

            {/* Question text */}
            <Text color={isActive ? "white" : "gray"}>
              {question.question}
            </Text>

            {/* Options or text input */}
            {questionIsTextInput ? (
              <Box marginTop={1}>
                <Text color="green">{"> "}</Text>
                {isActive ? (
                  <TextInput
                    value={textValue}
                    onChange={handleTextChange}
                    onSubmit={handleTextSubmit}
                    placeholder={question.placeholder || "Type your answer..."}
                    mask={question.inputType === "password" ? "*" : undefined}
                  />
                ) : (
                  <Text dimColor>{textValue || question.placeholder || "Type your answer..."}</Text>
                )}
              </Box>
            ) : (
              <Box flexDirection="column" marginTop={1}>
                {questionOptions.map((opt: FormOption, oIdx: number) => {
                  const isCursor = questionCursor === oIdx;
                  const isSelected = questionSelections.has(opt.label);

                  return (
                    <Box key={oIdx}>
                      <Text
                        color={isActive && isCursor ? "cyan" : isSelected ? "green" : isActive ? "white" : "gray"}
                        bold={isActive && isCursor}
                      >
                        {isActive && isCursor ? "> " : "  "}
                        {question.multiSelect ? (isSelected ? "[x] " : "[ ] ") : (isSelected ? "(●) " : "( ) ")}
                        {opt.label}
                        {opt.description && (
                          <Text dimColor={!isActive || !isCursor}> - {opt.description}</Text>
                        )}
                      </Text>
                    </Box>
                  );
                })}
                {/* Direct text input for custom answer */}
                {(() => {
                  const otherIdx = questionOptions.length;
                  const isCursorOnOther = questionCursor === otherIdx;
                  const otherTextValue = otherTexts.get(qIdx) || "";
                  const hasOtherText = otherTextValue.trim().length > 0;

                  return (
                    <Box>
                      <Text
                        color={isActive && isCursorOnOther ? "cyan" : hasOtherText ? "green" : isActive ? "white" : "gray"}
                        bold={isActive && isCursorOnOther}
                      >
                        {isActive && isCursorOnOther ? "> " : "  "}
                        {question.multiSelect ? (hasOtherText ? "[x] " : "[ ] ") : (hasOtherText ? "(●) " : "( ) ")}
                      </Text>
                      {isActive && isCursorOnOther ? (
                        <TextInput
                          value={otherTextValue}
                          onChange={handleOtherTextChange(qIdx)}
                          onSubmit={handleOtherTextSubmit}
                          placeholder="Other..."
                        />
                      ) : (
                        <Text dimColor={!hasOtherText} color={hasOtherText ? "green" : undefined}>
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

      {/* Help text */}
      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>
          ↑↓ navigate options • Tab/Shift+Tab switch questions • Space toggle • Enter submit • Esc cancel
        </Text>
      </Box>
    </Box>
  );
}
