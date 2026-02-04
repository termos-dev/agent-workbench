import type { FormQuestion } from "@schema/schema";
import {
  type DockviewApi,
  type DockviewGroupPanel,
  DockviewReact,
  type IDockviewHeaderActionsProps,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
} from "dockview";
import {
  ExternalLink,
  GitCompare,
  Loader2,
  Maximize2,
  MessageSquare,
  Play,
  Plus,
  ScrollText,
  Terminal,
  Trash2,
  WifiOff,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import "dockview/dist/styles/dockview.css";
import {
  type Interaction,
  type ProjectInteractions,
  useWebSocket,
} from "./hooks/useWebSocket";

import AskPanel from "./panels/AskPanel";
import CardPanel from "./panels/CardPanel";
import ChartPanel from "./panels/ChartPanel";
import ChecklistPanel from "./panels/ChecklistPanel";
import CodePanel from "./panels/CodePanel";
// Import panel components (will adapt these)
import ConfirmPanel from "./panels/ConfirmPanel";
import DiffPanel from "./panels/DiffPanel";
import GaugePanel from "./panels/GaugePanel";
import GitDiffPanel from "./panels/GitDiffPanel";
import HtmlPanel from "./panels/HtmlPanel";
import JsonPanel from "./panels/JsonPanel";
import MarkdownPanel from "./panels/MarkdownPanel";
import MermaidPanel from "./panels/MermaidPanel";
import PlanViewerPanel from "./panels/PlanViewerPanel";
import ProgressPanel from "./panels/ProgressPanel";
import ScratchpadPanel from "./panels/ScratchpadPanel";
import SelectPanel from "./panels/SelectPanel";
import TablePanel from "./panels/TablePanel";
import TmuxPanel from "./panels/TmuxPanel";
import TreePanel from "./panels/TreePanel";

// Enable demo mode when: ?demo param present, or embedded in iframe (landing page)
const urlDemoMode =
  typeof window !== "undefined" &&
  (new URLSearchParams(window.location.search).has("demo") ||
    window.self !== window.top);

// Panel components map for dockview - using unknown with type assertion for dockview compatibility
const components: Record<
  string,
  // biome-ignore lint/suspicious/noExplicitAny: Dockview requires flexible component typing
  React.ComponentType<IDockviewPanelProps<any>>
> = {
  confirm: ConfirmPanel,
  select: SelectPanel,
  checklist: ChecklistPanel,
  ask: AskPanel,
  card: CardPanel,
  markdown: MarkdownPanel,
  code: CodePanel,
  table: TablePanel,
  progress: ProgressPanel,
  diff: DiffPanel,
  json: JsonPanel,
  tree: TreePanel,
  chart: ChartPanel,
  mermaid: MermaidPanel,
  gauge: GaugePanel,
  scratchpad: ScratchpadPanel,
  gitdiff: GitDiffPanel,
  html: HtmlPanel,
  "plan-viewer": PlanViewerPanel,
  tmux: TmuxPanel,
};

// Tab components for panels that need custom tab behavior
const tabComponents: Record<
  string,
  React.ComponentType<IDockviewPanelHeaderProps>
> = {};

// Interactive panels = floating (quick responses)
// Content panels = docked (display/review)
const _FLOATING_COMPONENTS = new Set([
  "confirm",
  "select",
  "ask",
  "checklist",
  "progress",
  "gauge",
  "card",
]);

const DOCKED_COMPONENTS = new Set([
  "code",
  "markdown",
  "diff",
  "mermaid",
  "json",
  "table",
  "tree",
  "chart",
  "html",
  "scratchpad",
  "plan-viewer",
]);

// Helper to parse JSON data that might be a string
function parseJsonData<T>(data: unknown, fallback: T): T {
  if (data === undefined || data === null) return fallback;
  if (typeof data === "string") {
    try {
      return JSON.parse(data) as T;
    } catch {
      return fallback;
    }
  }
  return data as T;
}

// Helper to parse string arrays
function parseStringArray(data: unknown): string[] {
  if (data === undefined || data === null) return [];
  if (Array.isArray(data)) return data.map(String);
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      if (data.includes(",")) {
        return data.split(",").map((s) => s.trim());
      }
      return data.trim() ? [data.trim()] : [];
    }
  }
  return [];
}

// Track interaction ID -> session name mapping
type InteractionInfo = { sessionName: string };

// Event log entry type
interface EventLogEntry {
  id: number;
  timestamp: Date;
  type: "panel" | "group" | "ws" | "interaction";
  action: string;
  details: string;
}

// Global event log array and counter
let eventLogCounter = 0;
const MAX_EVENT_LOG_ENTRIES = 100;

// Global map to track group ID -> project name (for header components)
const groupToProjectMap = new Map<string, string>();

// Helper to get project name from group
function getProjectNameFromGroup(group: DockviewGroupPanel): string | null {
  return groupToProjectMap.get(group.id) || null;
}

// Prefix header action - project name + git diff button (BEFORE tabs)
// Only shown for docked panels, not floating ones
// Agent icons - use real favicons where available
const AGENT_ICONS: Record<string, string> = {
  claude: "/icons/claude.ico",
  codex: "/icons/openai.ico",
  chatgpt: "/icons/openai.ico",
};

const AgentIcon = ({
  agent,
  className,
}: { agent: string; className?: string }) => {
  const iconClass = className || "w-3 h-3";
  const iconSrc = AGENT_ICONS[agent];

  if (iconSrc) {
    return (
      <img
        src={iconSrc}
        alt={agent}
        className={`${iconClass} object-contain`}
      />
    );
  }

  // Fallback: generic terminal icon for unknown agents
  return (
    <svg viewBox="0 0 24 24" className={iconClass} fill="currentColor">
      <path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm0 2v12h16V6H4zm4 3l3 3-3 3-1.5-1.5L8 12l-1.5-1.5L8 9zm5 5h4v2h-4v-2z" />
    </svg>
  );
};

// Agent badge styles
const AGENT_STYLES: Record<string, string> = {
  claude: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  codex: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  chatgpt: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  opencode: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  aider: "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

interface ProcessInfo {
  pid: number;
  tty: string;
  title: string | null;
  detectedAt: number;
}

interface AgentGroup {
  agent: string;
  processes: ProcessInfo[];
}

function PrefixHeaderActions({
  containerApi,
  group,
}: IDockviewHeaderActionsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isFocusing, setIsFocusing] = useState(false);
  const [agents, setAgents] = useState<AgentGroup[]>([]);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const projectName = getProjectNameFromGroup(group);
  const displayName = projectName ? projectName.split("/").pop() : null;

  // Fetch agents for this project
  useEffect(() => {
    if (!displayName) return;

    const fetchAgents = async () => {
      try {
        const response = await fetch("/api/processes");
        const data = await response.json();
        if (data.processes) {
          // Filter processes for this project and group by agent type
          const projectProcesses = data.processes.filter(
            (p: { project: string; alive: boolean }) =>
              p.project === displayName && p.alive
          );
          const agentMap = new Map<string, ProcessInfo[]>();
          for (const p of projectProcesses) {
            const existing = agentMap.get(p.agent) || [];
            existing.push({
              pid: p.pid,
              tty: p.tty,
              title: p.title,
              detectedAt: p.detectedAt,
            });
            agentMap.set(p.agent, existing);
          }
          setAgents(
            Array.from(agentMap.entries()).map(([agent, processes]) => ({
              agent,
              processes,
            }))
          );
        }
      } catch {
        // Ignore fetch errors
      }
    };

    fetchAgents();
    const interval = setInterval(fetchAgents, 3000); // Refresh every 3s
    return () => clearInterval(interval);
  }, [displayName]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setOpenDropdown(null);
    if (openDropdown) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [openDropdown]);

  // Check if this is a floating group - hide actions for floating panels
  const isFloating = group?.api?.location?.type === "floating";
  if (isFloating) return null;

  const handleShowGitDiff = async () => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      // Fetch git diff from API
      const response = await fetch("/api/git-diff");
      const data = await response.json();

      if (data.error) {
        console.error("[GitDiff] Error:", data.error);
        setIsLoading(false);
        return;
      }

      // Check if panel already exists
      const existingPanel = containerApi.getPanel("__git-diff__");
      if (existingPanel) {
        existingPanel.api.setActive();
        // Update the params with new diff data
        existingPanel.api.updateParameters({
          diffData: data.diff,
          files: data.files,
        });
        setIsLoading(false);
        return;
      }

      // Add git diff panel to this group
      containerApi.addPanel({
        id: "__git-diff__",
        component: "gitdiff",
        title: "Git Diff",
        params: {
          interactionId: "__git-diff__",
          sessionName: "",
          title: "Git Diff",
          diffData: data.diff,
          files: data.files,
        },
        position: { referenceGroup: group, direction: "within" },
      });
    } catch (err) {
      console.error("[GitDiff] Failed to fetch diff:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFocusPid = async (pid: number) => {
    if (isFocusing) return;
    setIsFocusing(true);
    setOpenDropdown(null);

    try {
      const focusResponse = await fetch("/api/focus-terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pid }),
      });
      const focusResult = await focusResponse.json();
      if (!focusResult.success) {
        console.error("[Focus] Failed:", focusResult.error);
      }
    } catch (err) {
      console.error("[Focus] Failed:", err);
    } finally {
      setIsFocusing(false);
    }
  };

  const formatTime = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex items-center gap-2">
      {displayName && (
        <span className="project-name-label px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded">
          {displayName}
        </span>
      )}
      {/* Clickable agent badges with dropdown */}
      {agents.map(({ agent, processes }) => (
        <div key={agent} className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpenDropdown(openDropdown === agent ? null : agent);
            }}
            disabled={isFocusing}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded border cursor-pointer hover:opacity-80 transition-opacity ${AGENT_STYLES[agent] || "bg-gray-500/20 text-gray-400 border-gray-500/30"} ${isFocusing ? "opacity-50" : ""}`}
            title={`${processes.length} ${agent} session${processes.length > 1 ? "s" : ""}`}
          >
            <AgentIcon agent={agent} className="w-3 h-3" />
            {processes.length > 1 && (
              <span className="opacity-70">×{processes.length}</span>
            )}
          </button>

          {/* Dropdown */}
          {openDropdown === agent && (
            <div
              className="absolute top-full left-0 mt-1 z-50 min-w-[180px] bg-popover border border-border rounded-md shadow-lg py-1"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-2 py-1 text-[10px] text-muted-foreground border-b border-border mb-1">
                {agent} sessions
              </div>
              {processes.map((proc) => (
                <button
                  key={proc.pid}
                  type="button"
                  onClick={() => handleFocusPid(proc.pid)}
                  className="w-full px-2 py-1.5 text-left text-xs hover:bg-accent"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-muted-foreground text-[10px]">
                      {proc.tty.replace("/dev/", "")}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatTime(proc.detectedAt)}
                    </span>
                  </div>
                  {proc.title && (
                    <div className="text-[11px] text-foreground truncate mt-0.5">
                      {proc.title}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        className="p-1.5 hover:bg-accent rounded"
        onClick={handleShowGitDiff}
        title="Show git diff"
        disabled={isLoading}
      >
        <GitCompare
          className={`h-3.5 w-3.5 ${isLoading ? "animate-pulse text-primary" : "text-muted-foreground"}`}
        />
      </button>
    </div>
  );
}

// Left header action - add tab button (AFTER tabs, next to last tab)
// Only shown for docked panels, not floating ones
function LeftHeaderActions({
  containerApi,
  group,
}: IDockviewHeaderActionsProps) {
  // Check if this is a floating group - hide actions for floating panels
  const isFloating = group?.api?.location?.type === "floating";
  if (isFloating) return null;

  const handleAddScratchpad = () => {
    const count = containerApi.panels.filter((p) =>
      p.id.includes("scratchpad")
    ).length;
    const id = `scratchpad-${count + 1}`;

    containerApi.addPanel({
      id,
      component: "scratchpad",
      title: `Scratchpad ${count + 1}`,
      params: {
        interactionId: id,
        sessionName: "",
        title: `Scratchpad ${count + 1}`,
        initialContent: "# Scratchpad\n\nType your notes here...",
      },
      position: { referenceGroup: group, direction: "within" },
    });
  };

  return (
    <button
      type="button"
      className="p-1.5 hover:bg-accent rounded"
      onClick={handleAddScratchpad}
      title="Add tab"
    >
      <Plus className="h-3.5 w-3.5 text-muted-foreground" />
    </button>
  );
}

// Right header action - maximize & popout buttons (far right)
// Only shown for docked panels, not floating ones
function RightHeaderActions({
  containerApi,
  group,
}: IDockviewHeaderActionsProps) {
  const [isMaximized, setIsMaximized] = useState(false);

  // Check if this is a floating group - hide actions for floating panels
  const isFloating = group?.api?.location?.type === "floating";

  // Track maximize state changes via containerApi
  useEffect(() => {
    if (!containerApi || !group) return;

    // Check initial state
    setIsMaximized(group.api.isMaximized());

    // Listen for maximize changes
    const disposable = containerApi.onDidMaximizedGroupChange(() => {
      setIsMaximized(group.api.isMaximized());
    });

    return () => disposable.dispose();
  }, [containerApi, group]);

  // Don't render anything for floating panels
  if (isFloating) return null;

  const handleMaximize = () => {
    if (group) {
      if (group.api.isMaximized()) {
        group.api.exitMaximized();
      } else {
        group.api.maximize();
      }
    }
  };

  const handlePopout = () => {
    // Use dockview's built-in popout functionality via containerApi
    if (containerApi && group) {
      containerApi.addPopoutGroup(group);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className="p-1.5 hover:bg-accent rounded"
        onClick={handleMaximize}
        title={isMaximized ? "Restore" : "Maximize"}
      >
        <Maximize2
          className={`h-3.5 w-3.5 ${isMaximized ? "text-primary" : "text-muted-foreground"}`}
        />
      </button>
      <button
        type="button"
        className="p-1.5 hover:bg-accent rounded"
        onClick={handlePopout}
        title="Pop out to new window"
      >
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}

// Width threshold for horizontal vs vertical layout
const HORIZONTAL_LAYOUT_THRESHOLD = 800;

interface AppProps {
  demoMode?: boolean;
  classTarget?: HTMLElement;
}

export default function App({ demoMode, classTarget }: AppProps) {
  const apiRef = useRef<DockviewApi | null>(null);
  const pendingProjectsRef = useRef<ProjectInteractions[] | null>(null);
  const syncedInteractionsRef = useRef<Map<string, InteractionInfo>>(new Map());
  const syncedTmuxWindowsRef = useRef<Set<string>>(new Set());
  const respondedInteractionsRef = useRef<Set<string>>(new Set());
  const projectGroupsRef = useRef<Map<string, DockviewGroupPanel>>(new Map());
  const panelCountRef = useRef(0);
  const isDemoMode = demoMode ?? urlDemoMode;

  // Auto dark mode based on system preference
  const [darkMode, setDarkMode] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setDarkMode(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // Apply dark mode class
  useEffect(() => {
    const target = classTarget ?? document.documentElement;
    target.classList.toggle("dark", darkMode);
    return () => {
      target.classList.remove("dark");
    };
  }, [classTarget, darkMode]);

  // Event log state
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  const [showEventLog, setShowEventLog] = useState(false);
  const eventLogRef = useRef<HTMLDivElement>(null);

  // Add event to log
  const addEventLog = useCallback(
    (type: EventLogEntry["type"], action: string, details: string) => {
      const entry: EventLogEntry = {
        id: ++eventLogCounter,
        timestamp: new Date(),
        type,
        action,
        details,
      };
      setEventLog((prev) => {
        const newLog = [entry, ...prev];
        return newLog.slice(0, MAX_EVENT_LOG_ENTRIES);
      });
    },
    []
  );

  // Clear event log
  const clearEventLog = useCallback(() => {
    setEventLog([]);
  }, []);

  // Handle responding to interactions
  const _handleRespond = useCallback(
    async (interactionId: string, _response: unknown) => {
      // Panel will be removed when server confirms
      const panel = apiRef.current?.getPanel(interactionId);
      if (panel) {
        panel.api.close();
      }
    },
    []
  );

  // Add a panel for an interaction
  const addInteractionPanel = useCallback(
    (
      interaction: Interaction,
      sessionName: string,
      projectName: string,
      projectCount: number
    ) => {
      const api = apiRef.current;
      if (!api) return;

      // Already synced?
      if (syncedInteractionsRef.current.has(interaction.id)) return;

      // Track this interaction
      syncedInteractionsRef.current.set(interaction.id, { sessionName });

      // Calculate cascade position for floating panels
      // Use larger offset to prevent overlap (panels are 400x300)
      const count = panelCountRef.current++;
      const x = 50 + ((count * 50) % 400);
      const y = 50 + ((count * 40) % 300);

      // Map component to panel type and build params
      let componentType = interaction.component || "card";
      const args = interaction.args || {};

      // Base params for all panels
      const baseParams = {
        interactionId: interaction.id,
        sessionName,
        title: interaction.title || interaction.component,
      };

      // Build component-specific params
      let params: Record<string, unknown>;

      switch (componentType) {
        case "confirm":
          params = { ...baseParams, prompt: interaction.prompt || "" };
          break;
        case "select":
        case "checklist":
          params = {
            ...baseParams,
            prompt: interaction.prompt || "",
            options: parseJsonData<unknown[]>(interaction.options, []),
          };
          break;
        case "ask": {
          // Server sends { schema: { questions: FormQuestion[] } }
          // AskPanel expects { questions: Question[] } with different format
          const schema = args.schema as
            | { questions?: FormQuestion[] }
            | undefined;

          const formQuestions = schema?.questions || [];
          const transformedQuestions = formQuestions.map((q) => {
            // Determine type based on options and multiSelect
            let type: "text" | "textarea" | "select" | "multiselect" = "text";
            if (q.options && q.options.length > 0) {
              type = q.multiSelect ? "multiselect" : "select";
            } else if (q.inputType === "textarea") {
              type = "textarea";
            }

            return {
              id: q.header,
              label: q.question,
              type,
              placeholder: q.placeholder,
              options: q.options?.map((opt) => ({
                label: opt.label,
                value: opt.label, // Use label as value since server doesn't have separate value
              })),
              required: false, // Not specified in server schema
            };
          });

          params = {
            ...baseParams,
            description: args.description || "",
            questions: transformedQuestions,
          };
          break;
        }
        case "card":
          params = {
            ...baseParams,
            content: args.content || "",
            actions: parseJsonData<unknown[]>(args.actions, []),
          };
          break;
        case "markdown":
          params = {
            ...baseParams,
            content: args.content || args.text || "",
          };
          break;
        case "scratchpad":
          params = {
            ...baseParams,
            initialContent: args.initialContent || args.content || "",
          };
          break;
        case "code":
          params = {
            ...baseParams,
            code: args.code || args.content || "",
            language: args.language || args.lang || "text",
            file: args.file || "",
            highlight: args.highlight || "",
          };
          break;
        case "table":
          params = {
            ...baseParams,
            headers: parseStringArray(args.headers),
            rows: parseJsonData<Record<string, unknown>[]>(
              args.rows || args.data,
              []
            ),
          };
          break;
        case "progress":
          params = {
            ...baseParams,
            steps: parseStringArray(args.steps),
            currentStep: Number(args.currentStep || args.step) || 0,
            percent: Number(args.percent || args.value) || 0,
          };
          break;
        case "diff":
          // Check if we have git diff files array vs simple content comparison
          if (args.files && Array.isArray(args.files)) {
            // Git diff mode - use gitdiff component
            componentType = "gitdiff";
            params = {
              ...baseParams,
              files: args.files,
            };
          } else {
            // Simple content comparison mode
            params = {
              ...baseParams,
              oldContent: args.oldContent || args.old || "",
              newContent: args.newContent || args.new || "",
              fileName: args.fileName || args.file || "",
              diffMode: args.diffMode || "split",
            };
          }
          break;
        case "json":
          params = {
            ...baseParams,
            data: parseJsonData<unknown>(args.data, args),
          };
          break;
        case "tree":
          params = {
            ...baseParams,
            data: parseJsonData<unknown[]>(args.data || args.nodes, []),
            selectable: args.selectable || false,
          };
          break;
        case "chart":
          params = {
            ...baseParams,
            chartType: args.type || args.chartType || "line",
            data: parseJsonData<unknown[]>(args.data, []),
            options: parseJsonData<Record<string, unknown>>(args.options, {}),
          };
          break;
        case "mermaid":
          params = {
            ...baseParams,
            code: args.code || args.diagram || "",
          };
          break;
        case "gauge":
          params = {
            ...baseParams,
            value: Number(args.value) || 0,
            min: Number(args.min) || 0,
            max: Number(args.max) || 100,
            label: args.label || "",
            thresholds: parseJsonData<unknown[]>(args.thresholds, []),
          };
          break;
        case "explorer":
          params = {
            ...baseParams,
            explorerName: args.name || args.explorerName || "",
            explorerConfig: args.config || args.explorerConfig,
            data: parseJsonData<Record<string, unknown>>(args.data, {}),
          };
          break;
        case "html":
          params = {
            ...baseParams,
            content: args.content || args.html || "",
            file: args.file || "",
          };
          break;
        case "plan-viewer":
          params = {
            ...baseParams,
            content: args.content || args.markdown || "",
            file: args.file || "",
          };
          break;
        default:
          params = {
            ...baseParams,
            content: JSON.stringify(args, null, 2),
            actions: [],
          };
      }

      const resolvedComponent =
        componentType in components ? componentType : "card";
      const isDocked = DOCKED_COMPONENTS.has(resolvedComponent);

      if (isDocked) {
        // Docked panel - get or create project's group
        let projectGroup = projectGroupsRef.current.get(projectName);

        if (projectGroup) {
          // Verify the group still exists
          const foundGroup = api.groups.find((g) => g.id === projectGroup?.id);
          if (!foundGroup) {
            projectGroupsRef.current.delete(projectName);
            projectGroup = undefined;
          }
        }

        if (projectGroup) {
          // Add to existing group
          api.addPanel({
            id: interaction.id,
            component: resolvedComponent,
            tabComponent:
              resolvedComponent in tabComponents
                ? resolvedComponent
                : undefined,
            title: params.title as string,
            params,
            position: { referenceGroup: projectGroup, direction: "within" },
          });
        } else {
          // Create new group by adding the first panel
          const isHorizontal = window.innerWidth >= HORIZONTAL_LAYOUT_THRESHOLD;
          const existingPanels = api.panels;
          const lastDockedPanel = existingPanels.find(
            (p) => !p.group.api.location.type.includes("floating")
          );

          api.addPanel({
            id: interaction.id,
            component: resolvedComponent,
            tabComponent:
              resolvedComponent in tabComponents
                ? resolvedComponent
                : undefined,
            title: params.title as string,
            params,
            // When no existing docked panel, use direction only to create first grid cell
            // When existing docked panel, position relative to it
            position: lastDockedPanel
              ? {
                  referencePanel: lastDockedPanel.id,
                  direction: isHorizontal ? "right" : "below",
                }
              : { direction: isHorizontal ? "right" : "below" },
          });

          // Register the newly created group
          const newPanel = api.getPanel(interaction.id);
          if (newPanel) {
            const group = newPanel.group as DockviewGroupPanel;
            projectGroupsRef.current.set(projectName, group);
            groupToProjectMap.set(group.id, projectName);
          }
        }
      } else {
        // Floating panel - for quick interactions
        // Add project name prefix when there are multiple projects
        let floatingTitle = params.title as string;
        const hasMultipleProjects = projectCount > 1;
        if (hasMultipleProjects) {
          const shortName = projectName.split("/").pop() || projectName;
          floatingTitle = `[${shortName}] ${floatingTitle}`;
        }

        // Create a new floating panel for each interaction
        api.addPanel({
          id: interaction.id,
          component: resolvedComponent,
          tabComponent:
            resolvedComponent in tabComponents ? resolvedComponent : undefined,
          title: floatingTitle,
          floating: {
            x,
            y,
            width: 400,
            height: 300,
          },
          params,
        });
      }
    },
    []
  );

  // Handle WebSocket updates
  const handleUpdate = useCallback(
    (projectsData: ProjectInteractions[]) => {
      const api = apiRef.current;
      if (!api) {
        pendingProjectsRef.current = projectsData;
        return;
      }

      const currentInteractionIds = new Set<string>();
      const activeProjects = new Set<string>();

      // Track multiple projects for floating panel prefixes
      const projectCount = projectsData.length;

      // Track current tmux windows
      const currentTmuxWindowIds = new Set<string>();

      // Process each project's interactions and tmux windows
      for (const project of projectsData) {
        activeProjects.add(project.project);

        for (const interaction of project.interactions) {
          currentInteractionIds.add(interaction.id);
          addInteractionPanel(
            interaction,
            project.sessionName,
            project.project,
            projectCount
          );
        }

        // Add tmux window panels
        if (project.tmuxWindows && project.tmuxSession) {
          for (const tmuxWindow of project.tmuxWindows) {
            const tmuxPanelId = `tmux-${project.tmuxSession}-${tmuxWindow.index}`;
            currentTmuxWindowIds.add(tmuxPanelId);

            // Skip if already synced
            if (syncedTmuxWindowsRef.current.has(tmuxPanelId)) continue;

            // Get existing group for this project if available
            const projectGroup = projectGroupsRef.current.get(project.project);

            if (projectGroup) {
              // Add to existing group
              api.addPanel({
                id: tmuxPanelId,
                component: "tmux",
                title: tmuxWindow.name || `tmux:${tmuxWindow.index}`,
                params: {
                  tmuxSession: project.tmuxSession,
                  windowIndex: tmuxWindow.index,
                  windowName: tmuxWindow.name,
                  command: tmuxWindow.command,
                },
                position: { referenceGroup: projectGroup, direction: "within" },
              });
            } else {
              // Create new group by adding panel without position
              const panel = api.addPanel({
                id: tmuxPanelId,
                component: "tmux",
                title: tmuxWindow.name || `tmux:${tmuxWindow.index}`,
                params: {
                  tmuxSession: project.tmuxSession,
                  windowIndex: tmuxWindow.index,
                  windowName: tmuxWindow.name,
                  command: tmuxWindow.command,
                },
              });
              // Track the group created by this panel
              if (panel.group) {
                projectGroupsRef.current.set(project.project, panel.group);
              }
            }

            syncedTmuxWindowsRef.current.add(tmuxPanelId);
          }
        }
      }

      // Remove panels for resolved interactions
      for (const [id] of syncedInteractionsRef.current) {
        if (!currentInteractionIds.has(id)) {
          const panel = api.getPanel(id);
          if (panel) {
            panel.api.close();
            // Don't delete from respondedInteractionsRef here - let onDidRemovePanel handle cleanup
            // This ensures the check in onDidRemovePanel works correctly
          }
          syncedInteractionsRef.current.delete(id);
        }
      }

      // Remove panels for closed tmux windows
      for (const id of syncedTmuxWindowsRef.current) {
        if (!currentTmuxWindowIds.has(id)) {
          const panel = api.getPanel(id);
          if (panel) {
            panel.api.close();
          }
          syncedTmuxWindowsRef.current.delete(id);
        }
      }

      // Clean up groups for projects that are no longer active
      for (const [projectName, group] of projectGroupsRef.current) {
        if (!activeProjects.has(projectName)) {
          // Only remove if group has no panels
          const groupPanels = group.panels || [];
          if (groupPanels.length === 0) {
            api.removeGroup(group);
            projectGroupsRef.current.delete(projectName);
          }
        }
      }
    },
    [addInteractionPanel]
  );

  // Handle focus requests
  const handleFocus = useCallback(
    (interactionId: string, _projectName: string) => {
      const panel = apiRef.current?.getPanel(interactionId);
      if (panel) {
        panel.api.setActive();
      }
    },
    []
  );

  // Initialize WebSocket with event logging
  const { projects, connected, connecting, retryIn, respond, sendMessage } =
    useWebSocket({
      demoMode: isDemoMode,
      onUpdate: handleUpdate,
      onFocus: handleFocus,
      onConnect: () =>
        addEventLog("ws", "Connected", "WebSocket connected to server"),
      onDisconnect: () =>
        addEventLog("ws", "Disconnected", "WebSocket connection lost"),
    });

  // Demo mode: apply projects once Dockview is ready.
  useEffect(() => {
    if (!isDemoMode || projects.length === 0) {
      return;
    }

    if (!apiRef.current) {
      pendingProjectsRef.current = projects;
      return;
    }

    handleUpdate(projects);
  }, [projects, handleUpdate]);

  // Track if we have any panels (excluding scratchpads)
  const [hasPanels, setHasPanels] = useState(false);

  // Make respond available globally for panels (with tracking)
  useEffect(() => {
    const wrappedRespond = (
      interactionId: string,
      sessionName: string,
      response: unknown
    ) => {
      // Track that this interaction has been responded to
      respondedInteractionsRef.current.add(interactionId);
      respond(interactionId, sessionName, response);
    };
    (window as unknown as { awbRespond: typeof respond }).awbRespond =
      wrappedRespond;
    (
      window as unknown as { awbSendMessage: typeof sendMessage }
    ).awbSendMessage = sendMessage;
  }, [respond, sendMessage]);

  // Ref for respond function (to use in onReady callback)
  const respondRef = useRef<typeof respond | null>(null);

  // Update respond ref when it changes
  useEffect(() => {
    respondRef.current = respond;
  }, [respond]);

  // Helper to check if there are real panels (non-scratchpad)
  const updateHasPanels = useCallback((api: DockviewApi) => {
    const realPanels = api.panels.filter(
      (p) => !p.id.includes("scratchpad") && p.id !== "__git-diff__"
    );
    setHasPanels(realPanels.length > 0);
  }, []);

  // Ref for addEventLog to use in onReady without re-triggering
  const addEventLogRef = useRef(addEventLog);
  useEffect(() => {
    addEventLogRef.current = addEventLog;
  }, [addEventLog]);

  // Listen for postMessage from parent for tab switching (landing page scroll interaction)
  useEffect(() => {
    if (!isDemoMode) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "awb-switch-tab" && event.data?.tabId) {
        const api = apiRef.current;
        if (api) {
          const panel = api.getPanel(event.data.tabId);
          if (panel) {
            panel.api.setActive();
          }
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [isDemoMode]);

  // Dockview ready handler
  const onReady = useCallback(
    (event: { api: DockviewApi }) => {
      apiRef.current = event.api;
      if (event.api.panels.length === 0) {
        syncedInteractionsRef.current.clear();
        projectGroupsRef.current.clear();
        groupToProjectMap.clear();
        panelCountRef.current = 0;
      }
      const pending = pendingProjectsRef.current;
      pendingProjectsRef.current = null;
      if (pending) {
        handleUpdate(pending);
      } else if (projects.length > 0) {
        handleUpdate(projects);
      }

      // Handle panel add - track real panels and log
      event.api.onDidAddPanel((e) => {
        updateHasPanels(event.api);
        if (!e.id.includes("scratchpad")) {
          addEventLogRef.current("panel", "Added", e.id);
        }
      });

      // Handle panel activation
      event.api.onDidActivePanelChange((e) => {
        if (e?.id && !e.id.includes("scratchpad")) {
          addEventLogRef.current("panel", "Activated", e.id);
        }
      });

      // Handle panel close (e.g., when user clicks X on docked panel tab)
      event.api.onDidRemovePanel((e) => {
        const panelId = e.id;
        updateHasPanels(event.api);
        if (!panelId.includes("scratchpad")) {
          addEventLogRef.current("panel", "Removed", panelId);
        }
        if (panelId.includes("scratchpad")) return; // Ignore scratchpads for dismiss

        // Check if this interaction already has a response (e.g., user submitted form)
        if (respondedInteractionsRef.current.has(panelId)) {
          // Already responded, just clean up without sending duplicate dismiss
          syncedInteractionsRef.current.delete(panelId);
          respondedInteractionsRef.current.delete(panelId);
          return;
        }

        const info = syncedInteractionsRef.current.get(panelId);
        if (info && respondRef.current) {
          // Send dismiss response for docked panels closed via dockview's X button
          respondRef.current(panelId, info.sessionName, { action: "dismiss" });
          syncedInteractionsRef.current.delete(panelId);
        }
      });

      // Handle group add
      event.api.onDidAddGroup((e) => {
        addEventLogRef.current("group", "Added", e.id);
      });

      // Handle group removal - clean up project references
      event.api.onDidRemoveGroup((e) => {
        const groupId = e.id;
        addEventLogRef.current("group", "Removed", groupId);
        // Clean up groupToProjectMap
        const projectName = groupToProjectMap.get(groupId);
        if (projectName) {
          projectGroupsRef.current.delete(projectName);
          groupToProjectMap.delete(groupId);
        }
      });
    },
    [handleUpdate, projects, updateHasPanels]
  );

  return (
    <div className="w-full h-full flex flex-col">
      {/* Dockview container - takes full height, groups show project names in prefix header */}
      <div className="flex-1 relative">
        <DockviewReact
          className={darkMode ? "dockview-theme-dark" : "dockview-theme-light"}
          components={
            components as Record<
              string,
              React.FunctionComponent<IDockviewPanelProps>
            >
          }
          tabComponents={
            tabComponents as Record<
              string,
              React.FunctionComponent<IDockviewPanelHeaderProps>
            >
          }
          onReady={onReady}
          floatingGroupBounds="boundedWithinViewport"
          prefixHeaderActionsComponent={PrefixHeaderActions}
          leftHeaderActionsComponent={LeftHeaderActions}
          rightHeaderActionsComponent={RightHeaderActions}
        />

        {/* Connection status floating pane - hidden in demo mode */}
        {!isDemoMode && connecting && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50">
            <div className="bg-card border rounded-lg shadow-lg p-6 max-w-md text-center">
              <Loader2 className="h-12 w-12 mx-auto mb-4 text-primary animate-spin" />
              <h2 className="text-lg font-semibold mb-2">Connecting</h2>
              <p className="text-sm text-muted-foreground">
                Connecting to Agent Workbench server...
              </p>
            </div>
          </div>
        )}

        {/* Disconnection floating pane - only show after we've tried connecting, hidden in demo mode */}
        {!isDemoMode && !connected && !connecting && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50">
            <div className="bg-card border rounded-lg shadow-lg p-6 max-w-md text-center">
              <WifiOff className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold mb-2">Connection Lost</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Unable to connect to the Agent Workbench server.
              </p>
              <div className="text-sm text-muted-foreground mb-4">
                {retryIn > 0 ? (
                  <span>
                    Retrying in{" "}
                    <span className="font-mono font-medium text-foreground">
                      {retryIn}s
                    </span>
                    ...
                  </span>
                ) : (
                  <span className="animate-pulse">Connecting...</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground border-t pt-4 mt-4">
                <p className="font-medium mb-2">
                  Make sure the server is running:
                </p>
                <code className="bg-muted px-2 py-1 rounded text-xs">
                  awb ui
                </code>
              </div>
            </div>
          </div>
        )}

        {/* Welcome dialog when connected but no interactions - hidden in demo mode */}
        {!isDemoMode && connected && !hasPanels && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50">
            <div className="bg-card border rounded-lg shadow-lg p-6 max-w-lg">
              <div className="text-center mb-6">
                <Terminal className="h-12 w-12 mx-auto mb-4 text-primary" />
                <h2 className="text-xl font-semibold mb-2">
                  Agent Workbench Playground
                </h2>
                <p className="text-sm text-muted-foreground">
                  Your async agent inbox. Interactions from your agents will
                  appear here.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                  <MessageSquare className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">Ask Claude questions</p>
                    <p className="text-xs text-muted-foreground">
                      Questions from Claude Code appear here for your input
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                  <Play className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">
                      Run background processes
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Use <code className="bg-muted px-1 rounded">awb run</code>{" "}
                      to show progress, confirmations, and more
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                  <GitCompare className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">Review diffs and code</p>
                    <p className="text-xs text-muted-foreground">
                      Code blocks, diffs, and tables appear as docked tabs
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t text-center">
                <p className="text-xs text-muted-foreground">
                  Run <code className="bg-muted px-1 rounded">awb --help</code>{" "}
                  to see all available components
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Event Log Toggle Button - bottom right, hidden in demo mode */}
        {!isDemoMode && (
          <button
            type="button"
            onClick={() => setShowEventLog(!showEventLog)}
            className={`absolute bottom-4 right-4 z-40 flex items-center gap-1 p-2 rounded-lg border shadow-lg transition-all ${
              showEventLog
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border hover:bg-accent"
            }`}
            title={showEventLog ? "Hide Events Log" : "Show Events Log"}
          >
            <ScrollText className="h-4 w-4" />
            {eventLog.length > 0 && !showEventLog && (
              <span className="px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded-full min-w-[20px] text-center">
                {eventLog.length}
              </span>
            )}
          </button>
        )}

        {/* Event Log Panel - slides in from right, hidden in demo mode */}
        {!isDemoMode && (
          <div
            className={`absolute top-0 right-0 bottom-0 w-80 bg-card border-l shadow-xl z-30 transition-transform duration-300 flex flex-col ${
              showEventLog ? "translate-x-0" : "translate-x-full"
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/50">
              <div className="flex items-center gap-2">
                <ScrollText className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Events Log</span>
                <span className="text-xs text-muted-foreground">
                  ({eventLog.length})
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={clearEventLog}
                  className="p-1.5 hover:bg-accent rounded"
                  title="Clear log"
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowEventLog(false)}
                  className="p-1.5 hover:bg-accent rounded"
                  title="Close"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Event List */}
            <div ref={eventLogRef} className="flex-1 overflow-y-auto">
              {eventLog.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No events yet. Interact with panels to see events.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {eventLog.map((entry) => (
                    <div
                      key={entry.id}
                      className="px-3 py-2 hover:bg-muted/50 text-xs"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-muted-foreground font-mono">
                          {entry.timestamp.toLocaleTimeString("en-US", {
                            hour12: false,
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                            fractionalSecondDigits: 3,
                          })}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
                            entry.type === "ws"
                              ? "bg-blue-500/20 text-blue-500"
                              : entry.type === "panel"
                                ? "bg-green-500/20 text-green-500"
                                : entry.type === "group"
                                  ? "bg-purple-500/20 text-purple-500"
                                  : "bg-orange-500/20 text-orange-500"
                          }`}
                        >
                          {entry.type}
                        </span>
                        <span className="font-medium">{entry.action}</span>
                      </div>
                      <div
                        className="text-muted-foreground truncate pl-[72px]"
                        title={entry.details}
                      >
                        {entry.details}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
