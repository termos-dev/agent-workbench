import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { IDockviewPanelProps } from "dockview";
import { FileCode, X } from "lucide-react";
import { useMemo } from "react";

export interface HtmlPanelParams {
  interactionId: string;
  sessionName: string;
  title: string;
  content: string; // HTML content
  file?: string; // Optional file path (not used in current implementation)
}

export default function HtmlPanel({
  params,
}: IDockviewPanelProps<HtmlPanelParams>) {
  const { interactionId, sessionName, title, content } = params;

  // Prepare HTML content with components.js injection
  const htmlContent = useMemo(() => {
    if (!content) return "";

    let result = content;

    // Check if components.js is already included
    if (!result.includes("components.js")) {
      // Inject it before </head> or at the start of <body>
      if (result.includes("</head>")) {
        result = result.replace(
          "</head>",
          '<script src="/components.js"></script></head>'
        );
      } else if (result.includes("<body>")) {
        result = result.replace(
          "<body>",
          '<body><script src="/components.js"></script>'
        );
      } else {
        // Wrap in basic HTML structure
        result = `<!DOCTYPE html>
<html>
<head>
  <script src="/components.js"></script>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: #0a0a0f; color: #c9d1d9; }
  </style>
</head>
<body>
${content}
</body>
</html>`;
      }
    }

    return result;
  }, [content]);

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
          <FileCode className="h-5 w-5 text-muted-foreground" />
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
      <CardContent className="py-0 flex-1 overflow-hidden p-0">
        <iframe
          srcDoc={htmlContent}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin"
          title={title}
        />
      </CardContent>
    </Card>
  );
}
