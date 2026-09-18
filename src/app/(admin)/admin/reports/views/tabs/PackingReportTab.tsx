import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Package } from "lucide-react";
import { PackingReportRow, PaginatedResult, GlobalReportFilters } from "../../types";
import { ExportReportButton } from "../components/ExportReportButton";

interface PackingReportTabProps {
  report: PaginatedResult<PackingReportRow>;
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

const getPackingBadge = (status: string) => {
  switch (status) {
    case "pending":
      return "bg-slate-100 text-slate-800 border-slate-200";
    case "in_progress":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "completed":
      return "bg-teal-100 text-teal-800 border-teal-200";
    default:
      return "bg-slate-100 text-slate-800 border-slate-200";
  }
};

export function PackingReportTab({ report, filters, onPageChange }: PackingReportTabProps) {
  const { data, totalCount, page, totalPages, pageSize } = report;

  return (
    <Card className="border-slate-200 shadow-sm overflow-hidden">
      <CardHeader className="py-3.5 px-4 border-b bg-slate-50/50 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Package className="h-4 w-4 text-teal-600" />
            Packing & Cartoning Report ({totalCount})
          </CardTitle>
          <CardDescription className="text-xs mt-0.5">
            Cartoning verification, boxed item progress, and completion velocity across verified orders.
          </CardDescription>
        </div>
        <ExportReportButton tabName="packing" tabLabel="Packing Report" filters={filters} />
      </CardHeader>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="text-xs font-semibold text-slate-700">Order Number</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">School</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700 text-center">Total Qty</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700 text-center">Packed Qty</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700 text-center">Pending Qty</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700 text-center">Progress</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Packing Status</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Started Date</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Completed Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10 text-xs text-slate-500">
                  No packing records found matching the selected filters.
                </TableCell>
              </TableRow>
            ) : (
              data.map((pk) => (
                <TableRow key={pk.orderId} className="hover:bg-slate-50/80 transition-colors">
                  <TableCell className="font-semibold text-slate-900 text-xs font-mono">{pk.orderNumber}</TableCell>
                  <TableCell className="text-slate-700 text-xs max-w-[180px] truncate" title={pk.schoolName}>
                    {pk.schoolName}
                  </TableCell>
                  <TableCell className="text-center text-slate-900 text-xs font-semibold">{pk.totalQuantity}</TableCell>
                  <TableCell className="text-center text-teal-700 text-xs font-bold">{pk.packedQuantity}</TableCell>
                  <TableCell className="text-center text-amber-700 text-xs font-bold">{pk.pendingQuantity}</TableCell>
                  <TableCell className="text-center text-xs font-semibold">
                    <span className="text-emerald-700">{pk.progressPercent}%</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[11px] px-2 py-0.5 font-medium ${getPackingBadge(pk.status)}`}>
                      {pk.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-600 text-xs">{formatDate(pk.startedAt)}</TableCell>
                  <TableCell className="text-slate-600 text-xs">{formatDate(pk.completedAt)}</TableCell>
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
