import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Handle, type NodeProps, NodeResizer, Position } from "@xyflow/react";
import { HelpCircle } from "lucide-react";
import { memo } from "react";

export interface ConfirmNodeData {
  interactionId: string;
  sessionName: string;
  title: string;
  prompt: string;
}

function ConfirmNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ConfirmNodeData;

  const handleResponse = (confirmed: boolean) => {
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
        action: confirmed ? "accept" : "decline",
        result: confirmed,
      });
    }
  };

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
            <HelpCircle className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-sm">{nodeData.title}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="py-2">
          <p className="text-sm text-muted-foreground">{nodeData.prompt}</p>
        </CardContent>
        <CardFooter className="flex justify-end gap-2 pt-2 nodrag">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleResponse(false)}
          >
            No
          </Button>
          <Button size="sm" onClick={() => handleResponse(true)}>
            Yes
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

export default memo(ConfirmNode);
