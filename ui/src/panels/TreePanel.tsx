import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { IDockviewPanelProps } from "dockview";
import { ChevronDown, ChevronRight, FolderTree, X } from "lucide-react";
import { useState } from "react";

interface TreeNode {
  id: string;
  label: string;
  children?: TreeNode[];
}

export interface TreePanelParams {
  interactionId: string;
  sessionName: string;
  title: string;
  data: TreeNode[];
  selectable: boolean;
}

function TreeItem({
  node,
  level,
  selectable,
  onSelect,
}: {
  node: TreeNode;
  level: number;
  selectable: boolean;
  onSelect?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-1 py-0.5 text-sm ${selectable ? "cursor-pointer hover:bg-accent rounded" : ""}`}
        style={{ paddingLeft: level * 16 }}
        onClick={() => selectable && onSelect?.(node.id)}
      >
        {hasChildren ? (
          <button
            type="button"
            className="p-0.5"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span>{node.label}</span>
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children?.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              level={level + 1}
              selectable={selectable}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TreePanel({
  params,
}: IDockviewPanelProps<TreePanelParams>) {
  const { interactionId, sessionName, title, data, selectable } = params;

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

  const handleSelect = (nodeId: string) => {
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
      respond(interactionId, sessionName, {
        action: "accept",
        result: nodeId,
      });
    }
  };

  return (
    <Card className="w-full h-full border-0 rounded-none shadow-none flex flex-col">
      <CardHeader className="panel-header pb-2">
        <div className="flex items-center gap-2">
          <FolderTree className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-sm flex-1">{title}</CardTitle>
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
      <CardContent className="py-2 flex-1 overflow-auto">
        {data.map((node) => (
          <TreeItem
            key={node.id}
            node={node}
            level={0}
            selectable={selectable}
            onSelect={handleSelect}
          />
        ))}
      </CardContent>
    </Card>
  );
}
