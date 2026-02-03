import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { IDockviewPanelProps } from "dockview";
import { Gauge, X } from "lucide-react";

interface Threshold {
  value: number;
  color: string;
}

export interface GaugePanelParams {
  interactionId: string;
  sessionName: string;
  title: string;
  value: number;
  min: number;
  max: number;
  label: string;
  thresholds: Threshold[];
}

export default function GaugePanel({
  params,
}: IDockviewPanelProps<GaugePanelParams>) {
  const {
    interactionId,
    sessionName,
    title,
    value,
    min,
    max,
    label,
    thresholds,
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

  // Calculate percentage
  const range = max - min;
  const percentage = range > 0 ? ((value - min) / range) * 100 : 0;

  // Determine color based on thresholds
  let color = "bg-primary";
  if (thresholds && thresholds.length > 0) {
    for (const threshold of thresholds.sort((a, b) => b.value - a.value)) {
      if (value >= threshold.value) {
        color = threshold.color;
        break;
      }
    }
  }

  // SVG arc for gauge
  const radius = 40;
  const circumference = Math.PI * radius;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference * (1 - percentage / 100);

  return (
    <Card className="w-full h-full border-0 rounded-none shadow-none flex flex-col">
      <CardHeader className="panel-header pb-2">
        <div className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-muted-foreground" />
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
      <CardContent className="py-2 flex-1 flex flex-col items-center justify-center">
        <div className="relative">
          <svg width="100" height="60" viewBox="0 0 100 60">
            {/* Background arc */}
            <path
              d="M 10 50 A 40 40 0 0 1 90 50"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              className="text-muted"
            />
            {/* Value arc */}
            <path
              d="M 10 50 A 40 40 0 0 1 90 50"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              className={
                color.startsWith("bg-")
                  ? color.replace("bg-", "text-")
                  : "text-primary"
              }
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
            <span className="text-2xl font-bold">{value}</span>
          </div>
        </div>
        {label && (
          <span className="text-sm text-muted-foreground mt-2">{label}</span>
        )}
        <div className="flex justify-between w-full text-xs text-muted-foreground mt-1">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      </CardContent>
    </Card>
  );
}
