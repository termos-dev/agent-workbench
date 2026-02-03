import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Handle, type NodeProps, NodeResizer, Position } from "@xyflow/react";
import { FileDiff, Rows3, SplitSquareVertical, X } from "lucide-react";
import { memo, useMemo, useState } from "react";

type DiffLine = {
  type: "add" | "remove" | "context";
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
};

function computeDiff(oldContent: string, newContent: string): DiffLine[] {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const result: DiffLine[] = [];

  const maxLen = Math.max(oldLines.length, newLines.length);
  let oldLineNum = 1;
  let newLineNum = 1;

  for (let i = 0; i < maxLen; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine === newLine) {
      if (oldLine !== undefined) {
        result.push({
          type: "context",
          content: oldLine,
          oldLineNum: oldLineNum++,
          newLineNum: newLineNum++,
        });
      }
    } else {
      if (oldLine !== undefined) {
        result.push({
          type: "remove",
          content: oldLine,
          oldLineNum: oldLineNum++,
        });
      }
      if (newLine !== undefined) {
        result.push({
          type: "add",
          content: newLine,
          newLineNum: newLineNum++,
        });
      }
    }
  }

  return result;
}

export interface DiffNodeData {
  interactionId: string;
  sessionName: string;
  title: string;
  oldContent: string;
  newContent: string;
  fileName: string;
  diffMode: string;
}

function DiffNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as DiffNodeData;
  const [mode, setMode] = useState<"split" | "unified">(
    nodeData.diffMode === "split" ? "split" : "unified"
  );

  const diffLines = useMemo(
    () => computeDiff(nodeData.oldContent || "", nodeData.newContent || ""),
    [nodeData.oldContent, nodeData.newContent]
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

  const renderUnifiedView = () => (
    <table className="w-full border-collapse font-mono text-xs">
      <tbody>
        {diffLines.map((line, idx) => (
          <tr
            key={idx}
            className={cn(
              line.type === "add" && "bg-[hsl(var(--diff-add-bg))]",
              line.type === "remove" && "bg-[hsl(var(--diff-remove-bg))]"
            )}
          >
            <td className="px-2 py-0.5 text-right text-muted-foreground select-none border-r border-border w-12">
              {line.oldLineNum ?? ""}
            </td>
            <td className="px-2 py-0.5 text-right text-muted-foreground select-none border-r border-border w-12">
              {line.newLineNum ?? ""}
            </td>
            <td className="px-2 py-0.5 w-6 text-center select-none">
              {line.type === "add" && (
                <span className="text-[hsl(var(--diff-add))]">+</span>
              )}
              {line.type === "remove" && (
                <span className="text-[hsl(var(--diff-remove))]">-</span>
              )}
            </td>
            <td className="px-2 py-0.5 whitespace-pre">{line.content}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderSplitView = () => {
    const oldLines = diffLines.filter((l) => l.type !== "add");
    const newLines = diffLines.filter((l) => l.type !== "remove");
    const maxLen = Math.max(oldLines.length, newLines.length);

    return (
      <div className="flex h-full">
        <div className="flex-1 overflow-auto border-r border-border">
          <table className="w-full border-collapse font-mono text-xs">
            <tbody>
              {Array.from({ length: maxLen }).map((_, idx) => {
                const line = oldLines[idx];
                return (
                  <tr
                    key={idx}
                    className={cn(
                      line?.type === "remove" &&
                        "bg-[hsl(var(--diff-remove-bg))]"
                    )}
                  >
                    <td className="px-2 py-0.5 text-right text-muted-foreground select-none border-r border-border w-12">
                      {line?.oldLineNum ?? ""}
                    </td>
                    <td className="px-2 py-0.5 whitespace-pre">
                      {line?.content ?? ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse font-mono text-xs">
            <tbody>
              {Array.from({ length: maxLen }).map((_, idx) => {
                const line = newLines[idx];
                return (
                  <tr
                    key={idx}
                    className={cn(
                      line?.type === "add" && "bg-[hsl(var(--diff-add-bg))]"
                    )}
                  >
                    <td className="px-2 py-0.5 text-right text-muted-foreground select-none border-r border-border w-12">
                      {line?.newLineNum ?? ""}
                    </td>
                    <td className="px-2 py-0.5 whitespace-pre">
                      {line?.content ?? ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <>
      <NodeResizer
        minWidth={300}
        minHeight={150}
        isVisible={selected}
        lineClassName="!border-primary"
        handleClassName="!w-2 !h-2 !bg-primary !border-primary"
      />
      <Card className="w-full h-full min-w-[300px] shadow-md flex flex-col">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <FileDiff className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-sm flex-1">{nodeData.title}</CardTitle>
            {nodeData.fileName && (
              <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">
                {nodeData.fileName}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 nodrag"
              onClick={() => setMode(mode === "split" ? "unified" : "split")}
              title={mode === "split" ? "Switch to unified" : "Switch to split"}
            >
              {mode === "split" ? (
                <Rows3 className="h-4 w-4" />
              ) : (
                <SplitSquareVertical className="h-4 w-4" />
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
          {mode === "unified" ? renderUnifiedView() : renderSplitView()}
        </CardContent>
      </Card>
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Right} id="right" />
    </>
  );
}

export default memo(DiffNode);
