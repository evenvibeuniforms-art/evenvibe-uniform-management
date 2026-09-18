"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { getAdminStudentDetails } from "./actions";
import { AdminSizeForm } from "./AdminSizeForm";

import { Loader2 } from "lucide-react";

interface AdminStudentDetailsDialogProps {
  studentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSizeUpdated?: () => void;
}

export function AdminStudentDetailsDialog({
  studentId,
  open,
  onOpenChange,
  onSizeUpdated,
}: AdminStudentDetailsDialogProps) {
  const [loading, setLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      if (!studentId || !open) return;
      setLoading(true);
      setError(null);
      try {
        const details = await getAdminStudentDetails(studentId);
        setData(details);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load student details");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [studentId, open]);

  const handleSuccess = () => {
    onSizeUpdated?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Student Details</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : error ? (
          <div className="p-4 bg-red-50 text-red-600 rounded-md">
            {error}
          </div>
        ) : data?.student ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-500">Student Name</p>
                <p className="font-medium">{data.student.student_name}</p>
              </div>
              <div>
                <p className="text-slate-500">Admission Number</p>
                <p className="font-medium">{data.student.admission_number}</p>
              </div>
              <div>
                <p className="text-slate-500">School</p>
                <p className="font-medium">{data.student.school_name}</p>
              </div>
              <div>
                <p className="text-slate-500">Class & Section</p>
                <p className="font-medium">
                  {data.student.class_name} {data.student.section ? ` - ${data.student.section}` : ""}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Gender</p>
                <p className="font-medium">{data.student.gender}</p>
              </div>
              <div>
                <p className="text-slate-500">Created Date</p>
                <p className="font-medium">
                  {new Date(data.student.created_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Size Status</p>
                <div>
                  {!data.sizeRecord ? (
                    <Badge variant="secondary">Not Started</Badge>
                  ) : data.sizeRecord.is_complete ? (
                    <Badge className="bg-green-600 hover:bg-green-700">Complete</Badge>
                  ) : (
                    <Badge variant="destructive">Pending</Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-lg font-medium mb-4">Uniform Sizes</h3>
              
              {!data.config ? (
                <div className="p-4 bg-slate-50 text-slate-600 rounded-md border border-slate-200">
                  No uniform configuration is available for this class.
                </div>
              ) : (
                <AdminSizeForm
                  studentId={data.student.id}
                  config={data.config}
                  sizeRecord={data.sizeRecord}
                  onSuccess={handleSuccess}
                />
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
