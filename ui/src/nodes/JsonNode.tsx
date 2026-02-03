import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Handle, type NodeProps, NodeResizer, Position } from "@xyflow/react";
import { AlertTriangle, Braces, Check, Copy, X } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { JsonView, allExpanded, defaultStyles } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";
import { copyToClipboard } from "@/lib/clipboard";

export interface JsonNodeData {
  interactionId: string;
  sessionName: string;
  title: string;
  data: unknown;
}

function JsonNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as JsonNodeData;
  const [copyState, setCopyState] = useState<"idle" | "success" | "error">(
    "idle"
  );

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

  const handleCopy = async () => {
    const success = await copyToClipboard(
      JSON.stringify(nodeData.data, null, 2)
    );
    setCopyState(success ? "success" : "error");
    setTimeout(() => setCopyState("idle"), 2000);
  };

  // Parse data if it's a string
  const jsonData = useMemo(() => {
    if (typeof nodeData.data === "string") {
      try {
        return JSON.parse(nodeData.data);
      } catch {
        return nodeData.data;
      }
    }
    return nodeData.data;
  }, [nodeData.data]);

  // Custom styles for the JSON viewer
  const customStyles = {
    ...defaultStyles,
    container: "json-view-container",
    basicChildStyle: "text-sm",
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
            <Braces className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-sm flex-1">{nodeData.title}</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 nodrag"
              onClick={handleCopy}
              title={copyState === "error" ? "Copy failed" : "Copy"}
            >
              {copyState === "success" ? (
                <Check className="h-4 w-4 text-[hsl(var(--icon-success))]" />
              ) : copyState === "error" ? (
                <AlertTriangle className="h-4 w-4 text-red-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
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
        <CardContent className="p-3 font-mono text-sm flex-1 overflow-auto nodrag nowheel">
          <JsonView
            data={jsonData}
            shouldExpandNode={allExpanded}
            style={customStyles}
          />
        </CardContent>
      </Card>
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Right} id="right" />
    </>
  );
}

export default memo(JsonNode);
