import AskNode from "./AskNode";
import ChecklistNode from "./ChecklistNode";
// Interactive nodes (require user response)
import ConfirmNode from "./ConfirmNode";
import SelectNode from "./SelectNode";

// Display nodes (read-only content)
import CardNode from "./CardNode";
import ChartNode from "./ChartNode";
import CodeNode from "./CodeNode";
import DiffNode from "./DiffNode";
import GaugeNode from "./GaugeNode";
import JsonNode from "./JsonNode";
import MarkdownNode from "./MarkdownNode";
import MermaidNode from "./MermaidNode";
import ProgressNode from "./ProgressNode";
import TableNode from "./TableNode";
import TreeNode from "./TreeNode";

// Node types for React Flow
export const nodeTypes = {
  // Interactive nodes
  confirm: ConfirmNode,
  select: SelectNode,
  checklist: ChecklistNode,
  ask: AskNode,
  // Display nodes
  card: CardNode,
  markdown: MarkdownNode,
  code: CodeNode,
  table: TableNode,
  progress: ProgressNode,
  diff: DiffNode,
  json: JsonNode,
  tree: TreeNode,
  chart: ChartNode,
  mermaid: MermaidNode,
  gauge: GaugeNode,
} as const;

export type NodeType = keyof typeof nodeTypes;

// Re-export node data types
export type { ConfirmNodeData } from "./ConfirmNode";
export type { SelectNodeData } from "./SelectNode";
export type { ChecklistNodeData } from "./ChecklistNode";
export type { AskNodeData } from "./AskNode";
export type { CardNodeData } from "./CardNode";
export type { MarkdownNodeData } from "./MarkdownNode";
export type { CodeNodeData } from "./CodeNode";
export type { TableNodeData } from "./TableNode";
export type { ProgressNodeData } from "./ProgressNode";
export type { DiffNodeData } from "./DiffNode";
export type { JsonNodeData } from "./JsonNode";
export type { TreeNodeData } from "./TreeNode";
export type { ChartNodeData } from "./ChartNode";
export type { MermaidNodeData } from "./MermaidNode";
export type { GaugeNodeData } from "./GaugeNode";
