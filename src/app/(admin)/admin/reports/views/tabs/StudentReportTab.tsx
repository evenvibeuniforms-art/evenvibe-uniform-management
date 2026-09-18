import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import { StudentReportRow, PaginatedResult, GlobalReportFilters } from "../../types";
import { ExportReportButton } from "../components/ExportReportButton";

interface StudentReportTabProps {
  report: PaginatedResult<StudentReportRow>;
  filters: GlobalReportFilters;
  onPageChange: (page: number) => void;
}

export function StudentReportTab({ report, filters, onPageChange }: StudentReportTabProps) {
  const { data, totalCount, page, totalPages, pageSize } = report;

  return (
    <Card className="border-slate-200 shadow-sm overflow-hidden">
      <CardHeader className="py-3.5 px-4 border-b bg-slate-50/50 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-600" />
            Student Enrollment & Size Collection Report ({totalCount})
          </CardTitle>
          <CardDescription className="text-xs mt-0.5">
            Student roster, size measurement completion status, and historical order participation.
          </CardDescription>
        </div>
        <ExportReportButton tabName="students" tabLabel="Student Report" filters={filters} />
      </CardHeader>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="text-xs font-semibold text-slate-700">Student Name</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Admission No</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">School</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Class</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Section</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Gender</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700 text-center">Size Status</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700 text-center">Order Participation</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-xs text-slate-500">
                  No students found matching the selected filters.
                </TableCell>
              </TableRow>
            ) : (
              data.map((st) => (
                <TableRow key={st.studentId} className="hover:bg-slate-50/80 transition-colors">
                  <TableCell className="font-semibold text-slate-900 text-xs">{st.studentName}</TableCell>
                  <TableCell className="text-slate-600 text-xs font-mono">{st.admissionNumber}</TableCell>
                  <TableCell className="text-slate-700 text-xs max-w-[180px] truncate" title={st.schoolName}>
                    {st.schoolName}
                  </TableCell>
                  <TableCell className="text-slate-700 text-xs font-medium">{st.className}</TableCell>
                  <TableCell className="text-slate-700 text-xs font-medium">{st.section}</TableCell>
                  <TableCell className="text-slate-600 text-xs capitalize">{st.gender}</TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant="outline"
                      className={`text-[11px] px-2 py-0.5 font-medium ${
                        st.sizeStatus === "completed"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}
                    >
                      {st.sizeStatus === "completed" ? "Completed" : "Pending"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center text-slate-800 text-xs font-semibold">
                    {st.orderParticipationCount > 0 ? (
                      <span className="text-indigo-700 font-semibold">{st.orderParticipationCount} order(s)</span>
                    ) : (
                      <span className="text-slate-400">None</span>
                    )}
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
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount} students
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
