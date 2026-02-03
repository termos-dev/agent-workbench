import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { IDockviewPanelProps } from "dockview";
import { MessageSquareText } from "lucide-react";
import { useState } from "react";

type QuestionType = "text" | "textarea" | "select" | "multiselect";

type Question = {
  id: string;
  label: string;
  type: QuestionType;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
  required?: boolean;
};

export interface AskPanelParams {
  interactionId: string;
  sessionName: string;
  title: string;
  description: string;
  questions: Question[];
}

const OTHER_VALUE = "__other__";

export default function AskPanel({
  params,
}: IDockviewPanelProps<AskPanelParams>) {
  const { interactionId, sessionName, title, description, questions } = params;
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({});

  const handleSubmit = () => {
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
      // Resolve "other" values to their text input
      const resolvedAnswers: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(answers)) {
        if (value === OTHER_VALUE) {
          resolvedAnswers[key] = otherTexts[key] || "";
        } else if (Array.isArray(value) && value.includes(OTHER_VALUE)) {
          // For multiselect, replace OTHER_VALUE with the actual text
          resolvedAnswers[key] = value
            .filter((v) => v !== OTHER_VALUE)
            .concat(otherTexts[key] ? [otherTexts[key]] : []);
        } else {
          resolvedAnswers[key] = value;
        }
      }
      respond(interactionId, sessionName, {
        action: "accept",
        answers: resolvedAnswers,
        result: resolvedAnswers,
      });
    }
  };

  const handleCancel = () => {
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
      respond(interactionId, sessionName, { action: "cancel" });
    }
  };

  const updateAnswer = (questionId: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const toggleMultiSelect = (questionId: string, value: string) => {
    setAnswers((prev) => {
      const current = (prev[questionId] as string[]) || [];
      if (current.includes(value)) {
        return { ...prev, [questionId]: current.filter((v) => v !== value) };
      }
      return { ...prev, [questionId]: [...current, value] };
    });
  };

  const renderQuestion = (question: Question) => {
    switch (question.type) {
      case "textarea":
        return (
          <div key={question.id} className="space-y-2">
            <Label htmlFor={question.id} className="text-sm">
              {question.label}
              {question.required && (
                <span className="text-destructive ml-1">*</span>
              )}
            </Label>
            <Textarea
              id={question.id}
              placeholder={question.placeholder}
              value={(answers[question.id] as string) || ""}
              onChange={(e) => updateAnswer(question.id, e.target.value)}
              className="min-h-[80px]"
            />
          </div>
        );

      case "select": {
        const isOtherSelected = answers[question.id] === OTHER_VALUE;
        return (
          <div key={question.id} className="space-y-2">
            <Label className="text-sm">
              {question.label}
              {question.required && (
                <span className="text-destructive ml-1">*</span>
              )}
            </Label>
            <RadioGroup
              value={(answers[question.id] as string) || ""}
              onValueChange={(value) => updateAnswer(question.id, value)}
              className="gap-2"
            >
              {question.options?.map((option) => (
                <div key={option.value} className="flex items-center space-x-2">
                  <RadioGroupItem
                    value={option.value}
                    id={`${question.id}-${option.value}`}
                  />
                  <Label
                    htmlFor={`${question.id}-${option.value}`}
                    className="text-sm"
                  >
                    {option.label}
                  </Label>
                </div>
              ))}
              {/* "Other" option */}
              <div className="flex items-center space-x-2">
                <RadioGroupItem
                  value={OTHER_VALUE}
                  id={`${question.id}-other`}
                />
                <Label htmlFor={`${question.id}-other`} className="text-sm">
                  Other
                </Label>
              </div>
            </RadioGroup>
            {isOtherSelected && (
              <Input
                placeholder="Enter your response..."
                value={otherTexts[question.id] || ""}
                onChange={(e) =>
                  setOtherTexts((prev) => ({
                    ...prev,
                    [question.id]: e.target.value,
                  }))
                }
                className="mt-2"
                autoFocus
              />
            )}
          </div>
        );
      }

      case "multiselect": {
        const currentValues = (answers[question.id] as string[]) || [];
        const isOtherSelected = currentValues.includes(OTHER_VALUE);
        return (
          <div key={question.id} className="space-y-2">
            <Label className="text-sm">
              {question.label}
              {question.required && (
                <span className="text-destructive ml-1">*</span>
              )}
            </Label>
            <div className="space-y-2">
              {question.options?.map((option) => {
                const isSelected = currentValues.includes(option.value);
                return (
                  <div
                    key={option.value}
                    className="flex items-center space-x-2"
                    onClick={() => toggleMultiSelect(question.id, option.value)}
                  >
                    <Checkbox
                      id={`${question.id}-${option.value}`}
                      checked={isSelected}
                      onCheckedChange={() =>
                        toggleMultiSelect(question.id, option.value)
                      }
                    />
                    <Label
                      htmlFor={`${question.id}-${option.value}`}
                      className="text-sm"
                    >
                      {option.label}
                    </Label>
                  </div>
                );
              })}
              {/* "Other" option */}
              <div
                className="flex items-center space-x-2"
                onClick={() => toggleMultiSelect(question.id, OTHER_VALUE)}
              >
                <Checkbox
                  id={`${question.id}-other`}
                  checked={isOtherSelected}
                  onCheckedChange={() =>
                    toggleMultiSelect(question.id, OTHER_VALUE)
                  }
                />
                <Label htmlFor={`${question.id}-other`} className="text-sm">
                  Other
                </Label>
              </div>
              {isOtherSelected && (
                <Input
                  placeholder="Enter your response..."
                  value={otherTexts[question.id] || ""}
                  onChange={(e) =>
                    setOtherTexts((prev) => ({
                      ...prev,
                      [question.id]: e.target.value,
                    }))
                  }
                  className="mt-2 ml-6"
                  autoFocus
                />
              )}
            </div>
          </div>
        );
      }
      default:
        return (
          <div key={question.id} className="space-y-2">
            <Label htmlFor={question.id} className="text-sm">
              {question.label}
              {question.required && (
                <span className="text-destructive ml-1">*</span>
              )}
            </Label>
            <Input
              id={question.id}
              placeholder={question.placeholder}
              value={(answers[question.id] as string) || ""}
              onChange={(e) => updateAnswer(question.id, e.target.value)}
            />
          </div>
        );
    }
  };

  const questionList = questions || [];
  const isValid = questionList.every((q) => {
    if (!q.required) return true;
    const answer = answers[q.id];
    if (q.type === "multiselect") {
      if (!Array.isArray(answer) || answer.length === 0) return false;
      // If "Other" is selected, need text input
      if (answer.includes(OTHER_VALUE) && !otherTexts[q.id]?.trim())
        return false;
      return true;
    }
    if (q.type === "select") {
      if (answer === undefined || answer === "") return false;
      // If "Other" is selected, need text input
      if (answer === OTHER_VALUE && !otherTexts[q.id]?.trim()) return false;
      return true;
    }
    return answer !== undefined && answer !== "";
  });

  return (
    <Card className="w-full h-full border-0 rounded-none shadow-none flex flex-col">
      <CardHeader className="panel-header pb-2">
        <div className="flex items-center gap-2">
          <MessageSquareText className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-sm">{title}</CardTitle>
        </div>
        {description && (
          <CardDescription className="text-xs">{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="py-2 space-y-4 flex-1 overflow-auto">
        {questionList.map(renderQuestion)}
      </CardContent>
      <CardFooter className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={handleCancel}>
          Cancel
        </Button>
        <Button size="sm" disabled={!isValid} onClick={handleSubmit}>
          Submit
        </Button>
      </CardFooter>
    </Card>
  );
}
