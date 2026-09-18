"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { exportCompleteReportToExcel } from "../../actions";
import { GlobalReportFilters } from "../../types";

interface ExportReportButtonProps {
  tabName: string;
  tabLabel: string;
  filters: GlobalReportFilters;
}

export function ExportReportButton({ tabName, tabLabel, filters }: ExportReportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await exportCompleteReportToExcel(tabName, filters);
      if ("error" in res) {
        toast.error(res.error);
      } else {
        // Trigger browser download via data uri
        const link = document.createElement("a");
        link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${res.base64}`;
        link.download = res.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success(`${tabLabel} exported successfully!`);
      }
    } catch {
      toast.error("Failed to export report");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={isExporting}
      className="h-9 gap-1.5 border-slate-300 hover:bg-slate-50 text-xs font-medium text-slate-700 shadow-sm"
    >
      {isExporting ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
          <span>Exporting...</span>
        </>
      ) : (
        <>
          <Download className="h-3.5 w-3.5 text-emerald-600" />
          <span>Export Excel</span>
        </>
      )}
    </Button>
  );
}
