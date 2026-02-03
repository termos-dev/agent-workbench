import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Handle, type NodeProps, NodeResizer, Position } from "@xyflow/react";
import { LayoutGrid, X } from "lucide-react";
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type CardAction = {
  label: string;
  key: string;
  value: string;
};

export interface CardNodeData {
  interactionId: string;
  sessionName: string;
  title: string;
  content: string;
  actions: CardAction[];
}

function CardNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as CardNodeData;

  const handleAction = (action: CardAction) => {
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
        result: action.value,
        key: action.key,
      });
    }
  };

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
        action: "dismiss",
      });
    }
  };

  const actions = nodeData.actions || [];

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
            <LayoutGrid className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-sm flex-1">{nodeData.title}</CardTitle>
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
          <div className="markdown-body text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {nodeData.content}
            </ReactMarkdown>
          </div>
        </CardContent>
        {actions.length > 0 && (
          <CardFooter className="flex flex-wrap gap-2 pt-2 nodrag">
            {actions.map((action) => (
              <Button
                key={action.key}
                variant="outline"
                size="sm"
                onClick={() => handleAction(action)}
              >
                {action.label}
              </Button>
            ))}
          </CardFooter>
        )}
      </Card>
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Right} id="right" />
    </>
  );
}

export default memo(CardNode);
