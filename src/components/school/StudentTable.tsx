"use client";

import { useState, useMemo, startTransition } from "react";
import { useRouter } from "next/navigation";
import { useRealtimeSubscription } from "@/lib/supabase/useRealtime";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Search, Edit2, Trash2 } from "lucide-react";
import { StudentFormDialog } from "./StudentFormDialog";
import { deleteStudent } from "@/app/(school)/school/students/actions";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface StudentWithSizeStatus {
  id: string;
  student_name: string;
  admission_number?: string;
  class_name?: string;
  section?: string;
  gender?: string;
  is_active: boolean;
  student_uniform_sizes?: { is_complete: boolean } | { is_complete: boolean }[];
}

interface StudentTableProps {
  students: StudentWithSizeStatus[];
}

export function StudentTable({ students: initialStudents }: StudentTableProps) {
  const router = useRouter();
  const [students, setStudents] = useState<StudentWithSizeStatus[]>(initialStudents);

  useRealtimeSubscription({
    table: "students",
    onEvent: (payload) => {
      if (payload.eventType === "UPDATE" && payload.new) {
        const updated = payload.new as Record<string, unknown>;
        setStudents((prev) =>
          prev.map((s) =>
            s.id === updated.id
              ? {
                  ...s,
                  student_name: (updated.student_name as string) ?? s.student_name,
                  admission_number: (updated.admission_number as string) ?? s.admission_number,
                  class_name: (updated.class_name as string) ?? s.class_name,
                  section: (updated.section as string) ?? s.section,
                  gender: (updated.gender as string) ?? s.gender,
                  is_active: typeof updated.is_active === "boolean" ? updated.is_active : s.is_active,
                }
              : s
          )
        );
      }
      startTransition(() => {
        router.refresh();
      });
    },
  });

  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [studentToDelete, setStudentToDelete] = useState<string | null>(null);
  const [studentToEdit, setStudentToEdit] = useState<StudentWithSizeStatus | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // Extract unique classes and sections for filters
  const uniqueClasses = useMemo(() => {
    const classes = new Set<string>();
    students.forEach(s => {
      if (s.class_name) classes.add(s.class_name.trim());
    });
    return Array.from(classes).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [students]);

  const uniqueSections = useMemo(() => {
    const sections = new Set<string>();
    students.forEach(s => {
      // If a class is selected, only show sections for that class
      if (classFilter !== "all" && s.class_name?.trim() !== classFilter) return;
      if (s.section) sections.add(s.section.trim());
    });
    return Array.from(sections).sort();
  }, [students, classFilter]);

  // Handle class filter change
  const handleClassChange = (value: string | null) => {
    setClassFilter(value || "all");
    // Reset section filter when class changes if the current section is not in the new class
    setSectionFilter("all"); 
  };

  // Search and Filter filtering on client side
  const filteredStudents = students.filter(s => {
    const matchesSearch = (s.student_name?.toLowerCase() || "").includes(search.toLowerCase()) ||
                          (s.admission_number?.toLowerCase() || "").includes(search.toLowerCase()) ||
                          (s.class_name?.toLowerCase() || "").includes(search.toLowerCase()) ||
                          (s.section?.toLowerCase() || "").includes(search.toLowerCase());
    
    const matchesClass = classFilter === "all" || s.class_name?.trim() === classFilter;
    const matchesSection = sectionFilter === "all" || s.section?.trim() === sectionFilter;

    return matchesSearch && matchesClass && matchesSection;
  });

  const handleDelete = async () => {
    if (!studentToDelete) return;
    setIsDeleting(true);
    await deleteStudent(studentToDelete);
    setIsDeleting(false);
    setStudentToDelete(null);
  };



  const getStatusBadge = (isComplete: boolean) => {
    if (isComplete) {
      return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Completed</Badge>;
    }
    return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Pending</Badge>;
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
      <div className="flex flex-col lg:flex-row gap-4 justify-between">
        
        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-3 w-full lg:max-w-3xl">
          <div className="relative w-full sm:max-w-[280px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input 
              type="search" 
              placeholder="Search students..." 
              className="pl-9 bg-white"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Select value={classFilter} onValueChange={handleClassChange}>
            <SelectTrigger className="w-full sm:w-[160px] bg-white">
              <SelectValue placeholder="All Classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {uniqueClasses.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sectionFilter} onValueChange={(val) => setSectionFilter(val || "all")}>
            <SelectTrigger className="w-full sm:w-[160px] bg-white">
              <SelectValue placeholder="All Sections" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sections</SelectItem>
              {uniqueSections.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <StudentFormDialog mode="add" />
        </div>
      </div>

      {/* Main Table */}
      <div className="rounded-md border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="font-semibold text-slate-700">Student Name</TableHead>
              <TableHead className="font-semibold text-slate-700">Adm. Number</TableHead>
              <TableHead className="font-semibold text-slate-700">Class</TableHead>
              <TableHead className="font-semibold text-slate-700">Section</TableHead>
              <TableHead className="font-semibold text-slate-700">Gender</TableHead>
              <TableHead className="font-semibold text-slate-700">Size Status</TableHead>
              <TableHead className="text-right font-semibold text-slate-700">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStudents.length > 0 ? (
              filteredStudents.map((student) => {
                // Determine size completion status
                const sizeRecord = Array.isArray(student.student_uniform_sizes) 
                  ? student.student_uniform_sizes[0] 
                  : student.student_uniform_sizes;
                const isComplete = sizeRecord?.is_complete || false;

                return (
                <TableRow key={student.id}>
                  <TableCell className="font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      {student.student_name}
                      {!student.is_active && (
                        <Badge variant="outline" className="ml-1 bg-slate-50 text-slate-500 border-slate-200 text-[10px] uppercase font-bold py-0 h-4">Inactive</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {student.admission_number || "-"}
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {student.class_name || "-"}
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {student.section || "-"}
                  </TableCell>
                  <TableCell className="text-slate-600">{student.gender || "-"}</TableCell>
                  <TableCell>
                    {getStatusBadge(isComplete)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-8 w-8 p-0">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[160px]">
                        <DropdownMenuItem 
                          onClick={() => setStudentToEdit(student)} 
                          className="cursor-pointer"
                        >
                          <Edit2 className="mr-2 h-4 w-4 text-slate-500" />
                          <span>Edit</span>
                        </DropdownMenuItem>
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
                <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                  No students found matching your filters.
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

      {/* Edit Student Dialog */}
      {studentToEdit && (
        <StudentFormDialog
          mode="edit"
          initialData={{
            id: studentToEdit.id,
            student_name: studentToEdit.student_name,
            admission_number: studentToEdit.admission_number,
            class_name: studentToEdit.class_name,
            section: studentToEdit.section,
            gender: studentToEdit.gender,
            is_active: studentToEdit.is_active,
          }}
          open={!!studentToEdit}
          onOpenChange={(open) => {
            if (!open) setStudentToEdit(null);
          }}
        />
      )}

    </div>
  );
}
