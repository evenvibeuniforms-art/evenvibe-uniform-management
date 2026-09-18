import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Building2 } from "lucide-react";
import { SchoolPerformanceRow, PaginatedResult, GlobalReportFilters } from "../../types";
import { ExportReportButton } from "../components/ExportReportButton";

interface SchoolReportTabProps {
  report: PaginatedResult<SchoolPerformanceRow>;
  filters: GlobalReportFilters;
  onPageChange: (page: number) => void;
}

export function SchoolReportTab({ report, filters, onPageChange }: SchoolReportTabProps) {
  const { data, totalCount, page, totalPages, pageSize } = report;

  return (
    <Card className="border-slate-200 shadow-sm overflow-hidden">
      <CardHeader className="py-3.5 px-4 border-b bg-slate-50/50 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-blue-600" />
            School Performance Report ({totalCount})
          </CardTitle>
          <CardDescription className="text-xs mt-0.5">
            Institutional order history, student enrollment, and delivery completion status.
          </CardDescription>
        </div>
        <ExportReportButton tabName="schools" tabLabel="School Report" filters={filters} />
      </CardHeader>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="text-xs font-semibold text-slate-700">School Name</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Code</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700 text-center">Total Students</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700 text-center">Orders</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700 text-center">Total Items</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Current Order Stage</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700 text-center">Delivered</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700 text-center">Pending</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-xs text-slate-500">
                  No schools found matching the selected filters.
                </TableCell>
              </TableRow>
            ) : (
              data.map((s) => (
                <TableRow key={s.schoolId} className="hover:bg-slate-50/80 transition-colors">
                  <TableCell className="font-semibold text-slate-900 text-xs">{s.schoolName}</TableCell>
                  <TableCell className="text-slate-600 text-xs font-mono">{s.schoolCode}</TableCell>
                  <TableCell className="text-center text-slate-800 text-xs font-medium">{s.totalStudents}</TableCell>
                  <TableCell className="text-center text-slate-800 text-xs font-medium">{s.orderCount}</TableCell>
                  <TableCell className="text-center text-slate-800 text-xs font-medium">{s.totalItems}</TableCell>
                  <TableCell className="text-slate-700 text-xs font-medium">{s.currentOrderStage}</TableCell>
                  <TableCell className="text-center text-emerald-700 text-xs font-semibold">{s.deliveredOrders}</TableCell>
                  <TableCell className="text-center text-amber-700 text-xs font-semibold">{s.pendingOrders}</TableCell>
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
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount} schools
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
