"use client";

import { StudentWithSize } from "@/app/(school)/school/sizes/schema";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Edit2, PlusCircle } from "lucide-react";
import { SizeFormDialog } from "./SizeFormDialog";
import { UNIFORM_TYPES } from "@/lib/constants/uniformSizes";

interface PendingSizesTableProps {
  students: StudentWithSize[];
}

export function PendingSizesTable({ students }: PendingSizesTableProps) {
  const pendingStudents = students.filter(s => !s.size_record?.is_complete);

  if (pendingStudents.length === 0) {
    return (
      <div className="text-center py-8 bg-slate-50 border border-slate-100 rounded-lg text-slate-500">
        All students have complete size records!
      </div>
    );
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white shadow-sm overflow-x-auto">
      <Table>
        <TableHeader className="bg-slate-50">
          <TableRow>
            <TableHead className="font-semibold text-slate-700">Student</TableHead>
            <TableHead className="font-semibold text-slate-700">Class & Sec</TableHead>
            <TableHead className="font-semibold text-slate-700">Roll No</TableHead>
            <TableHead className="font-semibold text-slate-700">Uniform Type</TableHead>
            <TableHead className="font-semibold text-slate-700">Pending Items</TableHead>
            <TableHead className="text-right font-semibold text-slate-700">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pendingStudents.map((student) => {
            const record = student.size_record;
            const pendingItems: string[] = [];
            
            if (!record) {
              pendingItems.push("All");
            } else {
              if (record.uniform_type === UNIFORM_TYPES.REGULAR && !record.shirt_size) pendingItems.push("Shirt");
              if (record.uniform_type === UNIFORM_TYPES.TSHIRT && !record.tshirt_size) pendingItems.push("T-Shirt");
              if (!record.pant_size && !record.short_size) pendingItems.push("Pant / Short");
            }

            return (
              <TableRow key={student.id}>
                <TableCell className="font-medium text-slate-900">{student.student_name}</TableCell>
                <TableCell className="text-slate-600">{student.class_name}-{student.section}</TableCell>
                <TableCell className="text-slate-600">{student.roll_number}</TableCell>
                <TableCell className="text-slate-600">
                  {record?.uniform_type === "regular" ? "Regular" : 
                   record?.uniform_type === "tshirt" ? "T-Shirt" : "Not Selected"}
                </TableCell>
                <TableCell>
                  <span className="text-amber-600 text-sm font-medium bg-amber-50 px-2 py-1 rounded-md">
                    {pendingItems.join(", ")}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <SizeFormDialog 
                    student={student}
                    trigger={
                      <Button variant={record ? "outline" : "default"} size="sm">
                        {record ? (
                          <><Edit2 className="w-3 h-3 mr-2" /> Complete</>
                        ) : (
                          <><PlusCircle className="w-3 h-3 mr-2" /> Collect</>
                        )}
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
