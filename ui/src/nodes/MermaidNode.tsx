import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Handle, type NodeProps, NodeResizer, Position } from "@xyflow/react";
import { GitBranch, RefreshCw, X } from "lucide-react";
import mermaid from "mermaid";
import { memo, useEffect, useRef, useState } from "react";

// Helper to get current theme
function getMermaidTheme(): "default" | "dark" {
  return document.documentElement.classList.contains("dark")
    ? "dark"
    : "default";
}

// Initialize mermaid with default config (will be re-initialized per render)
mermaid.initialize({
  startOnLoad: false,
  theme: getMermaidTheme(),
  securityLevel: "loose",
  fontFamily: "inherit",
});

export interface MermaidNodeData {
  interactionId: string;
  sessionName: string;
  title: string;
  code: string;
}

function MermaidNode({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as MermaidNodeData;
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0);

  useEffect(() => {
    const renderDiagram = async () => {
      if (!containerRef.current) return;

      try {
        setError(null);

        // Re-initialize mermaid with current theme before rendering
        mermaid.initialize({
          startOnLoad: false,
          theme: getMermaidTheme(),
          securityLevel: "loose",
          fontFamily: "inherit",
        });

        // Generate unique ID for each render (sanitize to remove invalid chars)
        const sanitizedId = id.replace(/[^a-zA-Z0-9-_]/g, "-");
        const mermaidId = `mermaid-${sanitizedId}-${key}`;

        // Clear previous content
        containerRef.current.innerHTML = "";

        // Render the diagram
        const { svg } = await mermaid.render(
          mermaidId,
          nodeData.code || "flowchart LR\n    A-->B"
        );
        containerRef.current.innerHTML = svg;

        // Make SVG responsive
        const svgElement = containerRef.current.querySelector("svg");
        if (svgElement) {
          svgElement.style.maxWidth = "100%";
          svgElement.style.height = "auto";
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to render diagram"
        );
      }
    };

    renderDiagram();
  }, [nodeData.code, id, key]);

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

  const handleRefresh = () => {
    setKey((k) => k + 1);
  };

  return (
    <>
      <NodeResizer
        minWidth={200}
        minHeight={150}
        isVisible={selected}
        lineClassName="!border-primary"
        handleClassName="!w-2 !h-2 !bg-primary !border-primary"
      />
      <Card className="w-full h-full min-w-[200px] shadow-md flex flex-col">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-sm flex-1">{nodeData.title}</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 nodrag"
              onClick={handleRefresh}
              title="Refresh diagram"
            >
              <RefreshCw className="h-4 w-4" />
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
        <CardContent className="p-4 flex-1 flex items-center justify-center nodrag nowheel">
          {error ? (
            <div className="text-sm text-destructive text-center">
              <p className="font-medium">Diagram Error</p>
              <p className="text-xs mt-1">{error}</p>
            </div>
          ) : (
            <div
              ref={containerRef}
              className="flex items-center justify-center w-full h-full"
            />
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

export default memo(MermaidNode);
