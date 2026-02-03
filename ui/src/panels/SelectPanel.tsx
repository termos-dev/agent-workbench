import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { IDockviewPanelProps } from "dockview";
import { List } from "lucide-react";
import { useState } from "react";

export interface SelectPanelParams {
  interactionId: string;
  sessionName: string;
  title: string;
  prompt: string;
  options: Array<{ label: string; value: string }>;
}

export default function SelectPanel({
  params,
}: IDockviewPanelProps<SelectPanelParams>) {
  const { interactionId, sessionName, title, prompt, options } = params;
  const [selected, setSelected] = useState<string>("");

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
          <List className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-sm">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="py-2 flex-1 overflow-auto">
        {prompt && (
          <p className="text-sm text-muted-foreground mb-3">{prompt}</p>
        )}
        <RadioGroup
          value={selected}
          onValueChange={setSelected}
          className="gap-2"
        >
          {options.map((option) => (
            <div key={option.value} className="flex items-center space-x-2">
              <RadioGroupItem value={option.value} id={option.value} />
              <Label htmlFor={option.value} className="text-sm cursor-pointer">
                {option.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </CardContent>
      <CardFooter className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={handleCancel}>
          Cancel
        </Button>
        <Button size="sm" disabled={!selected} onClick={handleSubmit}>
          Select
        </Button>
      </CardFooter>
    </Card>
  );
}
