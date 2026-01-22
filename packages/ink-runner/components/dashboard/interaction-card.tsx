/**
 * Interaction card component - displays a single interaction with its content.
 */

import * as fs from "node:fs";
import { formatDistanceToNow } from "date-fns";
import { Box, Text } from "ink";
import { useMemo } from "react";
import {
  detectDiagramType,
  renderClassAscii,
  renderFlowchartAscii,
  renderSequenceAscii,
  renderStateAscii,
  stripMarkdownFences,
} from "../mermaid-measure.js";
import { TableError, TableRenderer, parseTableData } from "../shared/index.js";
import {
  AskEmbed,
  CardEmbed,
  ConfirmEmbed,
  DisplayFeedbackEmbed,
  InputEmbed,
  LiveOutputEmbed,
  SelectEmbed,
} from "./embeds/index.js";
import type { DashboardInteraction } from "./types.js";
import type { InteractionResponse } from "./use-dashboard-data.js";

// Interactive components that need user response
const INTERACTIVE = new Set([
  "confirm",
  "select",
  "checklist",
  "ask",
  "input",
  "card",
]);
const isInteractive = (c: string) => INTERACTIVE.has(c);

// Markdown rendering
function renderMd(line: string, i: number) {
  if (line.startsWith("### "))
    return (
      <Text key={i} color="yellow">
        {line.slice(4)}
      </Text>
    );
  if (line.startsWith("## "))
    return (
      <Text key={i} bold color="cyan">
        {line.slice(3)}
      </Text>
    );
  if (line.startsWith("# "))
    return (
      <Text key={i} bold color="green">
        {line.slice(2)}
      </Text>
    );
  if (line.startsWith("- "))
    return (
      <Text key={i}>
        <Text color="blue">•</Text> {line.slice(2)}
      </Text>
    );
  if (!line.trim()) return <Text key={i}> </Text>;
  return <Text key={i}>{line}</Text>;
}

export interface InteractionCardProps {
  interaction: DashboardInteraction;
  isSelected: boolean;
  onRespond: (response: InteractionResponse) => void;
  width: number;
  onTabNext?: () => void;
  onTabPrev?: () => void;
}

export function InteractionCard({
  interaction,
  isSelected,
  onRespond,
  width,
  onTabNext,
  onTabPrev,
}: InteractionCardProps) {
  const args = interaction.args as Record<string, unknown> | undefined;
  const interactive = isInteractive(interaction.component);

  // Check if output is live
  const isLiveOutput =
    interaction.component === "output" &&
    args?.live === true &&
    args?.outputFile;

  // Content extraction
  const content = useMemo(() => {
    if (interaction.component === "card") {
      const c = args?.content as string;
      if (c) return c.split("\n");
      if (args?.file) {
        try {
          return fs.readFileSync(args.file as string, "utf-8").split("\n");
        } catch {
          return [`[Error: ${args.file}]`];
        }
      }
    }
    if (interaction.component === "mermaid") {
      let source = "";
      const code = args?.code as string;
      if (code) source = code;
      else if (args?.file) {
        try {
          source = fs.readFileSync(args.file as string, "utf-8");
        } catch {
          return [`[Error: ${args.file}]`];
        }
      }
      if (source) {
        const clean = stripMarkdownFences(source);
        const type = detectDiagramType(clean);
        let result: { lines: string[]; error?: string } | null = null;
        // Pass width to renderers that support it for proper grid layout
        const renderWidth = Math.max(40, width - 4); // Account for padding/borders
        if (type === "flowchart") result = renderFlowchartAscii(clean);
        else if (type === "sequence") result = renderSequenceAscii(clean);
        else if (type === "class") result = renderClassAscii(clean);
        else if (type === "state")
          result = renderStateAscii(clean, { maxWidth: renderWidth });
        if (result && !result.error) return result.lines;
        // Fallback to source
        return clean.split("\n");
      }
    }
    if (!interactive) {
      // Skip static content for live output - it's handled separately
      if (interaction.component === "output" && !isLiveOutput) {
        return ((args?.output as string) || "").split("\n");
      }
      if (interaction.component === "code") {
        if (args?.file) {
          try {
            return fs.readFileSync(args.file as string, "utf-8").split("\n");
          } catch {
            return [`[Error: ${args.file}]`];
          }
        }
        return ((args?.content as string) || "").split("\n");
      }
      if (interaction.component === "json") {
        const d = args?.data;
        return (typeof d === "string" ? d : JSON.stringify(d, null, 2)).split(
          "\n"
        );
      }
    }
    return [];
  }, [interaction.component, args, interactive, isLiveOutput, width]);

  // Table parsing
  const tableResult = useMemo(() => {
    if (interaction.component !== "table") return null;
    return parseTableData(
      args?.data as string | unknown[],
      args?.columns as string
    );
  }, [interaction.component, args?.data, args?.columns]);

  // Chart data parsing
  const chartType = (args?.type as string) || "bar";
  const chartData = useMemo(() => {
    if (interaction.component !== "chart") return null;
    try {
      const raw = args?.data as string;
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Array of numbers → for sparkline or convert to bar
        if (typeof parsed[0] === "number") {
          return { type: "numbers", values: parsed.slice(0, 40) as number[] };
        }
        // Array of objects → bar chart
        return {
          type: "objects",
          items: parsed
            .slice(0, 8)
            .map((item: { label?: string; value?: number }, i: number) => ({
              label: item.label || `Item ${i + 1}`,
              value: item.value || 0,
            })),
        };
      }
      return null;
    } catch {
      return null;
    }
  }, [interaction.component, args?.data]);

  return (
    <Box flexDirection="column" width={width}>
      <Box>
        <Text color={isSelected ? "cyan" : "white"}>
          {isSelected ? "> " : "  "}
        </Text>
        <Text color={interactive ? "yellow" : "blue"}>
          {interactive ? "? " : "# "}
        </Text>
        <Text bold>{interaction.component}: </Text>
        <Text>{interaction.title || "Untitled"}</Text>
        <Text dimColor>
          {" "}
          ({formatDistanceToNow(interaction.ts, { addSuffix: true })})
        </Text>
      </Box>

      {interaction.component !== "ask" && (
        <Box marginTop={1} marginLeft={2} flexDirection="column">
          {interaction.component === "card" ? (
            content.map(renderMd)
          ) : interaction.component === "mermaid" ? (
            content.map((l, i) => (
              <Text key={i} dimColor={!isSelected}>
                {l}
              </Text>
            ))
          ) : interaction.component === "chart" ? (
            chartData ? (
              chartType === "sparkline" && chartData.type === "numbers" ? (
                // Sparkline rendering
                <Box flexDirection="column">
                  <Text color="cyan">
                    {chartData.values
                      .map((v: number) => {
                        const min = Math.min(...chartData.values);
                        const max = Math.max(...chartData.values);
                        const range = max - min || 1;
                        const chars = "▁▂▃▄▅▆▇█";
                        const idx = Math.min(
                          Math.floor(((v - min) / range) * 8),
                          7
                        );
                        return chars[idx];
                      })
                      .join("")}
                  </Text>
                  <Text dimColor>
                    min: {Math.min(...chartData.values)} max:{" "}
                    {Math.max(...chartData.values)} pts:{" "}
                    {chartData.values.length}
                  </Text>
                </Box>
              ) : chartData.type === "objects" ? (
                // Bar chart rendering
                <Box flexDirection="column">
                  {chartData.items.map(
                    (item: { label: string; value: number }, i: number) => {
                      const maxVal = Math.max(
                        ...chartData.items.map(
                          (d: { value: number }) => d.value
                        ),
                        1
                      );
                      const barWidth = Math.min(
                        30,
                        Math.floor((item.value / maxVal) * 30)
                      );
                      const colors = [
                        "cyan",
                        "green",
                        "yellow",
                        "magenta",
                        "blue",
                      ];
                      return (
                        <Box key={i}>
                          <Text dimColor>{item.label}</Text>
                          <Text color={colors[i % colors.length]}>
                            {"█".repeat(barWidth)}
                          </Text>
                          <Text dimColor> {item.value}</Text>
                        </Box>
                      );
                    }
                  )}
                </Box>
              ) : chartData.type === "numbers" ? (
                // Numbers as bar chart (convert to items)
                <Box flexDirection="column">
                  {chartData.values.slice(0, 8).map((v: number, i: number) => {
                    const maxVal = Math.max(...chartData.values.slice(0, 8), 1);
                    const barWidth = Math.min(
                      30,
                      Math.floor((v / maxVal) * 30)
                    );
                    const colors = [
                      "cyan",
                      "green",
                      "yellow",
                      "magenta",
                      "blue",
                    ];
                    return (
                      <Box key={i}>
                        <Text dimColor>{String(i + 1).padEnd(12)}</Text>
                        <Text color={colors[i % colors.length]}>
                          {"█".repeat(barWidth)}
                        </Text>
                        <Text dimColor> {v}</Text>
                      </Box>
                    );
                  })}
                </Box>
              ) : null
            ) : (
              <Text dimColor>[Chart: {chartType}]</Text>
            )
          ) : interaction.component === "table" && tableResult ? (
            "error" in tableResult ? (
              <TableError error={tableResult.error} />
            ) : (
              <TableRenderer
                data={tableResult.data}
                width={Math.max(30, width - 10)}
                maxRows={8}
                compact
              />
            )
          ) : interaction.component === "gauge" ? (
            // Gauge rendering
            (() => {
              const value = Number.parseFloat(args?.value as string) || 0;
              const min = Number.parseFloat(args?.min as string) || 0;
              const max = Number.parseFloat(args?.max as string) || 100;
              const unit = (args?.unit as string) || "%";
              const label = args?.label as string;
              const percent = Math.max(
                0,
                Math.min(100, ((value - min) / (max - min)) * 100)
              );
              // Safeguard against NaN width
              const safeWidth = Number.isFinite(width) ? width : 80;
              const barWidth = Math.min(30, Math.max(10, safeWidth - 20));
              const filled = Math.round((percent * barWidth) / 100);
              const empty = barWidth - filled;
              const color =
                percent >= 90 ? "red" : percent >= 70 ? "yellow" : "green";
              return (
                <Box flexDirection="column">
                  {label && <Text bold>{label}</Text>}
                  <Box>
                    <Text color={color}>
                      {filled > 0 ? "█".repeat(filled) : ""}
                    </Text>
                    <Text dimColor>{empty > 0 ? "░".repeat(empty) : ""}</Text>
                    <Text> </Text>
                    <Text bold>{value.toLocaleString()}</Text>
                    <Text dimColor>{unit}</Text>
                  </Box>
                  <Box>
                    <Text dimColor>
                      {min}
                      {unit}
                    </Text>
                    <Text dimColor>
                      {" ".repeat(
                        Math.max(
                          1,
                          barWidth - String(min).length - String(max).length
                        )
                      )}
                    </Text>
                    <Text dimColor>
                      {max}
                      {unit}
                    </Text>
                  </Box>
                </Box>
              );
            })()
          ) : interaction.component === "progress" ? (
            // Progress steps rendering
            (() => {
              const stepsStr =
                (args?.steps as string) ||
                (args?.tasks as string) ||
                (args?.items as string) ||
                "";
              const steps = stepsStr
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              const currentStep = Number.parseInt(args?.step as string) || 1;
              if (steps.length === 0)
                return <Text dimColor>[No steps defined]</Text>;
              return (
                <Box flexDirection="column">
                  {steps.map((step, i) => {
                    const status =
                      i < currentStep - 1
                        ? "done"
                        : i === currentStep - 1
                          ? "running"
                          : "pending";
                    const icon =
                      status === "done"
                        ? "✓"
                        : status === "running"
                          ? "◉"
                          : "○";
                    const color =
                      status === "done"
                        ? "green"
                        : status === "running"
                          ? "cyan"
                          : undefined;
                    return (
                      <Box key={i}>
                        <Text color={color}>{icon} </Text>
                        <Text color={color} dimColor={status === "pending"}>
                          {step}
                        </Text>
                      </Box>
                    );
                  })}
                </Box>
              );
            })()
          ) : interaction.component === "tree" ? (
            // Tree - show path info
            <Box flexDirection="column">
              <Text>📁 {args?.path || args?.dir || process.cwd()}</Text>
              <Text dimColor>Open full view to browse tree</Text>
            </Box>
          ) : interaction.component === "diff" ? (
            // Diff - show file comparison info
            <Box flexDirection="column">
              <Text>📄 {args?.file1 || args?.old || "file1"}</Text>
              <Text dimColor>↓</Text>
              <Text>📄 {args?.file2 || args?.new || "file2"}</Text>
            </Box>
          ) : interaction.component === "markdown" ? (
            // Markdown - show file path
            <Box flexDirection="column">
              <Text>📝 {args?.file || "markdown content"}</Text>
            </Box>
          ) : isLiveOutput ? (
            <LiveOutputEmbed
              outputFile={args?.outputFile as string}
              isActive={isSelected}
              onRespond={(feedback) =>
                onRespond({ action: "accept", value: "dismissed", feedback })
              }
            />
          ) : !interactive ? (
            content.map((l, i) => (
              <Text key={i} dimColor={!isSelected}>
                {l}
              </Text>
            ))
          ) : (
            <Text>{interaction.prompt || "Please respond"}</Text>
          )}
        </Box>
      )}

      <Box marginTop={1} marginLeft={2}>
        {interaction.component === "confirm" && (
          <ConfirmEmbed
            isActive={isSelected}
            onRespond={(v) => onRespond({ action: "accept", value: v })}
            onCancel={() => onRespond({ action: "cancel" })}
          />
        )}
        {interaction.component === "select" && (
          <SelectEmbed
            interaction={interaction}
            isActive={isSelected}
            onRespond={(v) => onRespond({ action: "accept", value: v })}
            onCancel={() => onRespond({ action: "cancel" })}
          />
        )}
        {interaction.component === "input" && (
          <InputEmbed
            interaction={interaction}
            isActive={isSelected}
            onRespond={(v) => onRespond({ action: "accept", value: v })}
            onCancel={() => onRespond({ action: "cancel" })}
          />
        )}
        {interaction.component === "ask" && (
          <AskEmbed
            interaction={interaction}
            isActive={isSelected}
            onRespond={(a) => onRespond({ action: "accept", answers: a })}
            onCancel={() => onRespond({ action: "cancel" })}
            onTabNext={onTabNext}
            onTabPrev={onTabPrev}
          />
        )}
        {interaction.component === "card" && (
          <CardEmbed
            interaction={interaction}
            isActive={isSelected}
            onRespond={(v, l) =>
              onRespond({
                action: "accept",
                value: { selected: v, selectedLabel: l },
              })
            }
            onCancel={() => onRespond({ action: "cancel" })}
          />
        )}
        {!interactive && !isLiveOutput && isSelected && (
          <DisplayFeedbackEmbed
            isActive={isSelected}
            onRespond={(feedback) =>
              onRespond({ action: "accept", value: "dismissed", feedback })
            }
          />
        )}
      </Box>
    </Box>
  );
}
