import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { sql } from "@codemirror/lang-sql";
import { EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { Handle, type NodeProps, NodeResizer, Position } from "@xyflow/react";
import { EditorView, basicSetup } from "codemirror";
import { ExternalLink, FileText, Save, X, XCircle } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

// Helper to detect dark mode
function isDarkMode(): boolean {
  return document.documentElement.classList.contains("dark");
}

// File path regex - matches absolute and relative paths
const FILE_PATH_REGEX =
  /(?:^|[\s`"'([\{])([~.]?\/[\w\-./]+\.\w+|[A-Za-z]:\\[\w\-\\./]+\.\w+)(?=[\s`"')\]}]|$)/g;

// Get language from file extension
function getLanguageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const langMap: Record<string, string> = {
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
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    css: "css",
    scss: "scss",
    html: "html",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    md: "markdown",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    sql: "sql",
    xml: "xml",
    toml: "toml",
  };
  return langMap[ext] || "text";
}

// Get CodeMirror language extension from file path
function getLanguageExtension(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return javascript({
        typescript: ext.startsWith("ts"),
        jsx: ext.endsWith("x"),
      });
    case "py":
      return python();
    case "json":
      return json();
    case "html":
    case "htm":
      return html();
    case "css":
    case "scss":
    case "less":
      return css();
    case "md":
    case "markdown":
      return markdown();
    case "rs":
      return rust();
    case "sql":
      return sql();
    default:
      return [];
  }
}

export interface MarkdownNodeData {
  interactionId: string;
  sessionName: string;
  title: string;
  content: string;
}

function MarkdownNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as MarkdownNodeData;
  // Unescape literal \n to actual newlines
  const content = (nodeData.content || "").replace(/\\n/g, "\n");

  const [editingFile, setEditingFile] = useState<{
    path: string;
    content: string;
    language: string;
  } | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);

  // Initialize/update CodeMirror when editing a file
  useEffect(() => {
    if (!editingFile || !editorRef.current || loading) return;

    // Clean up existing editor
    if (editorViewRef.current) {
      editorViewRef.current.destroy();
      editorViewRef.current = null;
    }

    // Create new editor
    const langExtension = getLanguageExtension(editingFile.path);
    const darkMode = isDarkMode();
    const state = EditorState.create({
      doc: fileContent,
      extensions: [
        basicSetup,
        langExtension,
        ...(darkMode ? [oneDark] : []),
        EditorView.updateListener.of(
          (update: { docChanged: boolean; state: EditorState }) => {
            if (update.docChanged) {
              setFileContent(update.state.doc.toString());
            }
          }
        ),
        EditorView.theme({
          "&": {
            height: "100%",
            fontSize: "12px",
          },
          ".cm-content": {
            padding: "8px 0",
          },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    editorViewRef.current = view;

    return () => {
      view.destroy();
      editorViewRef.current = null;
    };
    // Note: fileContent intentionally excluded - we only want to create the editor when editingFile changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingFile, loading]);

  // Detect file paths in content
  const filePaths = useMemo(() => {
    const paths: string[] = [];
    let match: RegExpExecArray | null;
    const regex = new RegExp(FILE_PATH_REGEX.source, "g");
    while ((match = regex.exec(content)) !== null) {
      if (match[1] && !paths.includes(match[1])) {
        paths.push(match[1]);
      }
    }
    return paths;
  }, [content]);

  const handleOpenFile = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);

      try {
        const sendMessage = (
          window as unknown as {
            awbSendMessage?: (message: unknown) => void;
          }
        ).awbSendMessage;

        if (sendMessage) {
          const response = await new Promise<{
            content: string;
            error?: string;
          }>((resolve) => {
            const handler = (event: MessageEvent) => {
              try {
                const data = JSON.parse(event.data);
                if (data.type === "file-content" && data.path === path) {
                  window.removeEventListener("message", handler);
                  resolve(data);
                }
              } catch {
                // Ignore parse errors
              }
            };

            window.addEventListener("message", handler);
            sendMessage({
              type: "read-file",
              path: path,
              sessionName: nodeData.sessionName,
            });

            setTimeout(() => {
              window.removeEventListener("message", handler);
              resolve({ content: "", error: "Timeout reading file" });
            }, 5000);
          });

          if (response.error) {
            setError(response.error);
          } else {
            setEditingFile({
              path,
              content: response.content,
              language: getLanguageFromPath(path),
            });
            setFileContent(response.content);
          }
        } else {
          setError("WebSocket not connected");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to read file");
      } finally {
        setLoading(false);
      }
    },
    [nodeData.sessionName]
  );

  const handleSaveFile = useCallback(async () => {
    if (!editingFile) return;

    setSaving(true);
    setError(null);

    try {
      const sendMessage = (
        window as unknown as {
          awbSendMessage?: (message: unknown) => void;
        }
      ).awbSendMessage;

      if (sendMessage) {
        sendMessage({
          type: "write-file",
          path: editingFile.path,
          content: fileContent,
          sessionName: nodeData.sessionName,
        });

        setEditingFile({
          ...editingFile,
          content: fileContent,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save file");
    } finally {
      setSaving(false);
    }
  }, [editingFile, fileContent, nodeData.sessionName]);

  const handleCloseEditor = useCallback(() => {
    setEditingFile(null);
    setFileContent("");
    setError(null);
  }, []);

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

  // Custom renderer for code elements to make file paths clickable
  const components = useMemo(
    () => ({
      code: ({
        children,
        className,
        ...props
      }: React.ComponentPropsWithoutRef<"code"> & {
        children?: React.ReactNode;
      }) => {
        const text = String(children || "");
        const isFilePath = filePaths.some((fp) => text.includes(fp));

        if (isFilePath && !className?.includes("language-")) {
          const matchedPath = filePaths.find((fp) => text.includes(fp));
          if (matchedPath) {
            return (
              <code
                {...props}
                className="cursor-pointer bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 px-1 py-0.5 rounded text-blue-700 dark:text-blue-300 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  handleOpenFile(matchedPath);
                }}
                title={`Click to edit ${matchedPath}`}
              >
                {children}
                <ExternalLink className="inline h-3 w-3 ml-1" />
              </code>
            );
          }
        }

        return (
          <code className={className} {...props}>
            {children}
          </code>
        );
      },
      p: ({
        children,
        ...props
      }: React.ComponentPropsWithoutRef<"p"> & {
        children?: React.ReactNode;
      }) => {
        if (typeof children === "string") {
          const parts: React.ReactNode[] = [];
          let lastIndex = 0;
          const regex = new RegExp(FILE_PATH_REGEX.source, "g");
          let match: RegExpExecArray | null;

          while ((match = regex.exec(children)) !== null) {
            const path = match[1];
            const fullMatch = match[0];
            const matchIndex = match.index + fullMatch.indexOf(path);

            if (matchIndex > lastIndex) {
              parts.push(children.slice(lastIndex, matchIndex));
            }

            parts.push(
              <span
                key={matchIndex}
                role="button"
                tabIndex={0}
                className="cursor-pointer text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  handleOpenFile(path);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleOpenFile(path);
                  }
                }}
                title={`Click to edit ${path}`}
              >
                {path}
                <ExternalLink className="inline h-3 w-3 ml-1" />
              </span>
            );

            lastIndex = matchIndex + path.length;
          }

          if (lastIndex < children.length) {
            parts.push(children.slice(lastIndex));
          }

          if (parts.length > 0) {
            return <p {...props}>{parts}</p>;
          }
        }

        return <p {...props}>{children}</p>;
      },
    }),
    [filePaths, handleOpenFile]
  );

  const hasChanges = editingFile && fileContent !== editingFile.content;

  return (
    <>
      <NodeResizer
        minWidth={200}
        minHeight={100}
        isVisible={selected}
        lineClassName="!border-primary"
        handleClassName="!w-2 !h-2 !bg-primary !border-primary"
      />
      <Card className="w-full h-full min-w-[200px] shadow-md flex flex-col">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-sm flex-1">
              {editingFile ? (
                <span className="font-mono text-xs">{editingFile.path}</span>
              ) : (
                nodeData.title
              )}
            </CardTitle>
            {editingFile && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 nodrag"
                  disabled={!hasChanges || saving}
                  onClick={handleSaveFile}
                  title="Save changes"
                >
                  <Save
                    className={`h-4 w-4 ${hasChanges ? "text-[hsl(var(--icon-success))]" : ""}`}
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 nodrag"
                  onClick={handleCloseEditor}
                  title="Close editor"
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </>
            )}
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
        <CardContent className="py-2 flex-1 overflow-auto nodrag nowheel">
          {loading && (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Loading file...
            </div>
          )}
          {error && (
            <div className="text-sm text-destructive p-2 bg-destructive/10 rounded">
              {error}
            </div>
          )}
          {editingFile && !loading ? (
            <div className="h-full flex flex-col">
              <div
                ref={editorRef}
                className="flex-1 w-full border rounded overflow-hidden bg-background min-h-[200px]"
              />
              {hasChanges && (
                <div className="text-xs text-muted-foreground mt-1">
                  Unsaved changes
                </div>
              )}
            </div>
          ) : (
            !loading && (
              <div className="markdown-body text-sm select-text">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={components}
                >
                  {content}
                </ReactMarkdown>
              </div>
            )
          )}
        </CardContent>
      </Card>
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Right} id="right" />
    </>
  );
}

export default memo(MarkdownNode);
