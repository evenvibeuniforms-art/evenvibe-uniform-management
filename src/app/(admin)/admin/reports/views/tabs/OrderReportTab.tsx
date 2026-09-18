import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ShoppingCart } from "lucide-react";
import { OrderReportRow, PaginatedResult, GlobalReportFilters } from "../../types";
import { ExportReportButton } from "../components/ExportReportButton";

interface OrderReportTabProps {
  report: PaginatedResult<OrderReportRow>;
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

const getStatusBadge = (status: string) => {
  switch (status) {
    case "submitted":
      return "bg-slate-100 text-slate-800 border-slate-200";
    case "under_review":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "confirmed":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "production":
      return "bg-indigo-100 text-indigo-800 border-indigo-200";
    case "quality_check":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "packed":
      return "bg-teal-100 text-teal-800 border-teal-200";
    case "dispatched":
      return "bg-cyan-100 text-cyan-800 border-cyan-200";
    case "in_transit":
      return "bg-sky-100 text-sky-800 border-sky-200";
    case "delivered":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "cancelled":
      return "bg-rose-100 text-rose-800 border-rose-200";
    default:
      return "bg-slate-100 text-slate-800 border-slate-200";
  }
};

export function OrderReportTab({ report, filters, onPageChange }: OrderReportTabProps) {
  const { data, totalCount, page, totalPages, pageSize } = report;

  return (
    <Card className="border-slate-200 shadow-sm overflow-hidden">
      <CardHeader className="py-3.5 px-4 border-b bg-slate-50/50 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-emerald-600" />
            Order Lifecycle Report ({totalCount})
          </CardTitle>
          <CardDescription className="text-xs mt-0.5">
            Complete order ledger including order dates, student participation, historical quantities, and current lifecycle stage.
          </CardDescription>
        </div>
        <ExportReportButton tabName="orders" tabLabel="Order Report" filters={filters} />
      </CardHeader>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="text-xs font-semibold text-slate-700">Order Number</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">School</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Order Date</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700 text-center">Total Students</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700 text-center">Total Items</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Current Status</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Last Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-xs text-slate-500">
                  No orders found matching the selected filters.
                </TableCell>
              </TableRow>
            ) : (
              data.map((o) => (
                <TableRow key={o.orderId} className="hover:bg-slate-50/80 transition-colors">
                  <TableCell className="font-semibold text-slate-900 text-xs font-mono">{o.orderNumber}</TableCell>
                  <TableCell className="text-slate-700 text-xs max-w-[180px] truncate" title={o.schoolName}>
                    {o.schoolName}
                  </TableCell>
                  <TableCell className="text-slate-600 text-xs">{formatDate(o.orderDate)}</TableCell>
                  <TableCell className="text-center text-slate-800 text-xs font-medium">{o.totalStudents}</TableCell>
                  <TableCell className="text-center text-slate-900 text-xs font-bold">{o.totalItems}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[11px] px-2 py-0.5 font-medium ${getStatusBadge(o.status)}`}>
                      {o.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-600 text-xs">{formatDate(o.lastUpdated)}</TableCell>
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
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount} orders
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
