import { Button } from "@/components/ui/button";
import { DiffModeEnum, DiffView } from "@git-diff-view/react";
import type { IDockviewPanelProps } from "dockview";
// CSS is imported in globals.css with proper layer isolation
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  FileCode,
  GitCompare,
  Minus,
  Plus,
  RefreshCw,
  Rows,
  SplitSquareHorizontal,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface GitDiffFile {
  fileName: string;
  fullDiff: string;
  additions?: number;
  deletions?: number;
}

export interface GitDiffPanelParams {
  interactionId: string;
  sessionName: string;
  title: string;
  files: GitDiffFile[];
}

// Helper functions outside component to avoid recreation
const getShortFileName = (fileName: string): string =>
  fileName.split("/").pop() || fileName;

const LANG_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  css: "css",
  scss: "scss",
  html: "html",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
};

const getLanguageFromFileName = (fileName: string): string =>
  LANG_MAP[fileName.split(".").pop()?.toLowerCase() || ""] || "text";

export default function GitDiffPanel({
  params,
}: IDockviewPanelProps<GitDiffPanelParams>) {
  const { title, files: initialFiles } = params;
  const [files, setFiles] = useState<GitDiffFile[]>(initialFiles || []);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<DiffModeEnum>(DiffModeEnum.Split);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<number>>(
    () =>
      new Set(Array.from({ length: initialFiles?.length || 0 }, (_, i) => i))
  );
  const fileRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  // Update when params change
  useEffect(() => {
    if (params.files) {
      setFiles(params.files);
      setCollapsedFiles(new Set(params.files.map((_, i) => i)));
    }
  }, [params.files]);

  // Memoized calculations
  const { totalAdditions, totalDeletions } = useMemo(
    () => ({
      totalAdditions: files.reduce((sum, f) => sum + (f.additions || 0), 0),
      totalDeletions: files.reduce((sum, f) => sum + (f.deletions || 0), 0),
    }),
    [files]
  );

  const isDarkMode = useMemo(
    () => document.documentElement.classList.contains("dark"),
    []
  );

  // Memoized callbacks
  const handleRefresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/git-diff");
      // Check if response is JSON before parsing
      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        console.warn("[GitDiff] Refresh API not available");
        return;
      }
      const data = await response.json();
      if (!data.error) setFiles(data.files);
    } catch (err) {
      console.warn("[GitDiff] Refresh not available:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const toggleViewMode = useCallback(() => {
    setViewMode((m) =>
      m === DiffModeEnum.Split ? DiffModeEnum.Unified : DiffModeEnum.Split
    );
  }, []);

  const toggleFileCollapse = useCallback((index: number) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  }, []);

  const scrollToFile = useCallback((index: number) => {
    fileRefs.current
      .get(index)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => setCollapsedFiles(new Set()), []);
  const collapseAll = useCallback(
    () => setCollapsedFiles(new Set(files.map((_, i) => i))),
    [files]
  );

  const allExpanded = collapsedFiles.size === 0;

  if (files.length === 0) {
    return (
      <div className="w-full h-full flex flex-col bg-background">
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
          <GitCompare className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium flex-1">{title}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <GitCompare className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-sm">No changes detected</p>
            <p className="text-xs mt-1">Make some changes and click refresh</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
        <GitCompare className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">
          {files.length} file{files.length !== 1 ? "s" : ""} changed
        </span>
        {totalAdditions > 0 && (
          <span className="text-xs text-green-600 flex items-center gap-0.5">
            <Plus className="h-3 w-3" />
            {totalAdditions}
          </span>
        )}
        {totalDeletions > 0 && (
          <span className="text-xs text-red-600 flex items-center gap-0.5">
            <Minus className="h-3 w-3" />
            {totalDeletions}
          </span>
        )}
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={allExpanded ? collapseAll : expandAll}
          title={allExpanded ? "Collapse all" : "Expand all"}
        >
          {allExpanded ? (
            <ChevronsDownUp className="h-4 w-4" />
          ) : (
            <ChevronsUpDown className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={toggleViewMode}
          title={
            viewMode === DiffModeEnum.Split
              ? "Switch to unified"
              : "Switch to split"
          }
        >
          {viewMode === DiffModeEnum.Split ? (
            <Rows className="h-4 w-4" />
          ) : (
            <SplitSquareHorizontal className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={handleRefresh}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* File sidebar */}
        <div className="w-60 border-r bg-muted/20 overflow-y-auto flex-shrink-0">
          <div className="p-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 px-2">
              Changed Files
            </div>
            {files.map((file, i) => (
              <button
                type="button"
                key={i}
                onClick={() => scrollToFile(i)}
                className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted/50 flex items-center gap-1.5"
              >
                <FileCode className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <span className="truncate flex-1" title={file.fileName}>
                  {getShortFileName(file.fileName)}
                </span>
                <span className="flex items-center gap-1 opacity-70">
                  {(file.additions ?? 0) > 0 && (
                    <span className="text-green-600 text-[10px]">
                      +{file.additions}
                    </span>
                  )}
                  {(file.deletions ?? 0) > 0 && (
                    <span className="text-red-600 text-[10px]">
                      -{file.deletions}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Diff content */}
        <div ref={containerRef} className="flex-1 overflow-auto">
          {files.map((file, i) => (
            <div
              key={i}
              ref={(el) => el && fileRefs.current.set(i, el)}
              className="border-b last:border-b-0"
            >
              <button
                type="button"
                onClick={() => toggleFileCollapse(i)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-muted/40 hover:bg-muted/60 text-left sticky top-0 z-10"
              >
                {collapsedFiles.has(i) ? (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
                <FileCode className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-mono flex-1 truncate">
                  {file.fileName}
                </span>
                <span className="flex items-center gap-2 text-xs">
                  {(file.additions ?? 0) > 0 && (
                    <span className="text-green-600 flex items-center gap-0.5">
                      <Plus className="h-3 w-3" />
                      {file.additions}
                    </span>
                  )}
                  {(file.deletions ?? 0) > 0 && (
                    <span className="text-red-600 flex items-center gap-0.5">
                      <Minus className="h-3 w-3" />
                      {file.deletions}
                    </span>
                  )}
                </span>
              </button>
              {!collapsedFiles.has(i) && (
                <DiffView
                  data={{
                    oldFile: {
                      fileName: file.fileName,
                      fileLang: getLanguageFromFileName(file.fileName),
                    },
                    newFile: {
                      fileName: file.fileName,
                      fileLang: getLanguageFromFileName(file.fileName),
                    },
                    hunks: file.fullDiff ? [file.fullDiff] : [],
                  }}
                  diffViewMode={viewMode}
                  diffViewTheme={isDarkMode ? "dark" : "light"}
                  diffViewHighlight
                  diffViewWrap
                  diffViewFontSize={12}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
