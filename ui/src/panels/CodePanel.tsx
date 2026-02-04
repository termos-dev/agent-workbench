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
import {
  AlertTriangle,
  Check,
  Code,
  Copy,
  ExternalLink,
  FileCode,
  Pencil,
  Save,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

// Helper to get CSS variable as hsl color string
const getCssVar = (name: string): string => {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value ? `hsl(${value})` : "";
};

// Create theme from CSS variables at runtime
const createThemeFromCssVars = () =>
  EditorView.theme(
    {
      "&": {
        height: "100%",
        fontSize: "13px",
        backgroundColor: getCssVar("--cm-background"),
        color: getCssVar("--cm-foreground"),
      },
      ".cm-scroller": {
        overflow: "auto",
        height: "100%",
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      },
      ".cm-gutters": {
        backgroundColor: getCssVar("--cm-gutter-background"),
        color: getCssVar("--cm-gutter-foreground"),
        border: "none",
        borderRight: `1px solid ${getCssVar("--border")}`,
      },
      ".cm-activeLineGutter": {
        backgroundColor: getCssVar("--cm-line-highlight"),
      },
      ".cm-activeLine": {
        backgroundColor: getCssVar("--cm-line-highlight"),
      },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection":
        {
          backgroundColor: getCssVar("--cm-selection"),
        },
      ".cm-cursor": {
        borderLeftColor: getCssVar("--cm-cursor"),
      },
      ".cm-foldGutter": {
        color: getCssVar("--cm-gutter-foreground"),
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
  const [isEditing, setIsEditing] = useState(false);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const [editedCode, setEditedCode] = useState(code);
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
    const success = await copyToClipboard(isEditing ? editedCode : code);
    setCopyState(success ? "success" : "error");
    setTimeout(() => setCopyState("idle"), 2000);
  };

  const handleOpenInEditor = () => {
    if (!file) return;
    const sendMessage = (
      window as unknown as {
        awbSendMessage?: (message: unknown) => void;
      }
    ).awbSendMessage;
    if (sendMessage) {
      sendMessage({ type: "open-in-editor", path: file });
    }
  };

  const handleSave = () => {
    if (!file || !isEditing) return;
    setSaveState("saving");
    const sendMessage = (
      window as unknown as {
        awbSendMessage?: (message: unknown) => void;
      }
    ).awbSendMessage;
    if (sendMessage) {
      sendMessage({
        type: "write-file",
        path: file,
        content: editedCode,
      });
    }
  };

  // Listen for file write responses
  useEffect(() => {
    if (saveState !== "saving") return;

    const handler = (event: MessageEvent) => {
      try {
        const data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (
          (data.type === "file-saved" || data.type === "file-written") &&
          data.path === file
        ) {
          setSaveState(data.success ? "success" : "error");
          setTimeout(() => setSaveState("idle"), 2000);
          if (data.success) {
            setIsEditing(false);
          }
        }
      } catch {
        // Ignore non-JSON messages
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [saveState, file]);

  const toggleEdit = () => {
    if (isEditing) {
      // Cancel editing, revert to original
      setEditedCode(code);
      setIsEditing(false);
    } else {
      setIsEditing(true);
    }
  };

  // Initialize CodeMirror
  useEffect(() => {
    if (!editorRef.current) return;

    // Destroy existing editor if any
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    const extensions = [
      basicSetup,
      EditorState.readOnly.of(!isEditing),
      getLanguageExtension(language),
      syntaxHighlighting(classHighlighter),
      createThemeFromCssVars(),
    ];

    // Add update listener when editing to track changes
    if (isEditing) {
      extensions.push(
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            setEditedCode(update.state.doc.toString());
          }
        })
      );
    }

    const state = EditorState.create({
      doc: isEditing ? editedCode : code,
      extensions,
    });

    viewRef.current = new EditorView({
      state,
      parent: editorRef.current,
    });

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [code, language, isEditing]);

  return (
    <Card className="w-full h-full border-0 rounded-none shadow-none flex flex-col bg-background">
      <CardHeader className="panel-header py-2 px-3 flex-shrink-0 bg-background">
        <div className="flex items-center gap-2 ml-2">
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
        <div className="flex items-center gap-2 px-3 py-1.5 bg-background flex-shrink-0">
          <FileCode className="h-3.5 w-3.5 text-muted-foreground ml-2" />
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
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            onClick={toggleEdit}
            title={isEditing ? "Cancel editing" : "Edit in place"}
          >
            {isEditing ? (
              <X className="h-3.5 w-3.5" />
            ) : (
              <Pencil className="h-3.5 w-3.5" />
            )}
          </Button>
          {isEditing && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              onClick={handleSave}
              disabled={saveState === "saving"}
              title={
                saveState === "saving"
                  ? "Saving..."
                  : saveState === "error"
                    ? "Save failed"
                    : "Save changes"
              }
            >
              {saveState === "success" ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : saveState === "error" ? (
                <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            onClick={handleOpenInEditor}
            title="Open in VS Code"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      <CardContent className="p-0 flex-1 overflow-hidden">
        <div ref={editorRef} className="h-full" />
      </CardContent>
    </Card>
  );
}
