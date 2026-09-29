"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { HistoryFilters } from "../types";
import { exportAcademicSizeHistoryData } from "../actions";

interface ExportHistoryButtonProps {
  filters: HistoryFilters;
}

export function ExportHistoryButton({ filters }: ExportHistoryButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    try {
      setIsExporting(true);

      const rows = await exportAcademicSizeHistoryData(filters);

      if (!rows || rows.length === 0) {
        toast.error("No historical size records found to export.");
        return;
      }

      const XLSX = await import("xlsx");
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Size History");

      const fileName =
        filters.academic_year && filters.academic_year !== "all"
          ? `academic-size-history-${filters.academic_year}.xlsx`
          : "academic-size-history.xlsx";

      XLSX.writeFile(workbook, fileName);
      toast.success(`Exported ${rows.length} size records to Excel.`);
    } catch (err: unknown) {
      console.error("Export error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to export Excel file.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      variant="outline"
      onClick={handleExport}
      disabled={isExporting}
      className="bg-white border-slate-300 text-slate-700 hover:bg-slate-50 text-xs h-9 shadow-2xs font-semibold w-full sm:w-auto"
    >
      {isExporting ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-evenvibe-primary" />
      ) : (
        <Download className="mr-2 h-4 w-4 text-evenvibe-primary" />
      )}
      Export Excel
    </Button>
  );
}
