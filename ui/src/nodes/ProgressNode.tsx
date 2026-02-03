import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Handle, type NodeProps, NodeResizer, Position } from "@xyflow/react";
import { CheckCircle2, Circle, ListChecks, Loader2, X } from "lucide-react";
import { memo } from "react";

export interface ProgressNodeData {
  interactionId: string;
  sessionName: string;
  title: string;
  steps: string[];
  currentStep: number;
  percent: number;
}

function ProgressNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ProgressNodeData;

  const handleDismiss = () => {
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
      });
    }
  };

  const steps = nodeData.steps || [];
  const currentStep = nodeData.currentStep || 0;
  const percent = nodeData.percent || 0;
  const effectivePercent =
    steps.length > 0 ? Math.round((currentStep / steps.length) * 100) : percent;

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
            <ListChecks className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-sm flex-1">{nodeData.title}</CardTitle>
            <span className="text-xs text-muted-foreground font-medium">
              {effectivePercent}%
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 nodrag"
              onClick={handleDismiss}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="py-2 flex-1 overflow-auto nodrag nowheel">
          <Progress value={effectivePercent} className="mb-4" />
          {steps.length > 0 && (
            <div className="space-y-2">
              {steps.map((step, index) => {
                const isCompleted = index < currentStep;
                const isCurrent = index === currentStep;

                return (
                  <div
                    key={index}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-md text-sm",
                      isCurrent && "bg-accent",
                      isCompleted && "text-muted-foreground"
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-4 w-4 text-[hsl(var(--icon-success))]" />
                    ) : isCurrent ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span
                      className={cn(
                        isCompleted && "line-through",
                        isCurrent && "font-medium"
                      )}
                    >
                      {step}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Right} id="right" />
    </>
  );
}

export default memo(ProgressNode);
