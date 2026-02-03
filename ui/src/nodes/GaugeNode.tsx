import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Handle, type NodeProps, NodeResizer, Position } from "@xyflow/react";
import ReactECharts from "echarts-for-react";
import { Gauge, X } from "lucide-react";
import { memo, useMemo } from "react";

export interface GaugeNodeData {
  interactionId: string;
  sessionName: string;
  title: string;
  value: number;
  min: number;
  max: number;
  label: string;
  thresholds: Array<{ value: number; color: string }>;
}

function GaugeNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as GaugeNodeData;

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
      respond(nodeData.interactionId, nodeData.sessionName, {
        action: "accept",
      });
    }
  };

  const {
    value = 0,
    min = 0,
    max = 100,
    label = "",
    thresholds = [],
  } = nodeData;

  // Build color stops for gauge
  const axisLine = useMemo(() => {
    if (thresholds.length === 0) {
      return {
        lineStyle: {
          width: 20,
          color: [[1, "hsl(var(--primary))"]],
        },
      };
    }

    return {
      lineStyle: {
        width: 20,
        color: thresholds.map((t) => [t.value, t.color]),
      },
    };
  }, [thresholds]);

  const chartOptions = useMemo(
    () => ({
      series: [
        {
          type: "gauge",
          min,
          max,
          progress: {
            show: true,
            width: 20,
          },
          axisLine,
          axisTick: {
            show: false,
          },
          splitLine: {
            length: 10,
            lineStyle: {
              width: 2,
              color: "hsl(var(--chart-muted))",
            },
          },
          axisLabel: {
            show: false,
          },
          anchor: {
            show: true,
            showAbove: true,
            size: 20,
            itemStyle: {
              borderWidth: 8,
              borderColor: "hsl(var(--primary))",
            },
          },
          title: {
            show: !!label,
            offsetCenter: [0, "70%"],
            fontSize: 14,
            color: "hsl(var(--foreground))",
          },
          detail: {
            valueAnimation: true,
            fontSize: 24,
            fontWeight: "bold",
            offsetCenter: [0, "40%"],
            formatter: (val: number) => `${Math.round(val)}`,
            color: "hsl(var(--foreground))",
          },
          data: [
            {
              value,
              name: label,
            },
          ],
        },
      ],
    }),
    [value, min, max, label, axisLine]
  );

  return (
    <>
      <NodeResizer
        minWidth={200}
        minHeight={150}
        isVisible={selected}
        lineClassName="!border-primary"
        handleClassName="!w-2 !h-2 !bg-primary !border-primary"
      />
      <Card className="w-full h-full min-w-[200px] shadow-md flex flex-col">
        <CardHeader className="pb-0">
          <div className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-sm flex-1">{nodeData.title}</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 nodrag"
              onClick={handleDismiss}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 flex-1 nodrag nowheel">
          <ReactECharts
            option={chartOptions}
            style={{ height: "100%", width: "100%" }}
            opts={{ renderer: "svg" }}
          />
        </CardContent>
      </Card>
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Right} id="right" />
    </>
  );
}

export default memo(GaugeNode);
