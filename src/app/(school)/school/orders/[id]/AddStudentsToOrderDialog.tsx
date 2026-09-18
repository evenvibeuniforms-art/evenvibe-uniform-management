"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EligibleStudent, addStudentsToExistingOrder } from "../actions";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2, UserPlus, CheckCircle2, AlertCircle } from "lucide-react";

interface AddStudentsToOrderDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  eligibleStudents: EligibleStudent[];
}

export function AddStudentsToOrderDialog({
  isOpen,
  onOpenChange,
  orderId,
  eligibleStudents,
}: AddStudentsToOrderDialogProps) {
  const router = useRouter();

  // Filter & Search states
  const [search, setSearch] = useState("");
  const [selectedClass, setSelectedClass] = useState<string>("all");
  const [selectedSection, setSelectedSection] = useState<string>("all");
  const [selectedGender, setSelectedGender] = useState<string>("all");

  // Selection states
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Available filter options derived from eligible students
  const availableClasses = useMemo(() => {
    const classes = Array.from(new Set(eligibleStudents.map((s) => s.class_name)));
    return classes.sort();
  }, [eligibleStudents]);

  const availableSections = useMemo(() => {
    const sections = Array.from(
      new Set(eligibleStudents.map((s) => s.section).filter(Boolean) as string[])
    );
    return sections.sort();
  }, [eligibleStudents]);

  // Filtered students list
  const filteredStudents = useMemo(() => {
    return eligibleStudents.filter((student) => {
      const matchesSearch =
        search.trim() === "" ||
        student.student_name.toLowerCase().includes(search.toLowerCase()) ||
        student.admission_number.toLowerCase().includes(search.toLowerCase());

      const matchesClass = selectedClass === "all" || student.class_name === selectedClass;
      const matchesSection = selectedSection === "all" || student.section === selectedSection;
      const matchesGender =
        selectedGender === "all" ||
        student.gender.toLowerCase() === selectedGender.toLowerCase();

      return matchesSearch && matchesClass && matchesSection && matchesGender;
    });
  }, [eligibleStudents, search, selectedClass, selectedSection, selectedGender]);

  // Selection handlers
  const handleToggleSelect = (id: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((sId) => sId !== id) : [...prev, id]
    );
  };

  const isAllVisibleSelected =
    filteredStudents.length > 0 &&
    filteredStudents.every((s) => selectedStudentIds.includes(s.id));

  const handleToggleSelectAll = () => {
    if (isAllVisibleSelected) {
      const visibleIds = new Set(filteredStudents.map((s) => s.id));
      setSelectedStudentIds((prev) => prev.filter((id) => !visibleIds.has(id)));
    } else {
      const newIds = new Set([...selectedStudentIds, ...filteredStudents.map((s) => s.id)]);
      setSelectedStudentIds(Array.from(newIds));
    }
  };

  const handleResetAndClose = () => {
    setSelectedStudentIds([]);
    setSearch("");
    setSelectedClass("all");
    setSelectedSection("all");
    setSelectedGender("all");
    setShowConfirm(false);
    onOpenChange(false);
  };

  // Submit action
  const handleConfirmAdd = async () => {
    if (selectedStudentIds.length === 0) return;

    setIsSubmitting(true);
    try {
      const res = await addStudentsToExistingOrder(orderId, selectedStudentIds);
      if (res.error) {
        toast.error(res.error);
        setShowConfirm(false);
      } else {
        toast.success(
          `Successfully added ${res.added_students || selectedStudentIds.length} students to this order.`
        );
        handleResetAndClose();
        router.refresh();
      }
    } catch {
      toast.error("An unexpected error occurred while adding students.");
      setShowConfirm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden shadow-xl border-slate-200">
          <DialogHeader className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 shrink-0">
                <UserPlus className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg text-slate-900 font-semibold">
                  Add Students to Existing Order
                </DialogTitle>
                <DialogDescription className="text-slate-500 text-xs sm:text-sm mt-0.5">
                  Select students with completed sizes to add to this order.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Search & Filters */}
          <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/30">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-2.5">
              <div className="relative md:col-span-5 sm:col-span-2">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search by student name or admission number..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 text-sm bg-white border-slate-200"
                />
              </div>

              <div className="md:col-span-2 sm:col-span-1">
                <select
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  aria-label="Filter by Class"
                  className="w-full h-9 px-3 rounded-md border border-slate-200 text-sm bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="all">All Classes</option>
                  {availableClasses.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2 sm:col-span-1">
                <select
                  value={selectedSection}
                  onChange={(e) => setSelectedSection(e.target.value)}
                  aria-label="Filter by Section"
                  className="w-full h-9 px-3 rounded-md border border-slate-200 text-sm bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="all">All Sections</option>
                  {availableSections.map((sec) => (
                    <option key={sec} value={sec}>
                      Section {sec}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-3 sm:col-span-2">
                <select
                  value={selectedGender}
                  onChange={(e) => setSelectedGender(e.target.value)}
                  aria-label="Filter by Gender"
                  className="w-full h-9 px-3 rounded-md border border-slate-200 text-sm bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="all">All Genders</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-y-auto px-6 py-3 max-h-[380px]">
            {filteredStudents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500">
                <AlertCircle className="h-8 w-8 text-slate-300 mb-2" />
                <p className="font-medium text-slate-700 text-sm">No eligible students found</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Only active students with completed sizes matching this school&apos;s active uniform
                  configurations can be added.
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden my-1 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 text-xs font-semibold">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">
                          <Checkbox
                            checked={isAllVisibleSelected}
                            onCheckedChange={handleToggleSelectAll}
                            aria-label="Select all visible"
                          />
                        </th>
                        <th className="py-2.5 px-3 min-w-[150px]">Student Name</th>
                        <th className="py-2.5 px-3 min-w-[100px]">Admission #</th>
                        <th className="py-2.5 px-3 min-w-[90px]">Class</th>
                        <th className="py-2.5 px-3 min-w-[80px]">Section</th>
                        <th className="py-2.5 px-3 min-w-[80px]">Gender</th>
                        <th className="py-2.5 px-3 min-w-[90px] text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredStudents.map((student) => {
                        const isSelected = selectedStudentIds.includes(student.id);
                        return (
                          <tr
                            key={student.id}
                            onClick={() => handleToggleSelect(student.id)}
                            className={`cursor-pointer transition-colors ${
                              isSelected ? "bg-emerald-50/60 hover:bg-emerald-50" : "hover:bg-slate-50"
                            }`}
                          >
                            <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => handleToggleSelect(student.id)}
                                aria-label={`Select ${student.student_name}`}
                              />
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-900 whitespace-nowrap">
                              {student.student_name}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 font-mono text-xs whitespace-nowrap">
                              {student.admission_number}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                              {student.class_name}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                              {student.section || "—"}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700 capitalize whitespace-nowrap">
                              {student.gender}
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              <Badge
                                variant="outline"
                                className="bg-emerald-50 text-emerald-700 border-emerald-200 inline-flex items-center gap-1 font-normal text-xs px-2 py-0.5"
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                Complete
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Footer Controls */}
          <DialogFooter className="px-6 py-3 border-t border-slate-200/80 bg-slate-50/50 flex flex-row items-center justify-between sm:justify-between">
            <div className="text-sm font-medium text-slate-600">
              {selectedStudentIds.length === 0 ? (
                <span className="text-slate-400">0 students selected</span>
              ) : (
                <span className="text-emerald-700 font-semibold">
                  {selectedStudentIds.length} student
                  {selectedStudentIds.length === 1 ? "" : "s"} selected
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleResetAndClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => setShowConfirm(true)}
                disabled={selectedStudentIds.length === 0 || isSubmitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
              >
                Add Students {selectedStudentIds.length > 0 ? `(${selectedStudentIds.length})` : ""}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Modal */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-w-md shadow-xl border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-slate-900">
              Add {selectedStudentIds.length} student
              {selectedStudentIds.length === 1 ? "" : "s"} to this existing order?
            </DialogTitle>
            <DialogDescription className="text-slate-600 text-sm mt-2">
              Their completed uniform sizes will be added to the current order. Existing students and
              quantities will not be changed.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-5 flex gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowConfirm(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmAdd}
              disabled={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? "Adding Students..." : "Confirm & Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
