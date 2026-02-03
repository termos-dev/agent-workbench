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
import { Handle, type NodeProps, NodeResizer, Position } from "@xyflow/react";
import { MessageSquareText } from "lucide-react";
import { memo, useState } from "react";

type QuestionType = "text" | "textarea" | "select" | "multiselect";

type Question = {
  id: string;
  label: string;
  type: QuestionType;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
  required?: boolean;
};

export interface AskNodeData {
  interactionId: string;
  sessionName: string;
  title: string;
  description: string;
  questions: Question[];
}

function AskNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as AskNodeData;
  const [answers, setAnswers] = useState<Record<string, unknown>>({});

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
      respond(nodeData.interactionId, nodeData.sessionName, {
        action: "accept",
        answers,
        result: answers,
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
      respond(nodeData.interactionId, nodeData.sessionName, {
        action: "cancel",
      });
    }
  };

  const updateAnswer = (questionId: string, value: unknown) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: value,
    }));
  };

  const toggleMultiSelect = (questionId: string, value: string) => {
    setAnswers((prev) => {
      const current = (prev[questionId] as string[]) || [];
      if (current.includes(value)) {
        return {
          ...prev,
          [questionId]: current.filter((v) => v !== value),
        };
      }
      return {
        ...prev,
        [questionId]: [...current, value],
      };
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
              className="min-h-[80px] nodrag nowheel"
            />
          </div>
        );

      case "select":
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
                <div
                  key={option.value}
                  className="flex items-center space-x-2 nodrag"
                >
                  <RadioGroupItem value={option.value} id={option.value} />
                  <Label htmlFor={option.value} className="text-sm">
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        );

      case "multiselect":
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
                const isSelected = (
                  (answers[question.id] as string[]) || []
                ).includes(option.value);
                return (
                  <div
                    key={option.value}
                    role="checkbox"
                    tabIndex={0}
                    aria-checked={isSelected}
                    className="flex items-center space-x-2 nodrag"
                    onClick={() => toggleMultiSelect(question.id, option.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleMultiSelect(question.id, option.value);
                      }
                    }}
                  >
                    <Checkbox
                      id={option.value}
                      checked={isSelected}
                      onCheckedChange={() =>
                        toggleMultiSelect(question.id, option.value)
                      }
                    />
                    <Label htmlFor={option.value} className="text-sm">
                      {option.label}
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>
        );
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
              className="nodrag"
            />
          </div>
        );
    }
  };

  // Check if all required questions are answered
  const questions = nodeData.questions || [];
  const isValid = questions.every((q) => {
    if (!q.required) return true;
    const answer = answers[q.id];
    if (q.type === "multiselect") {
      return Array.isArray(answer) && answer.length > 0;
    }
    return answer !== undefined && answer !== "";
  });

  return (
    <>
      <NodeResizer
        minWidth={200}
        minHeight={100}
        isVisible={selected}
        lineClassName="!border-primary"
        handleClassName="!w-2 !h-2 !bg-primary !border-primary"
      />
      <Card className="w-full h-full min-w-[200px] shadow-md flex flex-col">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <MessageSquareText className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-sm">{nodeData.title}</CardTitle>
          </div>
          {nodeData.description && (
            <CardDescription className="text-xs">
              {nodeData.description}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="py-2 space-y-4 flex-1 overflow-auto nodrag nowheel">
          {questions.map(renderQuestion)}
        </CardContent>
        <CardFooter className="flex justify-end gap-2 pt-2 nodrag">
          <Button variant="outline" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
          <Button size="sm" disabled={!isValid} onClick={handleSubmit}>
            Submit
          </Button>
        </CardFooter>
      </Card>
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Right} id="right" />
    </>
  );
}

export default memo(AskNode);
