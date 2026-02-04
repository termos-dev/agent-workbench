import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IDockviewPanelProps } from "dockview";
import { CheckSquare } from "lucide-react";
import { useState } from "react";

const OTHER_VALUE = "__other__";

export interface ChecklistPanelParams {
  interactionId: string;
  sessionName: string;
  title: string;
  prompt: string;
  options: Array<{ label: string; value: string }>;
}

export default function ChecklistPanel({
  params,
}: IDockviewPanelProps<ChecklistPanelParams>) {
  const { interactionId, sessionName, title, prompt, options } = params;
  const [selected, setSelected] = useState<string[]>([]);
  const [otherText, setOtherText] = useState<string>("");

  const toggleOption = (value: string) => {
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

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
      // Resolve "other" value to its text input
      const result = selected
        .filter((v) => v !== OTHER_VALUE)
        .concat(
          selected.includes(OTHER_VALUE) && otherText.trim()
            ? [otherText.trim()]
            : []
        );
      respond(interactionId, sessionName, {
        action: "accept",
        result,
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

  return (
    <Card className="w-full h-full border-0 rounded-none shadow-none flex flex-col">
      <CardHeader className="panel-header pb-2">
        <div className="flex items-center gap-2">
          <CheckSquare className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-sm">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="py-2 flex-1 overflow-auto">
        {prompt && (
          <p className="text-sm text-muted-foreground mb-3">{prompt}</p>
        )}
        <div className="space-y-2">
          {options.map((option) => (
            <div
              key={option.value}
              role="checkbox"
              tabIndex={0}
              aria-checked={selected.includes(option.value)}
              className="flex items-center space-x-2 cursor-pointer"
              onClick={() => toggleOption(option.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleOption(option.value);
                }
              }}
            >
              <Checkbox
                id={option.value}
                checked={selected.includes(option.value)}
                onCheckedChange={() => toggleOption(option.value)}
              />
              <Label htmlFor={option.value} className="text-sm cursor-pointer">
                {option.label}
              </Label>
            </div>
          ))}
          {/* "Other" option */}
          <div
            role="checkbox"
            tabIndex={0}
            aria-checked={selected.includes(OTHER_VALUE)}
            className="flex items-center space-x-2 cursor-pointer"
            onClick={() => toggleOption(OTHER_VALUE)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleOption(OTHER_VALUE);
              }
            }}
          >
            <Checkbox
              id="checklist-other"
              checked={selected.includes(OTHER_VALUE)}
              onCheckedChange={() => toggleOption(OTHER_VALUE)}
            />
            <Label htmlFor="checklist-other" className="text-sm cursor-pointer">
              Other
            </Label>
          </div>
          {selected.includes(OTHER_VALUE) && (
            <Input
              placeholder="Enter your response..."
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              className="mt-2 ml-6"
              autoFocus
            />
          )}
        </div>
      </CardContent>
      <CardFooter className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={handleCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSubmit}>
          Confirm
        </Button>
      </CardFooter>
    </Card>
  );
}
