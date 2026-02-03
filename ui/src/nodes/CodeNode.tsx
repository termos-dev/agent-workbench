import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { copyToClipboard } from "@/lib/clipboard";
import { Handle, type NodeProps, NodeResizer, Position } from "@xyflow/react";
import { AlertTriangle, Check, Code2, Copy, X } from "lucide-react";
import { memo, useState } from "react";

export interface CodeNodeData {
  interactionId: string;
  sessionName: string;
  title: string;
  code: string;
  language: string;
  highlight: string;
}

function CodeNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as CodeNodeData;
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
    const success = await copyToClipboard(nodeData.code || "");
    setCopyState(success ? "success" : "error");
    setTimeout(() => setCopyState("idle"), 2000);
  };

  // Parse highlighted lines (e.g., "10-20" or "5,10,15")
  const highlightedLines = new Set<number>();
  if (nodeData.highlight) {
    const parts = nodeData.highlight.split(",");
    for (const part of parts) {
      if (part.includes("-")) {
        const [start, end] = part.split("-").map(Number);
        for (let i = start; i <= end; i++) {
          highlightedLines.add(i);
        }
      } else {
        highlightedLines.add(Number(part));
      }
    }
  }

  const lines = (nodeData.code || "").split("\n");

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
            <Code2 className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-sm flex-1">{nodeData.title}</CardTitle>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {nodeData.language || "text"}
            </span>
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
        <CardContent className="p-0 flex-1 overflow-auto nodrag nowheel">
          <div className="font-mono text-sm h-full bg-[hsl(var(--code-background))] text-[hsl(var(--code-foreground))]">
            <table className="w-full border-collapse">
              <tbody>
                {lines.map((line, index) => {
                  const lineNum = index + 1;
                  const isHighlighted = highlightedLines.has(lineNum);
                  return (
                    <tr
                      key={index}
                      className={
                        isHighlighted ? "bg-[hsl(var(--code-highlight))]" : ""
                      }
                    >
                      <td className="px-3 py-0 text-right select-none border-r w-[1%] whitespace-nowrap text-[hsl(var(--code-line-number))] border-[hsl(var(--code-border))]">
                        {lineNum}
                      </td>
                      <td className="px-3 py-0 whitespace-pre">
                        {line || " "}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Right} id="right" />
    </>
  );
}

export default memo(CodeNode);
