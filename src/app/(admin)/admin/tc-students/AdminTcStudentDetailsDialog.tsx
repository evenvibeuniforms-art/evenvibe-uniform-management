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
import { AdminTcStudentItem } from "./actions";
import { User, School, FileText, Calendar } from "lucide-react";

interface AdminTcStudentDetailsDialogProps {
  tcStudent: AdminTcStudentItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminTcStudentDetailsDialog({
  tcStudent,
  open,
  onOpenChange,
}: AdminTcStudentDetailsDialogProps) {
  if (!tcStudent) return null;

  const formattedDate = tcStudent.tc_date
    ? new Date(tcStudent.tc_date + "T00:00:00").toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "Not Recorded";

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
          {/* Header Highlight Card */}
          <div className="p-4 bg-slate-900 text-white rounded-xl flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-slate-400 text-xs font-medium uppercase tracking-wider">
                <Calendar className="h-3.5 w-3.5" />
                Transfer Certificate Date
              </div>
              <p className="text-xl font-bold text-white tracking-wide mt-1">
                {formattedDate}
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

          {/* School Information */}
          <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50 space-y-2">
            <div className="flex items-center gap-2 text-slate-700 font-semibold text-xs uppercase tracking-wide">
              <School className="h-4 w-4 text-slate-500" />
              School Information
            </div>
            <div>
              <Label className="text-xs text-slate-500 font-medium">School Name</Label>
              <Input
                value={tcStudent.school.name}
                readOnly
                disabled
                className="bg-white text-slate-900 font-semibold mt-1"
              />
            </div>
          </div>

          {/* Student Information */}
          <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50 space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-slate-200 text-slate-700 font-semibold text-xs uppercase tracking-wide">
              <User className="h-4 w-4 text-slate-500" />
              Student Information
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
