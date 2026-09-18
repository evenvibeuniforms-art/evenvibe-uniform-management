import React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { SchoolOperationalSummary } from "../types";
import { ArrowRight, Building2, CheckCircle2, Clock, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface SchoolOverviewProps {
  schools: SchoolOperationalSummary[];
}

const formatIndianDate = (dateString: string | null) => {
  if (!dateString) return null;
  try {
    const d = new Date(dateString);
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
  } catch {
    return dateString;
  }
};

export default function SchoolOverview({ schools }: SchoolOverviewProps) {
  return (
    <Card className="border border-slate-200/80 shadow-xs bg-white">
      <CardHeader className="pb-3 flex flex-row items-center justify-between border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-emerald-600" />
            <CardTitle className="text-lg font-semibold text-slate-900">
              School Overview
            </CardTitle>
          </div>
          <CardDescription className="text-xs text-slate-500 mt-1">
            Partner schools, active student rosters, and latest uniform orders
          </CardDescription>
        </div>

        <Link
          href="/admin/schools"
          className="text-xs font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1 hover:underline"
        >
          Manage All Schools
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/70">
              <TableRow className="border-b border-slate-200/80">
                <TableHead className="text-xs font-semibold text-slate-600">School</TableHead>
                <TableHead className="w-[120px] text-xs font-semibold text-slate-600">Code</TableHead>
                <TableHead className="text-center text-xs font-semibold text-slate-600">Students</TableHead>
                <TableHead className="text-center text-xs font-semibold text-slate-600">Orders</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600">Latest Order</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600">Status</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schools.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-slate-500 text-sm">
                    No registered schools.
                  </TableCell>
                </TableRow>
              ) : (
                schools.map((school) => {
                  const formattedDate = formatIndianDate(school.latest_order_date);

                  return (
                    <TableRow key={school.id} className="hover:bg-slate-50/50 transition-colors">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">
                            {school.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {school.school_code}
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-sm font-semibold text-slate-800">
                        {school.students_count}
                      </TableCell>
                      <TableCell className="text-center text-sm font-semibold text-slate-800">
                        {school.orders_count}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {school.latest_order_number ? (
                          <div className="space-y-0.5">
                            <span className="font-semibold text-slate-900">
                              {school.latest_order_number}
                            </span>
                            {formattedDate && (
                              <div className="text-[11px] text-slate-400">
                                {formattedDate}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">No orders</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {school.is_active ? (
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-700 border-emerald-200 px-2 py-0.5 text-xs font-medium inline-flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Active
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-amber-50 text-amber-700 border-amber-200 px-2 py-0.5 text-xs font-medium inline-flex items-center gap-1"
                          >
                            <Clock className="w-3 h-3" />
                            Pending Approval
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href="/admin/schools"
                          className={cn(
                            buttonVariants({ variant: "ghost", size: "sm" }),
                            "text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 h-8 px-2.5 inline-flex items-center"
                          )}
                        >
                          Manage
                          <ExternalLink className="w-3 h-3 ml-1" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
