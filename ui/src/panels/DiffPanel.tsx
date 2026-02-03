import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { IDockviewPanelProps } from "dockview";
import { FileDiff, X } from "lucide-react";

export interface DiffPanelParams {
  interactionId: string;
  sessionName: string;
  title: string;
  oldContent: string;
  newContent: string;
  fileName: string;
  diffMode: string;
}

// Simple diff display - highlights added/removed lines
function DiffView({
  oldContent,
  newContent,
}: { oldContent: string; newContent: string }) {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const maxLines = Math.max(oldLines.length, newLines.length);

  return (
    <div className="font-mono text-xs space-y-0.5">
      {Array.from({ length: maxLines }).map((_, i) => {
        const oldLine = oldLines[i];
        const newLine = newLines[i];

        if (oldLine === newLine) {
          return (
            <div key={i} className="px-2 py-0.5 text-muted-foreground">
              {oldLine}
            </div>
          );
        }

        return (
          <div key={i}>
            {oldLine !== undefined && oldLine !== newLine && (
              <div className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                - {oldLine}
              </div>
            )}
            {newLine !== undefined && newLine !== oldLine && (
              <div className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                + {newLine}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function DiffPanel({
  params,
}: IDockviewPanelProps<DiffPanelParams>) {
  const {
    interactionId,
    sessionName,
    title,
    oldContent,
    newContent,
    fileName,
  } = params;

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
          <FileDiff className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-sm flex-1">{title}</CardTitle>
          {fileName && (
            <span className="text-xs text-muted-foreground">{fileName}</span>
          )}
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
        <DiffView oldContent={oldContent} newContent={newContent} />
      </CardContent>
    </Card>
  );
}
