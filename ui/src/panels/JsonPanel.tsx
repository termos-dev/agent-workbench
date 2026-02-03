import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { copyToClipboard } from "@/lib/clipboard";
import type { IDockviewPanelProps } from "dockview";
import { AlertTriangle, Braces, Check, Copy, X } from "lucide-react";
import { useState } from "react";

export interface JsonPanelParams {
  interactionId: string;
  sessionName: string;
  title: string;
  data: unknown;
}

export default function JsonPanel({
  params,
}: IDockviewPanelProps<JsonPanelParams>) {
  const { interactionId, sessionName, title, data } = params;
  const [copyState, setCopyState] = useState<"idle" | "success" | "error">(
    "idle"
  );

  const jsonString = JSON.stringify(data, null, 2);

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

  const handleCopy = async () => {
    const success = await copyToClipboard(jsonString);
    setCopyState(success ? "success" : "error");
    setTimeout(() => setCopyState("idle"), 2000);
  };

  return (
    <Card className="w-full h-full border-0 rounded-none shadow-none flex flex-col">
      <CardHeader className="panel-header pb-2">
        <div className="flex items-center gap-2">
          <Braces className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-sm flex-1">{title}</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={handleCopy}
            title={copyState === "error" ? "Copy failed" : "Copy"}
          >
            {copyState === "success" ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : copyState === "error" ? (
              <AlertTriangle className="h-4 w-4 text-red-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
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
        <pre className="text-xs font-mono bg-muted p-3 rounded overflow-auto">
          {jsonString}
        </pre>
      </CardContent>
    </Card>
  );
}
