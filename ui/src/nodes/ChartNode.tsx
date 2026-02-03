import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Handle, type NodeProps, NodeResizer, Position } from "@xyflow/react";
import ReactECharts from "echarts-for-react";
import { BarChart3, X } from "lucide-react";
import { memo, useMemo } from "react";

export interface ChartNodeData {
  interactionId: string;
  sessionName: string;
  title: string;
  chartType: string;
  data: unknown;
  options: Record<string, unknown>;
}

function ChartNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ChartNodeData;

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

  // Build ECharts options based on chart type and data
  const { chartType, data: chartData, options: chartOpts } = nodeData;
  const chartOptions = useMemo(() => {
    // If custom options are provided, use them directly
    if (chartOpts && Object.keys(chartOpts).length > 0) {
      return chartOpts;
    }

    // Auto-generate options based on chart type
    const dataArray = Array.isArray(chartData) ? chartData : [];

    const baseOptions = {
      animation: true,
      grid: {
        left: "10%",
        right: "10%",
        top: "15%",
        bottom: "15%",
      },
      tooltip: {
        trigger: chartType === "pie" ? "item" : "axis",
      },
    };

    switch (chartType) {
      case "bar":
        return {
          ...baseOptions,
          xAxis: {
            type: "category",
            data: dataArray.map((_, i) => `Item ${i + 1}`),
          },
          yAxis: {
            type: "value",
          },
          series: [
            {
              type: "bar",
              data: dataArray,
              itemStyle: {
                color: "hsl(var(--primary))",
              },
            },
          ],
        };

      case "pie":
        return {
          ...baseOptions,
          series: [
            {
              type: "pie",
              radius: ["40%", "70%"],
              data: dataArray.map((value, i) => ({
                value,
                name: `Item ${i + 1}`,
              })),
            },
          ],
        };

      case "sparkline":
        return {
          grid: {
            left: 0,
            right: 0,
            top: 5,
            bottom: 5,
          },
          xAxis: {
            type: "category",
            show: false,
            data: dataArray.map((_, i) => i),
          },
          yAxis: {
            type: "value",
            show: false,
          },
          series: [
            {
              type: "line",
              data: dataArray,
              smooth: true,
              symbol: "none",
              lineStyle: {
                color: "hsl(var(--primary))",
                width: 2,
              },
              areaStyle: {
                color: {
                  type: "linear",
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: "hsla(var(--primary), 0.3)" },
                    { offset: 1, color: "hsla(var(--primary), 0)" },
                  ],
                },
              },
            },
          ],
        };
      default:
        return {
          ...baseOptions,
          xAxis: {
            type: "category",
            data: dataArray.map((_, i) => `${i + 1}`),
          },
          yAxis: {
            type: "value",
          },
          series: [
            {
              type: "line",
              data: dataArray,
              smooth: true,
              lineStyle: {
                color: "hsl(var(--primary))",
              },
              itemStyle: {
                color: "hsl(var(--primary))",
              },
            },
          ],
        };
    }
  }, [chartType, chartData, chartOpts]);

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
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-sm flex-1">{nodeData.title}</CardTitle>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {nodeData.chartType || "line"}
            </span>
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
        <CardContent className="p-2 flex-1 nodrag nowheel">
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

export default memo(ChartNode);
