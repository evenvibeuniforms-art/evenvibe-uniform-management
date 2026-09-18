import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Factory } from "lucide-react";
import { ProductionReportRow, PaginatedResult, GlobalReportFilters } from "../../types";
import { ExportReportButton } from "../components/ExportReportButton";

interface ProductionReportTabProps {
  report: PaginatedResult<ProductionReportRow>;
  filters: GlobalReportFilters;
  onPageChange: (page: number) => void;
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const getStageBadge = (stage: string) => {
  switch (stage) {
    case "production_started":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "cutting":
      return "bg-indigo-100 text-indigo-800 border-indigo-200";
    case "stitching":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "finishing":
      return "bg-pink-100 text-pink-800 border-pink-200";
    case "production_completed":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    default:
      return "bg-slate-100 text-slate-800 border-slate-200";
  }
};

export function ProductionReportTab({ report, filters, onPageChange }: ProductionReportTabProps) {
  const { data, totalCount, page, totalPages, pageSize } = report;

  return (
    <Card className="border-slate-200 shadow-sm overflow-hidden">
      <CardHeader className="py-3.5 px-4 border-b bg-slate-50/50 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Factory className="h-4 w-4 text-indigo-600" />
            Manufacturing & Production Report ({totalCount})
          </CardTitle>
          <CardDescription className="text-xs mt-0.5">
            Internal manufacturing stages, cutting, stitching, and finishing velocity across confirmed orders.
          </CardDescription>
        </div>
        <ExportReportButton tabName="production" tabLabel="Production Report" filters={filters} />
      </CardHeader>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="text-xs font-semibold text-slate-700">Order Number</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">School</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700 text-center">Total Qty</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700 text-center">Completed Qty</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700 text-center">Pending Qty</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Stage</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Started Date</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Completed Date</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Remarks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10 text-xs text-slate-500">
                  No production records found matching the selected filters.
                </TableCell>
              </TableRow>
            ) : (
              data.map((p) => (
                <TableRow key={p.orderId} className="hover:bg-slate-50/80 transition-colors">
                  <TableCell className="font-semibold text-slate-900 text-xs font-mono">{p.orderNumber}</TableCell>
                  <TableCell className="text-slate-700 text-xs max-w-[160px] truncate" title={p.schoolName}>
                    {p.schoolName}
                  </TableCell>
                  <TableCell className="text-center text-slate-900 text-xs font-semibold">{p.totalQuantity}</TableCell>
                  <TableCell className="text-center text-emerald-700 text-xs font-bold">{p.completedQuantity}</TableCell>
                  <TableCell className="text-center text-amber-700 text-xs font-bold">{p.pendingQuantity}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[11px] px-2 py-0.5 font-medium ${getStageBadge(p.stage)}`}>
                      {p.stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-600 text-xs">{formatDate(p.startedAt)}</TableCell>
                  <TableCell className="text-slate-600 text-xs">{formatDate(p.completedAt)}</TableCell>
                  <TableCell className="text-slate-600 text-xs max-w-[150px] truncate" title={p.remarks || ""}>
                    {p.remarks || "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50/50">
          <p className="text-xs text-muted-foreground">
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount} records
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="h-8 px-2"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="sr-only">Previous</span>
            </Button>
            <span className="text-xs px-2 font-medium">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="h-8 px-2"
            >
              <ChevronRight className="h-4 w-4" />
              <span className="sr-only">Next</span>
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
