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
import { TcStudentItem } from "./schema";
import { deleteTcStudent } from "./actions";
import { Trash2, Loader2, AlertCircle } from "lucide-react";

interface DeleteTcStudentDialogProps {
  tcStudent: TcStudentItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function DeleteTcStudentDialog({
  tcStudent,
  open,
  onOpenChange,
  onSuccess,
}: DeleteTcStudentDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!tcStudent) return null;

  const handleDelete = () => {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await deleteTcStudent(tcStudent.id);
      if (!res.success) {
        setErrorMsg(res.error || "Failed to remove TC student record.");
      } else {
        onOpenChange(false);
        if (onSuccess) {
          onSuccess();
        }
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-red-600">
            <div className="p-2 rounded-lg bg-red-50">
              <Trash2 className="h-5 w-5 text-red-600" />
            </div>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Remove TC Record
            </DialogTitle>
          </div>
          <DialogDescription className="text-slate-600 pt-2 text-sm">
            Are you sure you want to remove this TC student record?
          </DialogDescription>
        </DialogHeader>

        {errorMsg && (
          <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1">{errorMsg}</div>
          </div>
        )}

        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 text-xs">
          <div>
            <span className="text-slate-500">Student: </span>
            <span className="font-semibold text-slate-900">
              {tcStudent.student.student_name}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Admission No: </span>
            <span className="font-semibold text-slate-800">
              {tcStudent.student.admission_number}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Class & Section: </span>
            <span className="font-semibold text-slate-800">
              {tcStudent.student.class_name} - {tcStudent.student.section}
            </span>
          </div>
          <div>
            <span className="text-slate-500">TC Number: </span>
            <span className="font-semibold text-slate-900">
              {tcStudent.tc_number}
            </span>
          </div>
        </div>

        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          <p className="font-medium">Note regarding student data:</p>
          <p className="mt-0.5 text-amber-700">
            Removing this Transfer Certificate record will <strong>NOT</strong> delete or modify the actual student profile in your school.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
            className="bg-red-600 hover:bg-red-700 text-white font-medium"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Removing...
              </>
            ) : (
              "Yes, Remove TC Record"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
