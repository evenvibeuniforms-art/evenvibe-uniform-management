"use client";

import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { getAdminStudents } from "./actions";
import { toast } from "sonner";

interface ExportButtonProps {
  filters: Record<string, unknown>;
}

export function ExportButton({ filters }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      
      // Fetch all students matching the current filters (without pagination limit)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { students } = await getAdminStudents({ ...filters as any, page: 1, limit: 10000 });
      
      if (!students || students.length === 0) {
        toast.error("No students found to export.");
        return;
      }

      const exportData = students.map((s: Record<string, unknown>) => ({
        "Student Name": s.student_name,
        "Admission Number": s.admission_number,
        "School": s.school_name,
        "Class": s.class_name,
        "Section": s.section || "N/A",
        "Gender": s.gender,
        "Size Status": s.sizeStatus
      }));

      const XLSX = await import("xlsx");
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Students");
      
      const fileName = `students_export_${filters.school_id}_${filters.class_name}_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      XLSX.writeFile(workbook, fileName.replace(/\s+/g, '_'));

      toast.success(`Exported ${students.length} students.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to export data");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button variant="outline" onClick={handleExport} disabled={isExporting}>
      {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
      Export
    </Button>
  );
}
