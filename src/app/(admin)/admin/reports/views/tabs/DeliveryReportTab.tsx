import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Truck } from "lucide-react";
import { DeliveryReportRow, PaginatedResult, GlobalReportFilters } from "../../types";
import { ExportReportButton } from "../components/ExportReportButton";

interface DeliveryReportTabProps {
  report: PaginatedResult<DeliveryReportRow>;
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

const getDeliveryBadge = (status: string) => {
  switch (status) {
    case "packed":
      return "bg-teal-100 text-teal-800 border-teal-200";
    case "dispatched":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "in_transit":
      return "bg-sky-100 text-sky-800 border-sky-200";
    case "delivered":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    default:
      return "bg-slate-100 text-slate-800 border-slate-200";
  }
};

export function DeliveryReportTab({ report, filters, onPageChange }: DeliveryReportTabProps) {
  const { data, totalCount, page, totalPages, pageSize } = report;

  return (
    <Card className="border-slate-200 shadow-sm overflow-hidden">
      <CardHeader className="py-3.5 px-4 border-b bg-slate-50/50 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Truck className="h-4 w-4 text-emerald-600" />
            Dispatch & Delivery Logistics Report ({totalCount})
          </CardTitle>
          <CardDescription className="text-xs mt-0.5">
            Courier assignments, tracking references, dispatch stamps, and destination delivery dates.
          </CardDescription>
        </div>
        <ExportReportButton tabName="delivery" tabLabel="Delivery Report" filters={filters} />
      </CardHeader>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="text-xs font-semibold text-slate-700">Order Number</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">School</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Courier</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Tracking Number</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Estimated Delivery</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Shipped Date</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Delivered Date</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Delivery Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-xs text-slate-500">
                  No delivery records found matching the selected filters.
                </TableCell>
              </TableRow>
            ) : (
              data.map((d) => (
                <TableRow key={d.orderId} className="hover:bg-slate-50/80 transition-colors">
                  <TableCell className="font-semibold text-slate-900 text-xs font-mono">{d.orderNumber}</TableCell>
                  <TableCell className="text-slate-700 text-xs max-w-[180px] truncate" title={d.schoolName}>
                    {d.schoolName}
                  </TableCell>
                  <TableCell className="text-slate-800 text-xs font-medium">{d.courierName || "—"}</TableCell>
                  <TableCell className="text-slate-600 text-xs font-mono">{d.trackingNumber || "—"}</TableCell>
                  <TableCell className="text-slate-600 text-xs">{formatDate(d.estimatedDelivery)}</TableCell>
                  <TableCell className="text-slate-600 text-xs">{formatDate(d.shippedAt)}</TableCell>
                  <TableCell className="text-slate-600 text-xs">{formatDate(d.deliveredAt)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[11px] px-2 py-0.5 font-medium ${getDeliveryBadge(d.status)}`}>
                      {d.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </Badge>
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
