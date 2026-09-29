import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Layers } from "lucide-react";
import { UniformSizeReportItem, PaginatedResult, GlobalReportFilters } from "../../types";
import { ExportReportButton } from "../components/ExportReportButton";
import { MobileCard, MobileCardField } from "@/components/ui/mobile-card";

interface UniformSizeReportTabProps {
  report: PaginatedResult<UniformSizeReportItem>;
  filters: GlobalReportFilters;
  onPageChange: (page: number) => void;
}

export function UniformSizeReportTab({ report, filters, onPageChange }: UniformSizeReportTabProps) {
  const { data, totalCount, page, totalPages, pageSize } = report;

  return (
    <Card className="border-slate-200 shadow-sm overflow-hidden">
      <CardHeader className="py-3.5 px-4 border-b bg-slate-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Layers className="h-4 w-4 text-evenvibe-primary" />
            Uniform Size & Item Breakdown Report ({totalCount})
          </CardTitle>
          <CardDescription className="text-xs mt-0.5">
            Dynamic historical requirement breakdown grouped by school, class, gender, item name, and size.
          </CardDescription>
        </div>
        <ExportReportButton tabName="uniform_sizes" tabLabel="Uniform Sizes Report" filters={filters} />
      </CardHeader>

      {/* Desktop Table View (>= 768px) */}
      <div className="hidden md:block overflow-x-auto">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="text-xs font-semibold text-slate-700">School</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Class</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Section</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Gender</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Style</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Uniform Item Name</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Size</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700 text-right">Quantity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-xs text-slate-500">
                  No uniform size records found matching the selected filters.
                </TableCell>
              </TableRow>
            ) : (
              data.map((item, idx) => (
                <TableRow key={idx} className="hover:bg-slate-50/80 transition-colors">
                  <TableCell className="font-semibold text-slate-900 text-xs">{item.schoolName}</TableCell>
                  <TableCell className="text-slate-700 text-xs font-medium">{item.className}</TableCell>
                  <TableCell className="text-slate-700 text-xs font-medium">{item.section}</TableCell>
                  <TableCell className="text-slate-600 text-xs capitalize">{item.gender}</TableCell>
                  <TableCell className="text-slate-700 text-xs font-medium">{item.styleName || "Style not available"}</TableCell>
                  <TableCell className="font-medium text-emerald-800 text-xs">{item.itemName}</TableCell>
                  <TableCell className="text-slate-800 text-xs font-mono font-medium">{item.size}</TableCell>
                  <TableCell className="text-right text-slate-900 text-xs font-bold">{item.quantity}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card View (< 768px) */}
      <div className="md:hidden space-y-3 p-3 bg-slate-50/50">
        {data.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500 bg-white rounded-lg border border-slate-200">
            No uniform size records found matching the selected filters.
          </div>
        ) : (
          data.map((item, idx) => (
            <MobileCard key={idx}>
              <MobileCardField label="School" value={item.schoolName} />
              <MobileCardField label="Class" value={item.className} />
              <MobileCardField label="Section" value={item.section} />
              <MobileCardField label="Gender" value={<span className="capitalize">{item.gender}</span>} />
              <MobileCardField label="Style" value={item.styleName || "Style not available"} />
              <MobileCardField label="Uniform Item Name" value={<span className="text-emerald-800 font-medium">{item.itemName}</span>} />
              <MobileCardField label="Size" value={<span className="font-mono font-medium">{item.size}</span>} />
              <MobileCardField label="Quantity" value={<span className="font-bold">{item.quantity}</span>} />
            </MobileCard>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t bg-slate-50/50">
          <p className="text-xs text-muted-foreground text-center sm:text-left">
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount} size lines
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
