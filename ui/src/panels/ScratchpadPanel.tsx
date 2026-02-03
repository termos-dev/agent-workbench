import { Card, CardContent } from "@/components/ui/card";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { tags } from "@lezer/highlight";
import { EditorView, basicSetup } from "codemirror";
import type { IDockviewPanelProps } from "dockview";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Custom theme that matches the app's CSS variables
const customTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "hsl(var(--card))",
      color: "hsl(var(--foreground))",
    },
    ".cm-content": {
      caretColor: "hsl(var(--foreground))",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "hsl(var(--foreground))",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      {
        backgroundColor: "hsl(var(--muted))",
      },
    ".cm-gutters": {
      backgroundColor: "hsl(var(--card))",
      color: "hsl(var(--muted-foreground))",
      border: "none",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "hsl(var(--muted))",
    },
    ".cm-activeLine": {
      backgroundColor: "hsl(var(--muted) / 0.5)",
    },
  },
  { dark: true }
);

// Syntax highlighting that matches the app
const customHighlighting = HighlightStyle.define([
  {
    tag: tags.heading1,
    color: "hsl(var(--foreground))",
    fontWeight: "bold",
    fontSize: "1.5em",
  },
  {
    tag: tags.heading2,
    color: "hsl(var(--foreground))",
    fontWeight: "bold",
    fontSize: "1.3em",
  },
  {
    tag: tags.heading3,
    color: "hsl(var(--foreground))",
    fontWeight: "bold",
    fontSize: "1.1em",
  },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.link, color: "hsl(var(--primary))", textDecoration: "underline" },
  { tag: tags.url, color: "hsl(var(--muted-foreground))" },
  {
    tag: tags.monospace,
    color: "hsl(var(--foreground))",
    backgroundColor: "hsl(var(--muted))",
  },
  { tag: tags.processingInstruction, color: "hsl(var(--muted-foreground))" }, // For # and ## markers
  { tag: tags.punctuation, color: "hsl(var(--muted-foreground))" },
  { tag: tags.list, color: "hsl(var(--muted-foreground))" },
]);

interface ScratchpadParams {
  interactionId?: string;
  sessionName?: string;
  title?: string;
  initialContent?: string;
}

export default function ScratchpadPanel({
  params,
}: IDockviewPanelProps<ScratchpadParams>) {
  const [content, setContent] = useState(
    params.initialContent || "# Scratchpad\n\nType your notes here..."
  );
  const [isFocused, setIsFocused] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Initialize CodeMirror when focused
  useEffect(() => {
    if (!isFocused || !editorRef.current) return;

    // Destroy existing editor if any
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        setContent(update.state.doc.toString());
      }
      // Check for focus changes
      if (update.focusChanged && !update.view.hasFocus) {
        setIsFocused(false);
      }
    });

    const state = EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        markdown(),
        customTheme,
        syntaxHighlighting(customHighlighting),
        updateListener,
        EditorView.theme({
          "&": {
            height: "100%",
            fontSize: "14px",
          },
          ".cm-scroller": {
            overflow: "auto",
            height: "100%",
          },
          ".cm-content": {
            minHeight: "100%",
            paddingBottom: "200px", // Extra space for clicking below content
          },
        }),
      ],
    });

    viewRef.current = new EditorView({
      state,
      parent: editorRef.current,
    });

    // Focus the editor
    viewRef.current.focus();

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [isFocused]);

  // Update editor content if it changes externally
  useEffect(() => {
    if (viewRef.current && isFocused) {
      const currentContent = viewRef.current.state.doc.toString();
      if (currentContent !== content) {
        viewRef.current.dispatch({
          changes: { from: 0, to: currentContent.length, insert: content },
        });
      }
    }
  }, [content, isFocused]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  return (
    <Card className="h-full flex flex-col border-0 rounded-none bg-card">
      <CardContent className="flex-1 p-0 overflow-hidden">
        {isFocused ? (
          <div ref={editorRef} className="h-full" />
        ) : (
          <div
            className="h-full p-4 overflow-auto cursor-pointer prose dark:prose-invert prose-sm max-w-none prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground"
            onDoubleClick={handleFocus}
            title="Double-click to edit"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
