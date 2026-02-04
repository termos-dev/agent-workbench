import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { IDockviewPanelProps } from "dockview";
import { FileCode, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

export interface HtmlPanelParams {
  interactionId: string;
  sessionName: string;
  title: string;
  content: string; // HTML content
  file?: string; // Optional file path (not used in current implementation)
}

// Helper to get CSS variable as hsl color string
const getCssVar = (name: string): string => {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value ? `hsl(${value})` : "";
};

export default function HtmlPanel({
  params,
}: IDockviewPanelProps<HtmlPanelParams>) {
  const { interactionId, sessionName, title, content } = params;
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Listen for messages from the iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only handle messages from our iframe
      if (
        iframeRef.current &&
        event.source === iframeRef.current.contentWindow
      ) {
        const { type, data } = event.data || {};

        if (type === "awb:submit") {
          // User submitted data from the playground
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
            respond(interactionId, sessionName, {
              action: "accept",
              result: data,
            });
          }
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [interactionId, sessionName]);

  // Prepare HTML content with components.js and AWB API injection
  const htmlContent = useMemo(() => {
    if (!content) return "";

    // Get theme colors from CSS variables
    const bgColor = getCssVar("--background");
    const fgColor = getCssVar("--foreground");

    // AWB API script that the playground can use to send data back
    const awbApiScript = `
<script>
  // AWB Playground API - send data back to the agent
  window.awb = {
    // Submit result and close the playground
    submit: function(data) {
      window.parent.postMessage({ type: 'awb:submit', data: data }, '*');
    },
    // Copy text to clipboard with visual feedback
    copyToClipboard: function(text, button) {
      navigator.clipboard.writeText(text).then(function() {
        if (button) {
          const original = button.textContent;
          button.textContent = 'Copied!';
          setTimeout(function() { button.textContent = original; }, 1500);
        }
      });
    }
  };
</script>`;

    let result = content;

    // Check if components.js is already included
    if (!result.includes("components.js")) {
      // Inject it before </head> or at the start of <body>
      if (result.includes("</head>")) {
        result = result.replace(
          "</head>",
          `<script src="/components.js"></script>${awbApiScript}</head>`
        );
      } else if (result.includes("<body>")) {
        result = result.replace(
          "<body>",
          `<body><script src="/components.js"></script>${awbApiScript}`
        );
      } else {
        // Wrap in basic HTML structure
        result = `<!DOCTYPE html>
<html>
<head>
  <script src="/components.js"></script>
  ${awbApiScript}
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: ${bgColor}; color: ${fgColor}; }
  </style>
</head>
<body>
${content}
</body>
</html>`;
      }
    } else {
      // components.js already included, just add AWB API
      if (result.includes("</head>")) {
        result = result.replace("</head>", `${awbApiScript}</head>`);
      } else if (result.includes("<body>")) {
        result = result.replace("<body>", `<body>${awbApiScript}`);
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
          ref={iframeRef}
          srcDoc={htmlContent}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin"
          title={title}
        />
      </CardContent>
    </Card>
  );
}
