"use client";

import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Search, Edit2, Trash2, AlertCircle } from "lucide-react";
import { StudentFormDialog, Student } from "./StudentFormDialog";
import { deleteStudent } from "@/app/(school)/school/students/actions";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface StudentTableProps {
  students: Student[];
}

export function StudentTable({ students }: StudentTableProps) {
  const [search, setSearch] = useState("");
  const [studentToDelete, setStudentToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showMissingRoll, setShowMissingRoll] = useState(false);

  const missingRollCount = students.filter(s => !s.roll_number || s.roll_number.trim() === "").length;

  // Search filtering on client side (since data is already isolated to this school)
  const filteredStudents = students.filter(s => {
    const matchesSearch = (s.student_name?.toLowerCase() || "").includes(search.toLowerCase()) ||
                          (s.roll_number?.toLowerCase() || "").includes(search.toLowerCase());
    const matchesFilter = showMissingRoll ? (!s.roll_number || s.roll_number.trim() === "") : true;
    return matchesSearch && matchesFilter;
  });

  const handleDelete = async () => {
    if (!studentToDelete) return;
    setIsDeleting(true);
    await deleteStudent(studentToDelete);
    setIsDeleting(false);
    setStudentToDelete(null);
  };

  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 bg-white rounded-lg border border-slate-200 shadow-sm text-center">
        <div className="bg-slate-50 p-4 rounded-full mb-4">
          <Search className="h-8 w-8 text-slate-400" />
        </div>
        <h3 className="text-lg font-medium text-slate-900">No students added yet</h3>
        <p className="mt-1 text-slate-500 mb-6">Add students to begin managing uniform requirements.</p>
        <StudentFormDialog mode="add" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input 
            type="search" 
            placeholder="Search by name or roll no..." 
            className="pl-9 bg-white"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {missingRollCount > 0 && (
            <Button 
              variant={showMissingRoll ? "default" : "outline"}
              className={showMissingRoll ? "bg-amber-600 hover:bg-amber-700 text-white" : "text-amber-600 border-amber-200 hover:bg-amber-50"}
              onClick={() => setShowMissingRoll(!showMissingRoll)}
            >
              <AlertCircle className="w-4 h-4 mr-2" />
              Missing Roll No ({missingRollCount})
            </Button>
          )}
          <StudentFormDialog mode="add" />
        </div>
      </div>

      {/* Main Table */}
      <div className="rounded-md border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="font-semibold text-slate-700">Student Name</TableHead>
              <TableHead className="font-semibold text-slate-700">Roll No</TableHead>
              <TableHead className="font-semibold text-slate-700">Class & Sec</TableHead>
              <TableHead className="font-semibold text-slate-700">Gender</TableHead>
              <TableHead className="font-semibold text-slate-700">Status</TableHead>
              <TableHead className="text-right font-semibold text-slate-700">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStudents.length > 0 ? (
              filteredStudents.map((student) => {
                const isMissingRoll = !student.roll_number || student.roll_number.trim() === "";
                return (
                <TableRow key={student.id} className={isMissingRoll ? "bg-amber-50/50 hover:bg-amber-50" : ""}>
                  <TableCell className="font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      {student.student_name}
                      {isMissingRoll && (
                        <span title="Missing Roll Number">
                          <AlertCircle className="h-4 w-4 text-amber-500" />
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {isMissingRoll ? (
                      <span className="text-amber-600 font-medium text-xs bg-amber-100 px-2 py-1 rounded-full">Missing</span>
                    ) : (
                      student.roll_number
                    )}
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {student.class_name || "-"} {student.section ? `(${student.section})` : ""}
                  </TableCell>
                  <TableCell className="text-slate-600">{student.gender || "-"}</TableCell>
                  <TableCell>
                    {student.is_active ? (
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-normal">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 font-normal">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-8 w-8 p-0">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[160px]">
                        <StudentFormDialog 
                          mode="edit" 
                          initialData={student} 
                          trigger={
                            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="cursor-pointer">
                              <Edit2 className="mr-2 h-4 w-4 text-slate-500" />
                              <span>Edit</span>
                            </DropdownMenuItem>
                          } 
                        />
                        <DropdownMenuItem onClick={() => setStudentToDelete(student.id)} className="text-red-600 cursor-pointer">
                          <Trash2 className="mr-2 h-4 w-4" />
                          <span>Delete</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )})
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                  No students found matching your search.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!studentToDelete} onOpenChange={(open) => !open && setStudentToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Student?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this student? This action cannot be undone and will permanently remove this record.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setStudentToDelete(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete Student"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
