import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { IDockviewPanelProps } from "dockview";
import { GitBranch, X } from "lucide-react";
import mermaid from "mermaid";
import { useEffect, useRef } from "react";

export interface MermaidPanelParams {
  interactionId: string;
  sessionName: string;
  title: string;
  code: string;
}

// Initialize mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  securityLevel: "loose",
});

export default function MermaidPanel({
  params,
}: IDockviewPanelProps<MermaidPanelParams>) {
  const { interactionId, sessionName, title, code } = params;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const renderDiagram = async () => {
      if (!containerRef.current || !code) return;

      try {
        const id = `mermaid-${interactionId}`;
        const { svg } = await mermaid.render(id, code);
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        if (containerRef.current) {
          containerRef.current.innerHTML = `<pre class="text-xs text-destructive p-2">${err}</pre>`;
        }
      }
    };

    renderDiagram();
  }, [code, interactionId]);

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
      respond(interactionId, sessionName, { action: "accept" });
    }
  };

  return (
    <Card className="w-full h-full border-0 rounded-none shadow-none flex flex-col">
      <CardHeader className="panel-header pb-2">
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-sm flex-1">{title}</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={handleDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="py-2 flex-1 overflow-auto">
        <div
          ref={containerRef}
          className="w-full h-full flex items-center justify-center"
        />
      </CardContent>
    </Card>
  );
}
