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
import type { IDockviewPanelProps } from "dockview";
import { Table as TableIcon, X } from "lucide-react";

export interface TablePanelParams {
  interactionId: string;
  sessionName: string;
  title: string;
  headers: string[];
  rows: Record<string, unknown>[];
}

export default function TablePanel({
  params,
}: IDockviewPanelProps<TablePanelParams>) {
  const { interactionId, sessionName, title, headers, rows } = params;

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

  // Derive headers from first row if not provided
  const actualHeaders =
    headers && headers.length > 0
      ? headers
      : rows?.[0]
        ? Object.keys(rows[0])
        : [];

  return (
    <Card className="w-full h-full border-0 rounded-none shadow-none flex flex-col">
      <CardHeader className="panel-header pb-2">
        <div className="flex items-center gap-2">
          <TableIcon className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-sm flex-1">{title}</CardTitle>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
            {rows.length} rows
          </span>
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
        <Table>
          <TableHeader>
            <TableRow>
              {actualHeaders.map((header, i) => (
                <TableHead key={i} className="text-xs">
                  {header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {actualHeaders.map((header, colIndex) => (
                  <TableCell key={colIndex} className="text-xs">
                    {String(row[header] ?? "")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
