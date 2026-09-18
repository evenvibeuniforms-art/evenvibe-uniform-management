"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export interface ClassProgressData {
  className: string;
  section: string;
  total: number;
  completed: number;
  pending: number;
  progressPercentage: number;
}

interface ClassSectionProgressProps {
  data: ClassProgressData[];
}

export function ClassSectionProgress({ data }: ClassSectionProgressProps) {
  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-lg">Class-wise Progress</CardTitle>
            <CardDescription>Size collection status by class and section</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="font-semibold text-slate-700">Class</TableHead>
                <TableHead className="font-semibold text-slate-700">Section</TableHead>
                <TableHead className="font-semibold text-slate-700 text-center">Total</TableHead>
                <TableHead className="font-semibold text-slate-700 text-center">Collected</TableHead>
                <TableHead className="font-semibold text-slate-700 text-center">Pending</TableHead>
                <TableHead className="font-semibold text-slate-700 w-1/4">Progress</TableHead>
                <TableHead className="font-semibold text-slate-700 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length > 0 ? (
                data.map((row) => (
                  <TableRow key={`${row.className}-${row.section}`} className="hover:bg-slate-50/50">
                    <TableCell className="font-medium text-slate-900">{row.className || "Unassigned"}</TableCell>
                    <TableCell className="text-slate-600">{row.section || "-"}</TableCell>
                    <TableCell className="text-center font-medium">{row.total}</TableCell>
                    <TableCell className="text-center text-emerald-600 font-medium">{row.completed}</TableCell>
                    <TableCell className="text-center">
                      {row.pending > 0 ? (
                        <span className="text-amber-600 font-medium">{row.pending}</span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div 
                            className={`h-2 rounded-full ${row.progressPercentage === 100 ? 'bg-emerald-500' : 'bg-amber-400'}`} 
                            style={{ width: `${row.progressPercentage}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-slate-700 w-8">{row.progressPercentage}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link 
                        href="/school/sizes"
                        className="inline-flex items-center text-xs font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md"
                      >
                        Collect <ArrowRight className="ml-1.5 h-3 w-3" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-slate-500 bg-white">
                    No classes found. Add students to see progress.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
