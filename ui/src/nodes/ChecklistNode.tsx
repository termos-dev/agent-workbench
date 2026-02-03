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
import { Label } from "@/components/ui/label";
import { Handle, type NodeProps, NodeResizer, Position } from "@xyflow/react";
import { CheckSquare } from "lucide-react";
import { memo, useState } from "react";

type ChecklistOption = {
  label: string;
  value: string;
};

export interface ChecklistNodeData {
  interactionId: string;
  sessionName: string;
  title: string;
  prompt: string;
  options: ChecklistOption[];
}

function ChecklistNode({ data, selected: isSelected }: NodeProps) {
  const nodeData = data as unknown as ChecklistNodeData;
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  const toggleOption = (value: string) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
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
      respond(nodeData.interactionId, nodeData.sessionName, {
        action: "accept",
        answers: { selections: Array.from(checkedItems) },
        result: Array.from(checkedItems),
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
            <CheckSquare className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-sm">{nodeData.title}</CardTitle>
            <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {checkedItems.size} selected
            </span>
          </div>
          {nodeData.prompt && (
            <CardDescription className="text-xs">
              {nodeData.prompt}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="py-2 flex-1 overflow-auto nodrag nowheel">
          <div className="space-y-2">
            {(nodeData.options || []).map((option) => (
              <div
                key={option.value}
                role="checkbox"
                tabIndex={0}
                aria-checked={checkedItems.has(option.value)}
                className="flex items-center space-x-2 rounded-md border p-3 hover:bg-accent cursor-pointer"
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
                  checked={checkedItems.has(option.value)}
                  onCheckedChange={() => toggleOption(option.value)}
                />
                <Label
                  htmlFor={option.value}
                  className="text-sm cursor-pointer flex-1"
                >
                  {option.label}
                </Label>
              </div>
            ))}
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-2 pt-2 nodrag">
          <Button variant="outline" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit}>
            Submit ({checkedItems.size})
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

export default memo(ChecklistNode);
