import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ClipboardCheck } from "lucide-react";
import { QualityCheckReportRow, PaginatedResult, GlobalReportFilters } from "../../types";
import { ExportReportButton } from "../components/ExportReportButton";

interface QualityCheckReportTabProps {
  report: PaginatedResult<QualityCheckReportRow>;
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

const getQCBadge = (status: string) => {
  switch (status) {
    case "pending":
      return "bg-slate-100 text-slate-800 border-slate-200";
    case "in_progress":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "passed":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "failed":
      return "bg-rose-100 text-rose-800 border-rose-200";
    default:
      return "bg-slate-100 text-slate-800 border-slate-200";
  }
};

export function QualityCheckReportTab({ report, filters, onPageChange }: QualityCheckReportTabProps) {
  const { data, totalCount, page, totalPages, pageSize } = report;

  return (
    <Card className="border-slate-200 shadow-sm overflow-hidden">
      <CardHeader className="py-3.5 px-4 border-b bg-slate-50/50 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-purple-600" />
            Quality Check & Inspection Report ({totalCount})
          </CardTitle>
          <CardDescription className="text-xs mt-0.5">
            Detailed inspection analytics, pass versus defect counts, and defect percentage by order.
          </CardDescription>
        </div>
        <ExportReportButton tabName="quality_check" tabLabel="Quality Check Report" filters={filters} />
      </CardHeader>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="text-xs font-semibold text-slate-700">Order Number</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">School</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700 text-center">Total Qty</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700 text-center">Checked Qty</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700 text-center">Passed Qty</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700 text-center">Defective Qty</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700 text-center">Defect Rate</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">QC Status</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Started Date</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Completed Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-10 text-xs text-slate-500">
                  No quality check records found matching the selected filters.
                </TableCell>
              </TableRow>
            ) : (
              data.map((q) => (
                <TableRow key={q.orderId} className="hover:bg-slate-50/80 transition-colors">
                  <TableCell className="font-semibold text-slate-900 text-xs font-mono">{q.orderNumber}</TableCell>
                  <TableCell className="text-slate-700 text-xs max-w-[160px] truncate" title={q.schoolName}>
                    {q.schoolName}
                  </TableCell>
                  <TableCell className="text-center text-slate-900 text-xs font-semibold">{q.totalQuantity}</TableCell>
                  <TableCell className="text-center text-slate-800 text-xs font-medium">{q.checkedQuantity}</TableCell>
                  <TableCell className="text-center text-emerald-700 text-xs font-bold">{q.passedQuantity}</TableCell>
                  <TableCell className="text-center text-rose-700 text-xs font-bold">{q.defectiveQuantity}</TableCell>
                  <TableCell className="text-center text-xs font-semibold">
                    <span className={q.defectRate > 0 ? "text-rose-600" : "text-emerald-600"}>
                      {q.defectRate.toFixed(2)}%
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[11px] px-2 py-0.5 font-medium ${getQCBadge(q.status)}`}>
                      {q.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-600 text-xs">{formatDate(q.startedAt)}</TableCell>
                  <TableCell className="text-slate-600 text-xs">{formatDate(q.completedAt)}</TableCell>
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
