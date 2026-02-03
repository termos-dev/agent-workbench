import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { IDockviewPanelProps } from "dockview";
import { HelpCircle } from "lucide-react";

export interface ConfirmPanelParams {
  interactionId: string;
  sessionName: string;
  title: string;
  prompt: string;
}

export default function ConfirmPanel({
  params,
}: IDockviewPanelProps<ConfirmPanelParams>) {
  const { interactionId, sessionName, title, prompt } = params;

  const handleResponse = (confirmed: boolean) => {
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
        action: confirmed ? "accept" : "decline",
        result: confirmed,
      });
    }
  };

  return (
    <Card className="w-full h-full border-0 rounded-none shadow-none flex flex-col">
      <CardHeader className="panel-header pb-2">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-sm">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="py-2 flex-1">
        <p className="text-sm text-muted-foreground">{prompt}</p>
      </CardContent>
      <CardFooter className="flex justify-end gap-2 pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleResponse(false)}
        >
          No
        </Button>
        <Button size="sm" onClick={() => handleResponse(true)}>
          Yes
        </Button>
      </CardFooter>
    </Card>
  );
}
