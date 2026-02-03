import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { IDockviewPanelProps } from "dockview";
import { LayoutGrid, X } from "lucide-react";

export interface CardPanelParams {
  interactionId: string;
  sessionName: string;
  title: string;
  content: string;
  actions: Array<{ label: string; value: string }>;
}

export default function CardPanel({
  params,
}: IDockviewPanelProps<CardPanelParams>) {
  const { interactionId, sessionName, title, content, actions } = params;

  const handleAction = (actionValue: string) => {
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
        result: actionValue,
      });
    }
  };

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
          <LayoutGrid className="h-5 w-5 text-muted-foreground" />
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
        <p className="text-sm whitespace-pre-wrap">{content}</p>
      </CardContent>
      {actions && actions.length > 0 && (
        <CardFooter className="flex flex-wrap gap-2 pt-2">
          {actions.map((action, i) => (
            <Button
              key={i}
              variant="outline"
              size="sm"
              onClick={() => handleAction(action.value)}
            >
              {action.label}
            </Button>
          ))}
        </CardFooter>
      )}
    </Card>
  );
}
