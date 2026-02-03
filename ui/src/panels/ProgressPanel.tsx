import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { IDockviewPanelProps } from "dockview";
import { Check, Loader2, X } from "lucide-react";

export interface ProgressPanelParams {
  interactionId: string;
  sessionName: string;
  title: string;
  steps: string[];
  currentStep: number;
  percent: number;
}

export default function ProgressPanel({
  params,
}: IDockviewPanelProps<ProgressPanelParams>) {
  const { interactionId, sessionName, title, steps, currentStep, percent } =
    params;

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
          <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
          <CardTitle className="text-sm flex-1">{title}</CardTitle>
          <span className="text-xs text-muted-foreground">{percent}%</span>
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
        <Progress value={percent} className="mb-4" />
        {steps && steps.length > 0 && (
          <div className="space-y-2">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                {i < currentStep ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : i === currentStep ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <div className="h-4 w-4 rounded-full border border-muted-foreground" />
                )}
                <span
                  className={i <= currentStep ? "" : "text-muted-foreground"}
                >
                  {step}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
