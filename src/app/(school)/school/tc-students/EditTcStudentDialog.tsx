"use client";

import React, { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { TcStudentItem } from "./schema";
import { updateTcStudent } from "./actions";
import { Edit2, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

interface EditTcStudentDialogProps {
  tcStudent: TcStudentItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface EditFormProps {
  tcStudent: TcStudentItem;
  onClose: () => void;
  onSuccess?: () => void;
}

function EditTcStudentForm({ tcStudent, onClose, onSuccess }: EditFormProps) {
  const [tcDate, setTcDate] = useState(tcStudent.tc_date || "");
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const trimmed = tcDate.trim();
    if (!trimmed) {
      setErrorMsg("TC Date is required.");
      return;
    }

    startTransition(async () => {
      const res = await updateTcStudent(tcStudent.id, {
        tc_date: trimmed,
      });

      if (!res.success) {
        setErrorMsg(res.error || "Failed to update TC record.");
      } else {
        setSuccessMsg("TC date updated successfully.");
        setTimeout(() => {
          onClose();
          if (onSuccess) {
            onSuccess();
          }
        }, 800);
      }
    });
  };

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2 text-slate-900">
          <div className="p-2 rounded-lg bg-amber-50 text-status-warning">
            <Edit2 className="h-5 w-5" />
          </div>
          <div>
            <DialogTitle className="text-xl font-bold">
              Edit TC Date
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-0.5">
              Update Transfer Certificate date for {tcStudent.student.student_name}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      {errorMsg && (
        <div className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          <AlertCircle className="h-5 w-5 text-status-error shrink-0 mt-0.5" />
          <div className="flex-1">{errorMsg}</div>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2.5 p-3.5 bg-evenvibe-light border border-emerald-200 text-evenvibe-deep rounded-lg text-sm">
          <CheckCircle2 className="h-5 w-5 text-status-success shrink-0" />
          <div className="flex-1 font-medium">{successMsg}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        {/* 5 READ-ONLY STUDENT FIELDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
          <div>
            <span className="text-slate-500 block">Student Name:</span>
            <span className="font-semibold text-slate-800 text-sm">
              {tcStudent.student.student_name}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Admission Number:</span>
            <span className="font-semibold text-slate-800 text-sm">
              {tcStudent.student.admission_number}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Class:</span>
            <span className="font-semibold text-slate-800 text-sm">
              {tcStudent.student.class_name}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Section:</span>
            <span className="font-semibold text-slate-800 text-sm">
              {tcStudent.student.section}
            </span>
          </div>
          <div className="sm:col-span-2">
            <span className="text-slate-500 block">Gender:</span>
            <span className="font-semibold text-slate-800 text-sm">
              {tcStudent.student.gender}
            </span>
          </div>
        </div>

        {/* EDITABLE TC DATE */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="edit_tc_date" className="text-sm font-semibold text-slate-900">
              TC Date *
            </Label>
            <span className="text-xs text-status-error font-medium">Required</span>
          </div>
          <Input
            id="edit_tc_date"
            type="date"
            value={tcDate}
            onChange={(e) => setTcDate(e.target.value)}
            className="bg-white"
            required
            autoFocus
          />
          <p className="text-xs text-slate-500">
            Date of Transfer Certificate issuance.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t border-slate-100">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isPending || !tcDate.trim()}
            className="bg-status-warning hover:bg-amber-700 text-white font-medium"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function EditTcStudentDialog({
  tcStudent,
  open,
  onOpenChange,
  onSuccess,
}: EditTcStudentDialogProps) {
  if (!tcStudent) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <EditTcStudentForm
          key={tcStudent.id + (tcStudent.tc_date || "")}
          tcStudent={tcStudent}
          onClose={() => onOpenChange(false)}
          onSuccess={onSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}
