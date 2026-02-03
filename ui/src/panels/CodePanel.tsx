import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { copyToClipboard } from "@/lib/clipboard";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { sql } from "@codemirror/lang-sql";
import { syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { classHighlighter } from "@lezer/highlight";
import { EditorView, basicSetup } from "codemirror";
import type { IDockviewPanelProps } from "dockview";
import { AlertTriangle, Check, Code, Copy, FileCode, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// Create a dark theme that matches our design system
const darkTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      fontSize: "13px",
      backgroundColor: "hsl(20 14.3% 4.1%)", // --background dark
      color: "hsl(60 9.1% 97.8%)", // --foreground dark
    },
    ".cm-scroller": {
      overflow: "auto",
      height: "100%",
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    },
    ".cm-gutters": {
      backgroundColor: "hsl(12 6.5% 10%)", // --cm-gutter-background dark
      color: "hsl(24 5.4% 50%)", // --cm-gutter-foreground dark
      border: "none",
      borderRight: "1px solid hsl(12 6.5% 15.1%)", // --border dark
    },
    ".cm-activeLineGutter": {
      backgroundColor: "hsl(12 6.5% 12%)", // --cm-line-highlight dark
    },
    ".cm-activeLine": {
      backgroundColor: "hsl(12 6.5% 12%)", // --cm-line-highlight dark
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection":
      {
        backgroundColor: "hsl(12 6.5% 20%)", // --cm-selection dark
      },
    ".cm-cursor": {
      borderLeftColor: "hsl(60 9.1% 97.8%)", // --cm-cursor dark
    },
    ".cm-foldGutter": {
      color: "hsl(24 5.4% 50%)",
    },
  },
  { dark: true }
);

export interface CodePanelParams {
  interactionId: string;
  sessionName: string;
  title: string;
  code: string;
  language: string;
  file?: string;
  highlight?: string;
}

// Map language strings to CodeMirror language extensions
function getLanguageExtension(language: string) {
  const lang = language.toLowerCase();
  if (["js", "javascript", "jsx"].includes(lang))
    return javascript({ jsx: true });
  if (["ts", "typescript", "tsx"].includes(lang))
    return javascript({ jsx: true, typescript: true });
  if (["py", "python"].includes(lang)) return python();
  if (lang === "json") return json();
  if (["html", "htm"].includes(lang)) return html();
  if (lang === "css") return css();
  if (["md", "markdown"].includes(lang)) return markdown();
  if (["rs", "rust"].includes(lang)) return rust();
  if (lang === "sql") return sql();
  return []; // No syntax highlighting for unknown languages
}

export default function CodePanel({
  params,
}: IDockviewPanelProps<CodePanelParams>) {
  const { interactionId, sessionName, title, code, language, file } = params;
  const [copyState, setCopyState] = useState<"idle" | "success" | "error">(
    "idle"
  );
  // Reserved for future inline editing feature
  const [_isEditing, _setIsEditing] = useState(false);
  const [_saveState, _setSaveState] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

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

  const handleCopy = async () => {
    const success = await copyToClipboard(code);
    setCopyState(success ? "success" : "error");
    setTimeout(() => setCopyState("idle"), 2000);
  };

  // Initialize CodeMirror
  useEffect(() => {
    if (!editorRef.current) return;

    // Destroy existing editor if any
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    const state = EditorState.create({
      doc: code,
      extensions: [
        basicSetup,
        EditorState.readOnly.of(true),
        getLanguageExtension(language),
        // Use classHighlighter to generate .tok-* classes for CSS-based syntax highlighting
        syntaxHighlighting(classHighlighter),
        // Apply our dark theme (overrides basicSetup's default light theme)
        darkTheme,
      ],
    });

    viewRef.current = new EditorView({
      state,
      parent: editorRef.current,
    });

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [code, language]);

  // Extract filename from path
  const _fileName = file ? file.split("/").pop() : null;

  return (
    <Card className="w-full h-full border-0 rounded-none shadow-none flex flex-col">
      <CardHeader className="panel-header pb-2">
        <div className="flex items-center gap-2">
          <Code className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-sm flex-1">{title}</CardTitle>
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {language}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={handleCopy}
            title={copyState === "error" ? "Copy failed" : "Copy"}
          >
            {copyState === "success" ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : copyState === "error" ? (
              <AlertTriangle className="h-4 w-4 text-red-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
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
      {/* File info bar - visible even when panel-header is hidden */}
      {file && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/30 flex-shrink-0">
          <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
          <span
            className="text-xs text-muted-foreground truncate flex-1"
            title={file}
          >
            {file}
          </span>
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {language}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            onClick={handleCopy}
            title={copyState === "error" ? "Copy failed" : "Copy code"}
          >
            {copyState === "success" ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : copyState === "error" ? (
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      )}
      <CardContent className="p-0 flex-1 overflow-hidden">
        <div ref={editorRef} className="h-full" />
      </CardContent>
    </Card>
  );
}
