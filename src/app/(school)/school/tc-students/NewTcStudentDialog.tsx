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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Search, Loader2, AlertCircle, CheckCircle2, UserCheck, X } from "lucide-react";
import { getEligibleStudentsForTc, createTcStudent } from "./actions";
import { EligibleStudent } from "./schema";

interface NewTcStudentDialogProps {
  onSuccess?: () => void;
}

export function NewTcStudentDialog({ onSuccess }: NewTcStudentDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Student selection state
  const [students, setStudents] = useState<EligibleStudent[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<EligibleStudent | null>(null);

  // TC Number state
  const [tcNumber, setTcNumber] = useState("");

  // Feedback states
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleOpenDialog = () => {
    setSelectedStudent(null);
    setStudentSearch("");
    setTcNumber("");
    setErrorMsg(null);
    setSuccessMsg(null);
    setOpen(true);
    setLoadingStudents(true);

    getEligibleStudentsForTc()
      .then((res) => {
        if (res.success) {
          setStudents(res.students);
        } else {
          setErrorMsg(res.error || "Failed to load eligible students.");
        }
        setLoadingStudents(false);
      })
      .catch((err) => {
        console.error("Error loading eligible students:", err);
        setErrorMsg("Failed to load eligible students.");
        setLoadingStudents(false);
      });
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setSelectedStudent(null);
      setStudentSearch("");
      setTcNumber("");
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  };

  // Filter students based on search term
  const filteredStudents = students.filter((s) => {
    if (!studentSearch.trim()) return true;
    const term = studentSearch.toLowerCase().trim();
    return (
      s.student_name.toLowerCase().includes(term) ||
      s.admission_number.toLowerCase().includes(term) ||
      s.class_name.toLowerCase().includes(term) ||
      s.section.toLowerCase().includes(term)
    );
  });

  const handleSelectStudent = (student: EligibleStudent) => {
    setSelectedStudent(student);
    setStudentSearch("");
    setErrorMsg(null);
  };

  const handleDeselectStudent = () => {
    setSelectedStudent(null);
    setTcNumber("");
    setErrorMsg(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!selectedStudent) {
      setErrorMsg("Please select an existing student.");
      return;
    }

    const trimmedTc = tcNumber.trim();
    if (!trimmedTc) {
      setErrorMsg("TC Number is required.");
      return;
    }

    startTransition(async () => {
      const res = await createTcStudent({
        student_id: selectedStudent.id,
        tc_number: trimmedTc,
      });

      if (!res.success) {
        setErrorMsg(res.error || "Failed to create TC student record.");
      } else {
        setSuccessMsg("TC student added successfully.");
        setTimeout(() => {
          setOpen(false);
          if (onSuccess) {
            onSuccess();
          }
        }, 800);
      }
    });
  };

  return (
    <>
      <Button
        type="button"
        onClick={handleOpenDialog}
        className="bg-slate-900 hover:bg-slate-800 text-white shadow-sm flex items-center gap-1.5"
      >
        <Plus className="h-4 w-4" />
        <span>Add TC Student</span>
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-slate-900">
            Add TC Student
          </DialogTitle>
          <DialogDescription className="text-slate-500">
            Select an existing student from your school and enter their issued Transfer Certificate (TC) Number.
          </DialogDescription>
        </DialogHeader>

        {errorMsg && (
          <div className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1">{errorMsg}</div>
          </div>
        )}

        {successMsg && (
          <div className="flex items-center gap-2.5 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
            <div className="flex-1 font-medium">{successMsg}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* STEP 1: Select Student */}
          {!selectedStudent ? (
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-slate-800">
                Select Existing Student *
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  type="search"
                  placeholder="Search by student name or admission number..."
                  className="pl-9 bg-white"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  disabled={loadingStudents}
                />
              </div>

              {loadingStudents ? (
                <div className="flex items-center justify-center py-8 text-slate-500 text-sm gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                  Loading eligible students...
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="p-6 text-center bg-slate-50 border border-dashed border-slate-200 rounded-lg text-sm text-slate-500">
                  {students.length === 0
                    ? "No eligible students found in your school or all students already have TC records."
                    : "No students matching your search."}
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg max-h-56 overflow-y-auto divide-y divide-slate-100 bg-white">
                  {filteredStudents.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => handleSelectStudent(st)}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 transition-colors flex items-center justify-between group"
                    >
                      <div>
                        <p className="font-medium text-slate-900 group-hover:text-blue-600 text-sm">
                          {st.student_name}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Adm No: <span className="font-medium text-slate-700">{st.admission_number}</span> &bull; {st.class_name} - {st.section} &bull; {st.gender}
                        </p>
                      </div>
                      <span className="text-xs font-medium text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                        Select
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Selected Student Information (READ-ONLY) */}
              <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-lg flex items-start justify-between">
                <div className="flex items-start gap-2.5">
                  <UserCheck className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-blue-900 uppercase tracking-wide">
                      Selected Student
                    </p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">
                      {selectedStudent.student_name}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDeselectStudent}
                  className="h-8 text-xs text-slate-600 hover:text-red-600 hover:bg-red-50 flex items-center gap-1"
                >
                  <X className="h-3.5 w-3.5" />
                  Change
                </Button>
              </div>

              {/* 5 READ-ONLY FIELDS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600">
                    Student Name
                  </Label>
                  <Input
                    value={selectedStudent.student_name}
                    readOnly
                    disabled
                    className="bg-slate-50 text-slate-800 font-medium cursor-not-allowed"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600">
                    Admission Number
                  </Label>
                  <Input
                    value={selectedStudent.admission_number}
                    readOnly
                    disabled
                    className="bg-slate-50 text-slate-800 font-medium cursor-not-allowed"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600">
                    Class
                  </Label>
                  <Input
                    value={selectedStudent.class_name}
                    readOnly
                    disabled
                    className="bg-slate-50 text-slate-800 font-medium cursor-not-allowed"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-600">
                    Section
                  </Label>
                  <Input
                    value={selectedStudent.section}
                    readOnly
                    disabled
                    className="bg-slate-50 text-slate-800 font-medium cursor-not-allowed"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs font-semibold text-slate-600">
                    Gender
                  </Label>
                  <Input
                    value={selectedStudent.gender}
                    readOnly
                    disabled
                    className="bg-slate-50 text-slate-800 font-medium cursor-not-allowed"
                  />
                </div>
              </div>

              {/* FIELD 6: TC Number (MANUALLY ENTERED) */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <Label htmlFor="tc_number" className="text-sm font-semibold text-slate-900">
                    TC Number *
                  </Label>
                  <span className="text-xs text-slate-400">Required</span>
                </div>
                <Input
                  id="tc_number"
                  placeholder="e.g. TC/2026/001"
                  value={tcNumber}
                  onChange={(e) => setTcNumber(e.target.value)}
                  className="bg-white"
                  autoFocus
                  required
                />
                <p className="text-xs text-slate-500">
                  Must be unique within your school.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || !selectedStudent || !tcNumber.trim()}
              className="bg-slate-900 hover:bg-slate-800 text-white font-medium"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save TC Record"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      </Dialog>
    </>
  );
}
