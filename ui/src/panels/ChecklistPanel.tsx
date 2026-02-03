import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { IDockviewPanelProps } from "dockview";
import { CheckSquare } from "lucide-react";
import { useState } from "react";

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
      respond(interactionId, sessionName, {
        action: "accept",
        result: selected,
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
