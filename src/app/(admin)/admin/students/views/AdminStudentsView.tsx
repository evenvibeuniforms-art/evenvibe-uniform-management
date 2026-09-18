"use client";

import { useState } from "react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronLeft, Eye, X } from "lucide-react";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ExportButton } from "../ExportButton";
import { AdminStudentDetailsDialog } from "../AdminStudentDetailsDialog";
import { useRealtimeRefresh } from "@/lib/supabase/useRealtime";

type Student = {
  id: string;
  student_name: string;
  admission_number: string;
  class_name: string;
  section: string;
  gender: string;
  created_at: string;
  school_id: string;
  school_name: string;
  sizeStatus: string;
  isComplete: boolean;
};

export function AdminStudentsView({ 
  initialStudents, 
  schoolId,
  schoolName,
  className,
  filters, 
  totalCount 
}: { 
  initialStudents: Student[];
  schoolId: string;
  schoolName: string;
  className: string;
  filters: {
    search?: string;
    section?: string;
    gender?: string;
    size_status?: string;
    page?: number;
    limit?: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  };
  totalCount: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useRealtimeRefresh({
    table: "students",
    filter: `school_id=eq.${schoolId}`,
  });

  const [search, setSearch] = useState(filters.search || "");
  const [section, setSection] = useState<string>((filters.section as string) || "all");
  const [gender, setGender] = useState<string>((filters.gender as string) || "all");
  const [sizeStatus, setSizeStatus] = useState<string>((filters.size_status as string) || "all");

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const currentPage = Number(filters.page) || 1;
  const currentLimit = Number(filters.limit) || 50;

  const updateFilters = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all" || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    // reset page
    params.delete("page");
    router.push(`?${params.toString()}`);
  };

  const handleSearch = () => {
    updateFilters("search", search);
  };

  const clearSearch = () => {
    setSearch("");
    updateFilters("search", "");
  };

  const handleSort = (field: string) => {
    const currentSort = searchParams.get("sortBy");
    const currentOrder = searchParams.get("sortOrder") || "asc";
    const params = new URLSearchParams(searchParams.toString());
    
    if (currentSort === field) {
      params.set("sortOrder", currentOrder === "asc" ? "desc" : "asc");
    } else {
      params.set("sortBy", field);
      params.set("sortOrder", "asc");
    }
    router.push(`?${params.toString()}`);
  };

  const getSortIcon = (field: string) => {
    const currentSort = searchParams.get("sortBy") || "student_name";
    const currentOrder = searchParams.get("sortOrder") || "asc";
    
    if (currentSort !== field) return null;
    return currentOrder === "asc" ? " ↑" : " ↓";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Link 
          href={`/admin/students?school_id=${schoolId}`} 
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Classes
        </Link>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-500 font-medium mb-6">
        <div>
          <span>Manage Students</span>
          <span className="mx-2">/</span>
          <span>{schoolName}</span>
          <span className="mx-2">/</span>
          <span className="text-slate-900">{className}</span>
        </div>
        <ExportButton filters={filters} />
      </div>

      <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-end bg-white p-4 rounded-lg border shadow-sm">
        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <label className="text-sm font-medium mb-1.5 block">Search Student</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input 
                placeholder="Name or Admission No..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pr-8"
              />
              {search && (
                <button 
                  onClick={clearSearch}
                  className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button onClick={handleSearch} variant="secondary">
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Section */}
        <div className="w-[120px]">
          <label className="text-sm font-medium mb-1.5 block">Section</label>
          <Select 
            value={section} 
            onValueChange={(val) => { setSection(val as string); updateFilters("section", val as string); }}
          >
            <SelectTrigger aria-label="Filter by Section">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {Array.from({ length: 6 }, (_, i) => String.fromCharCode(65 + i)).map(sec => (
                <SelectItem key={sec} value={sec}>{sec}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Gender */}
        <div className="w-[120px]">
          <label className="text-sm font-medium mb-1.5 block">Gender</label>
          <Select 
            value={gender} 
            onValueChange={(val) => { setGender(val as string); updateFilters("gender", val as string); }}
          >
            <SelectTrigger aria-label="Filter by Gender">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="Male">Male</SelectItem>
              <SelectItem value="Female">Female</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Size Status */}
        <div className="w-[160px]">
          <label className="text-sm font-medium mb-1.5 block">Size Status</label>
          <Select 
            value={sizeStatus} 
            onValueChange={(val) => { setSizeStatus(val as string); updateFilters("size_status", val as string); }}
          >
            <SelectTrigger aria-label="Filter by Size Status">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="COMPLETE">Complete</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="NOT_STARTED">Not Started</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-white rounded-md border shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead 
                className="cursor-pointer hover:bg-slate-100"
                onClick={() => handleSort("student_name")}
              >
                Student Name {getSortIcon("student_name")}
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-slate-100"
                onClick={() => handleSort("admission_number")}
              >
                Admission No {getSortIcon("admission_number")}
              </TableHead>
              <TableHead>Section</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-slate-100"
                onClick={() => handleSort("sizeStatus")}
              >
                Size Status {getSortIcon("sizeStatus")}
              </TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialStudents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                  No students found matching your criteria.
                </TableCell>
              </TableRow>
            ) : (
              initialStudents.map((student) => (
                <TableRow key={student.id}>
                  <TableCell className="font-medium text-slate-900">
                    {student.student_name}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded text-slate-600">
                      {student.admission_number}
                    </span>
                  </TableCell>
                  <TableCell>{student.section || "N/A"}</TableCell>
                  <TableCell>{student.gender}</TableCell>
                  <TableCell>
                    <Badge 
                      variant={
                        student.sizeStatus === "COMPLETE" ? "default" :
                        student.sizeStatus === "PENDING" ? "secondary" : "outline"
                      }
                      className={
                        student.sizeStatus === "COMPLETE" ? "bg-emerald-500" :
                        student.sizeStatus === "PENDING" ? "bg-amber-500 text-white hover:bg-amber-600" : ""
                      }
                    >
                      {student.sizeStatus.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setSelectedStudentId(student.id)}
                    >
                      <Eye className="h-4 w-4 mr-1.5" />
                      Manage Sizes
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      
      {/* Pagination summary */}
      <div className="flex justify-between items-center text-sm text-slate-500 mt-2 px-2">
        <span>Showing {initialStudents.length} of {totalCount} students</span>
        
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            disabled={currentPage <= 1}
            onClick={() => updateFilters("page", String(currentPage - 1))}
          >
            Previous
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            disabled={initialStudents.length < currentLimit}
            onClick={() => updateFilters("page", String(currentPage + 1))}
          >
            Next
          </Button>
        </div>
      </div>

      <AdminStudentDetailsDialog 
        studentId={selectedStudentId}
        open={!!selectedStudentId}
        onOpenChange={(open) => {
          if (!open) setSelectedStudentId(null);
        }}
        onSizeUpdated={() => router.refresh()}
      />
    </div>
  );
}
