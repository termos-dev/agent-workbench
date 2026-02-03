import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { IDockviewPanelProps } from "dockview";
import { BarChart3, X } from "lucide-react";

export interface ChartPanelParams {
  interactionId: string;
  sessionName: string;
  title: string;
  chartType: string;
  data: unknown[];
  options: Record<string, unknown>;
}

export default function ChartPanel({
  params,
}: IDockviewPanelProps<ChartPanelParams>) {
  const { interactionId, sessionName, title, chartType, data } = params;

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

  // Simple bar chart visualization
  const maxValue = Math.max(
    ...data.map((d: unknown) => {
      if (typeof d === "number") return d;
      if (typeof d === "object" && d && "value" in d)
        return (d as { value: number }).value;
      return 0;
    })
  );

  return (
    <Card className="w-full h-full border-0 rounded-none shadow-none flex flex-col">
      <CardHeader className="panel-header pb-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-sm flex-1">{title}</CardTitle>
          <span className="text-xs text-muted-foreground">{chartType}</span>
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
        <div className="space-y-2">
          {data.map((item: unknown, i: number) => {
            const value =
              typeof item === "number"
                ? item
                : typeof item === "object" && item && "value" in item
                  ? (item as { value: number }).value
                  : 0;
            const label =
              typeof item === "object" && item && "label" in item
                ? (item as { label: string }).label
                : `Item ${i + 1}`;
            const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;

            return (
              <div key={i} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>{label}</span>
                  <span>{value}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
