import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Handle, type NodeProps, NodeResizer, Position } from "@xyflow/react";
import { List } from "lucide-react";
import { memo, useState } from "react";

type SelectOption = {
  label: string;
  value: string;
};

export interface SelectNodeData {
  interactionId: string;
  sessionName: string;
  title: string;
  prompt: string;
  options: SelectOption[];
}

function SelectNode({ data, selected: isSelected }: NodeProps) {
  const nodeData = data as unknown as SelectNodeData;
  const [selectedValue, setSelectedValue] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!selectedValue) return;
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
        answers: { selection: selectedValue },
        result: selectedValue,
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

  return (
    <>
      <NodeResizer
        minWidth={200}
        minHeight={100}
        isVisible={isSelected}
        lineClassName="!border-primary"
        handleClassName="!w-2 !h-2 !bg-primary !border-primary"
      />
      <Card className="w-full h-full min-w-[200px] shadow-md flex flex-col">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <List className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-sm">{nodeData.title}</CardTitle>
          </div>
          {nodeData.prompt && (
            <CardDescription className="text-xs">
              {nodeData.prompt}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="py-2 flex-1 overflow-auto nodrag nowheel">
          <RadioGroup
            value={selectedValue || ""}
            onValueChange={setSelectedValue}
            className="gap-2"
          >
            {(nodeData.options || []).map((option) => (
              <div
                key={option.value}
                role="radio"
                tabIndex={0}
                aria-checked={selectedValue === option.value}
                className="flex items-center space-x-2 rounded-md border p-3 hover:bg-accent cursor-pointer"
                onClick={() => setSelectedValue(option.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedValue(option.value);
                  }
                }}
              >
                <RadioGroupItem value={option.value} id={option.value} />
                <Label
                  htmlFor={option.value}
                  className="text-sm cursor-pointer flex-1"
                >
                  {option.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
        <CardFooter className="flex justify-end gap-2 pt-2 nodrag">
          <Button variant="outline" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
          <Button size="sm" disabled={!selectedValue} onClick={handleSubmit}>
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

export default memo(SelectNode);
