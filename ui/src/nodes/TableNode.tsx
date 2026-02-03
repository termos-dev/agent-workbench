import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Handle, type NodeProps, NodeResizer, Position } from "@xyflow/react";
import { Table2, X } from "lucide-react";
import { memo } from "react";

export interface TableNodeData {
  interactionId: string;
  sessionName: string;
  title: string;
  headers: string[];
  rows: Record<string, unknown>[];
}

function TableNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as TableNodeData;

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

  const rows = nodeData.rows || [];
  // Derive headers from first row if not provided
  const headers =
    nodeData.headers && nodeData.headers.length > 0
      ? nodeData.headers
      : rows[0]
        ? Object.keys(rows[0])
        : [];

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
            <Table2 className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-sm flex-1">{nodeData.title}</CardTitle>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {rows.length} rows
            </span>
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
        <CardContent className="p-0 flex-1 overflow-auto nodrag nowheel">
          <Table>
            <TableHeader>
              <TableRow>
                {headers.map((header) => (
                  <TableHead key={header} className="text-xs">
                    {header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i}>
                  {headers.map((header) => (
                    <TableCell key={header} className="text-xs py-2">
                      {String(row[header] ?? "")}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Right} id="right" />
    </>
  );
}

export default memo(TableNode);
