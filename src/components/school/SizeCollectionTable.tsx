"use client";
import { AllConfigItem, ActiveStyleItem } from "@/app/(school)/school/sizes/actions";

import { useState } from "react";
import { StudentWithSize } from "@/app/(school)/school/sizes/schema";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Edit2, PlusCircle } from "lucide-react";
import { SizeFormDialog } from "./SizeFormDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MobileCard, MobileCardField, MobileCardActions } from "@/components/ui/mobile-card";
import { formatDateTimeIST } from "@/lib/utils";

interface SizeCollectionTableProps {
  students: StudentWithSize[];
  configurations: AllConfigItem[];
  activeStyles?: ActiveStyleItem[];
}

export function SizeCollectionTable({ students, configurations, activeStyles = [] }: SizeCollectionTableProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [uniformFilter, setUniformFilter] = useState("all");

  const filteredStudents = students.filter(s => {
    // Search
    const searchMatch = (s.student_name?.toLowerCase() || "").includes(search.toLowerCase()) ||
                        (s.admission_number?.toLowerCase() || "").includes(search.toLowerCase());
    if (!searchMatch) return false;

    // Filters
    
    // Status
    if (statusFilter === "complete" && !s.size_record?.is_complete) return false;
    if (statusFilter === "pending" && s.size_record?.is_complete) return false;

    // Uniform type
    if (uniformFilter !== "all" && s.size_record?.uniform_type !== uniformFilter) return false;

    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4">
        {/* Search & Filters */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input 
              type="search" 
              placeholder="Search by name or admission no..." 
              className="pl-9 bg-white"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          <div className="flex flex-wrap gap-2 w-full md:w-auto">


            <Select value={uniformFilter} onValueChange={(v) => { if (v) setUniformFilter(v); }}>
              <SelectTrigger className="w-[150px] bg-white">
                <SelectValue placeholder="Uniform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Uniforms</SelectItem>
                <SelectItem value="regular">Regular</SelectItem>
                <SelectItem value="tshirt">T-Shirt</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v) => { if (v) setStatusFilter(v); }}>
              <SelectTrigger className="w-[130px] bg-white">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Desktop Main Table */}
      <div className="hidden md:block rounded-md border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="font-semibold text-slate-700">Student</TableHead>
              <TableHead className="font-semibold text-slate-700">Class & Sec</TableHead>
              <TableHead className="font-semibold text-slate-700">Adm. No</TableHead>
              <TableHead className="font-semibold text-slate-700">Gender</TableHead>
              <TableHead className="font-semibold text-slate-700">Uniform Type</TableHead>
              <TableHead className="font-semibold text-slate-700">Status</TableHead>
              <TableHead className="text-right font-semibold text-slate-700">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStudents.length > 0 ? (
              filteredStudents.map((student) => (
                <TableRow key={student.id}>
                  <TableCell className="font-medium text-slate-900">{student.student_name}</TableCell>
                  <TableCell className="text-slate-600">{student.class_name}-{student.section}</TableCell>
                  <TableCell className="text-slate-600">{student.admission_number}</TableCell>
                  <TableCell className="text-slate-600 capitalize">{student.gender || "-"}</TableCell>
                  <TableCell className="text-slate-600">
                    {student.size_record?.uniform_type === "regular" ? "Regular Uniform" : 
                     student.size_record?.uniform_type === "tshirt" ? "T-Shirt Uniform" : "-"}
                  </TableCell>
                  <TableCell>
                    {student.size_record?.is_complete ? (
                      <div className="space-y-0.5">
                        <Badge variant="outline" className="bg-evenvibe-light text-evenvibe-deep border-emerald-200">Complete</Badge>
                        <p className="text-[11px] text-slate-500 whitespace-nowrap">
                          {student.size_record.updated_at ? `Updated: ${formatDateTimeIST(student.size_record.updated_at)}` : "Date not available"}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Pending</Badge>
                        <p className="text-[11px] text-slate-400 whitespace-nowrap">
                          No size collected yet
                        </p>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <SizeFormDialog 
                      student={student}
                      configurations={configurations}
                      activeStyles={activeStyles}
                      trigger={
                        <Button variant={student.size_record ? "outline" : "default"} size="sm">
                          {student.size_record ? (
                            <><Edit2 className="w-3 h-3 mr-2" /> Edit Size</>
                          ) : (
                            <><PlusCircle className="w-3 h-3 mr-2" /> Collect Size</>
                          )}
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                  No students found matching your filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {filteredStudents.length > 0 ? (
          filteredStudents.map((student) => {
            const uniformLabel =
              student.size_record?.uniform_type === "regular"
                ? "Regular Uniform"
                : student.size_record?.uniform_type === "tshirt"
                ? "T-Shirt Uniform"
                : "-";

            return (
              <MobileCard key={student.id}>
                <MobileCardField label="Student" value={student.student_name} />
                <MobileCardField label="Class & Sec" value={`${student.class_name || ""}-${student.section || ""}`} />
                <MobileCardField label="Adm. No" value={student.admission_number || "-"} />
                <MobileCardField label="Gender" value={student.gender || "-"} />
                <MobileCardField label="Uniform Type" value={uniformLabel} />
                <MobileCardField label="Status">
                  {student.size_record?.is_complete ? (
                    <Badge variant="outline" className="bg-evenvibe-light text-evenvibe-deep border-emerald-200">Complete</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Pending</Badge>
                  )}
                </MobileCardField>
                <MobileCardField
                  label="Last Updated"
                  value={
                    student.size_record?.is_complete ? (
                      <span className="text-xs text-slate-700 font-medium">
                        {student.size_record.updated_at ? formatDateTimeIST(student.size_record.updated_at) : "Date not available"}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 italic">No size collected yet</span>
                    )
                  }
                />
                <MobileCardActions label="Action">
                  <SizeFormDialog 
                    student={student}
                    configurations={configurations}
                    activeStyles={activeStyles}
                    trigger={
                      <Button variant={student.size_record ? "outline" : "default"} size="sm">
                        {student.size_record ? (
                          <><Edit2 className="w-3 h-3 mr-2" /> Edit Size</>
                        ) : (
                          <><PlusCircle className="w-3 h-3 mr-2" /> Collect Size</>
                        )}
                      </Button>
                    }
                  />
                </MobileCardActions>
              </MobileCard>
            );
          })
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500 text-sm">
            No students found matching your filters.
          </div>
        )}
      </div>
    </div>
  );
}

