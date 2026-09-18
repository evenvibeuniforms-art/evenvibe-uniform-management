"use client";

import React from "react";
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
import { User, FileText } from "lucide-react";

interface TcStudentDetailsDialogProps {
  tcStudent: TcStudentItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TcStudentDetailsDialog({
  tcStudent,
  open,
  onOpenChange,
}: TcStudentDetailsDialogProps) {
  if (!tcStudent) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 text-slate-900">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">
                TC Student Details
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                Transfer Certificate record for {tcStudent.student.student_name}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* TC Number Highlight */}
          <div className="p-4 bg-slate-900 text-white rounded-xl flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Transfer Certificate Number
              </p>
              <p className="text-xl font-bold text-white tracking-wide mt-0.5">
                {tcStudent.tc_number}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Record Created</p>
              <p className="text-xs font-medium text-slate-200 mt-0.5">
                {new Date(tcStudent.created_at).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>

          {/* Exactly 6 fields */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3.5">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200 text-slate-700 font-semibold text-xs uppercase tracking-wide">
              <User className="h-4 w-4 text-slate-500" />
              Student Information
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1">
                <Label className="text-xs text-slate-500 font-medium">
                  Student Name
                </Label>
                <Input
                  value={tcStudent.student.student_name}
                  readOnly
                  disabled
                  className="bg-white text-slate-900 font-medium"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-slate-500 font-medium">
                  Admission Number
                </Label>
                <Input
                  value={tcStudent.student.admission_number}
                  readOnly
                  disabled
                  className="bg-white text-slate-900 font-medium"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-slate-500 font-medium">
                  Class
                </Label>
                <Input
                  value={tcStudent.student.class_name}
                  readOnly
                  disabled
                  className="bg-white text-slate-900 font-medium"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-slate-500 font-medium">
                  Section
                </Label>
                <Input
                  value={tcStudent.student.section}
                  readOnly
                  disabled
                  className="bg-white text-slate-900 font-medium"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs text-slate-500 font-medium">
                  Gender
                </Label>
                <Input
                  value={tcStudent.student.gender}
                  readOnly
                  disabled
                  className="bg-white text-slate-900 font-medium"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-3 border-t border-slate-100">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
