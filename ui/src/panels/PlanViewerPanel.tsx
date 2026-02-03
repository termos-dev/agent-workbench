import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { IDockviewPanelProps } from "dockview";
import { Check, FileText, XCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

export interface PlanViewerPanelParams {
  interactionId: string;
  sessionName: string;
  title: string;
  content: string;
  file?: string;
}

export default function PlanViewerPanel({
  params,
}: IDockviewPanelProps<PlanViewerPanelParams>) {
  const {
    interactionId,
    sessionName,
    title,
    content: rawContent,
    file,
  } = params;
  const content = (rawContent || "").replace(/\\n/g, "\n");

  const respond = (
    window as unknown as {
      awbRespond?: (id: string, sessionName: string, response: unknown) => void;
    }
  ).awbRespond;

  const handleApprove = () => {
    if (respond) {
      respond(interactionId, sessionName, {
        action: "accept",
        result: { approved: true, file },
      });
    }
  };

  const handleReject = () => {
    if (respond) {
      respond(interactionId, sessionName, {
        action: "cancel",
        result: { approved: false, file },
      });
    }
  };

  return (
    <Card className="w-full h-full border-0 rounded-none shadow-none flex flex-col">
      <CardHeader className="panel-header pb-2">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-sm flex-1">{title}</CardTitle>
          {file && (
            <span className="text-xs text-muted-foreground truncate">
              {file}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="py-2 flex-1 overflow-auto">
        <div className="markdown-body text-sm select-text">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
          >
            {content}
          </ReactMarkdown>
        </div>
      </CardContent>
      <CardFooter className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={handleReject}>
          <XCircle className="h-4 w-4 mr-1" />
          Reject
        </Button>
        <Button size="sm" onClick={handleApprove}>
          <Check className="h-4 w-4 mr-1" />
          Approve
        </Button>
      </CardFooter>
    </Card>
  );
}
