import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Handle, type NodeProps, NodeResizer, Position } from "@xyflow/react";
import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderTree,
  X,
} from "lucide-react";
import { memo, useCallback, useState } from "react";

type TreeNodeItem = {
  id: string;
  name: string;
  children?: TreeNodeItem[];
  isOpen?: boolean;
};

export interface TreeNodeData {
  interactionId: string;
  sessionName: string;
  title: string;
  data: TreeNodeItem[];
  selectable: boolean;
}

function TreeNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as TreeNodeData;
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(
    new Set(["root"])
  );
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

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
        result: selectedNode,
      });
    }
  };

  const toggleNode = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const TreeNodeComponent = ({
    node,
    depth = 0,
  }: {
    node: TreeNodeItem;
    depth?: number;
  }) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedNode === node.id;

    return (
      <div>
        <div
          role="treeitem"
          tabIndex={0}
          aria-expanded={hasChildren ? isExpanded : undefined}
          aria-selected={isSelected}
          className={cn(
            "flex items-center gap-1 py-1 px-2 rounded cursor-pointer hover:bg-accent",
            isSelected && "bg-primary text-primary-foreground hover:bg-primary"
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => {
            if (hasChildren) {
              toggleNode(node.id);
            }
            if (nodeData.selectable) {
              setSelectedNode(node.id);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (hasChildren) {
                toggleNode(node.id);
              }
              if (nodeData.selectable) {
                setSelectedNode(node.id);
              }
            }
          }}
        >
          {hasChildren ? (
            <span className="w-4 h-4 flex items-center justify-center">
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </span>
          ) : (
            <span className="w-4" />
          )}
          {hasChildren ? (
            <Folder
              className={cn(
                "h-4 w-4",
                isExpanded
                  ? "text-[hsl(var(--folder-open))]"
                  : "text-[hsl(var(--folder-closed))]"
              )}
            />
          ) : (
            <File className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm truncate">{node.name}</span>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {node.children?.map((child) => (
              <TreeNodeComponent
                key={child.id}
                node={child}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  const treeData = nodeData.data || [];

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
            <FolderTree className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-sm flex-1">{nodeData.title}</CardTitle>
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
        <CardContent className="p-2 flex-1 overflow-auto nodrag nowheel">
          {treeData.map((node) => (
            <TreeNodeComponent key={node.id} node={node as TreeNodeItem} />
          ))}
        </CardContent>
      </Card>
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Right} id="right" />
    </>
  );
}

export default memo(TreeNode);
