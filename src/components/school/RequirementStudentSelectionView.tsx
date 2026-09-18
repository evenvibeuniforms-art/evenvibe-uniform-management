"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StudentWithSize } from "@/app/(school)/school/sizes/schema";
import { AllConfigItem } from "@/app/(school)/school/sizes/actions";
import { submitRequirement } from "@/app/(school)/school/requirements/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SizeFormDialog } from "./SizeFormDialog";
import {
  Users,
  CheckCircle2,
  AlertCircle,
  Search,
  Package,
  Layers,
  Sparkles,
  ArrowRight,
  RefreshCw,
  XCircle,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

interface RequirementStudentSelectionViewProps {
  students: StudentWithSize[];
  configurations: AllConfigItem[];
}

export function RequirementStudentSelectionView({
  students,
  configurations,
}: RequirementStudentSelectionViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Selection state - defaults to empty (School Admin must explicitly select)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filter & search state
  const [searchQuery, setSearchQuery] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Confirmation dialog
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Helper: check completeness and missing items for a student
  const studentStatusMap = useMemo(() => {
    const map = new Map<string, { isComplete: boolean; missingItems: string[] }>();

    students.forEach((student) => {
      const normGender = (student.gender || "").toLowerCase();
      const normClass = (student.class_name || "").trim().toLowerCase();

      // Find matching configuration
      const config = configurations.find(
        (c) =>
          c.gender.toLowerCase() === normGender &&
          c.classes.some((cls) => cls.trim().toLowerCase() === normClass)
      );

      if (!config) {
        // If no config found, rely on size_record flag
        map.set(student.id, {
          isComplete: student.size_record?.is_complete || false,
          missingItems: student.size_record?.is_complete ? [] : ["Size Incomplete"],
        });
        return;
      }

      const requiredItems = (config.items || []).filter(
        (item) => item.is_required && item.is_active !== false
      );
      const ds = student.size_record?.dynamic_sizes || {};
      const missing: string[] = [];

      for (const item of requiredItems) {
        const val = ds[item.id];
        if (!val || typeof val !== "string" || val.trim() === "") {
          missing.push(item.item_name);
        }
      }

      const isComplete = missing.length === 0 && (student.size_record?.is_complete || false);
      map.set(student.id, { isComplete, missingItems: missing });
    });

    return map;
  }, [students, configurations]);

  // Derive unique classes and sections for filter dropdowns
  const availableClasses = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      if (s.class_name?.trim()) set.add(s.class_name.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [students]);

  const availableSections = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      if (s.section?.trim()) set.add(s.section.trim());
    });
    return Array.from(set).sort();
  }, [students]);

  // Filtered students list
  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return students.filter((student) => {
      if (q) {
        const matchesName = student.student_name?.toLowerCase().includes(q);
        const matchesAdm = student.admission_number?.toLowerCase().includes(q);
        if (!matchesName && !matchesAdm) return false;
      }

      if (classFilter !== "all" && student.class_name?.trim() !== classFilter) {
        return false;
      }

      if (sectionFilter !== "all" && student.section?.trim() !== sectionFilter) {
        return false;
      }

      if (genderFilter !== "all" && student.gender?.toLowerCase() !== genderFilter.toLowerCase()) {
        return false;
      }

      const statusInfo = studentStatusMap.get(student.id);
      if (statusFilter === "complete" && !statusInfo?.isComplete) {
        return false;
      }
      if (statusFilter === "pending" && statusInfo?.isComplete) {
        return false;
      }

      return true;
    });
  }, [students, searchQuery, classFilter, sectionFilter, genderFilter, statusFilter, studentStatusMap]);

  // Selected students computation
  const selectedStudentsList = useMemo(() => {
    return students.filter((s) => selectedIds.has(s.id));
  }, [students, selectedIds]);

  const selectedIncompleteStudents = useMemo(() => {
    return selectedStudentsList.filter((s) => {
      const status = studentStatusMap.get(s.id);
      return !status?.isComplete;
    });
  }, [selectedStudentsList, studentStatusMap]);

  // Dynamic Quantity Summary calculation based ONLY on selected completed students
  const selectedQuantities = useMemo(() => {
    // Map item id to { gender, itemName }
    const configMap: Record<string, { gender: string; itemName: string }> = {};
    configurations.forEach((c) => {
      (c.items || []).forEach((item) => {
        configMap[item.id] = { gender: c.gender, itemName: item.item_name };
      });
    });

    const breakdown: {
      Male: Record<string, Record<string, number>>;
      Female: Record<string, Record<string, number>>;
    } = {
      Male: {},
      Female: {},
    };

    const classSummaryMap: Record<string, { total: number; completed: number; pending: number }> = {};

    selectedStudentsList.forEach((student) => {
      const cls = student.class_name || "Unassigned";
      if (!classSummaryMap[cls]) {
        classSummaryMap[cls] = { total: 0, completed: 0, pending: 0 };
      }
      classSummaryMap[cls].total++;

      const status = studentStatusMap.get(student.id);
      if (status?.isComplete) {
        classSummaryMap[cls].completed++;
        const ds = student.size_record?.dynamic_sizes || {};
        for (const [itemId, size] of Object.entries(ds)) {
          if (!size) continue;
          const mapped = configMap[itemId];
          if (mapped) {
            const { gender, itemName } = mapped;
            const g = (gender === "Female" ? "Female" : "Male") as "Male" | "Female";
            if (!breakdown[g][itemName]) {
              breakdown[g][itemName] = {};
            }
            breakdown[g][itemName][size] = (breakdown[g][itemName][size] || 0) + 1;
          }
        }
      } else {
        classSummaryMap[cls].pending++;
      }
    });

    let totalItems = 0;
    Object.values(breakdown.Male).forEach((sizes) => {
      totalItems += Object.values(sizes).reduce((a, b) => a + b, 0);
    });
    Object.values(breakdown.Female).forEach((sizes) => {
      totalItems += Object.values(sizes).reduce((a, b) => a + b, 0);
    });

    const classSummary = Object.entries(classSummaryMap)
      .map(([className, data]) => ({
        className,
        ...data,
      }))
      .sort((a, b) => a.className.localeCompare(b.className, undefined, { numeric: true }));

    return {
      breakdown,
      totalItems,
      classSummary,
    };
  }, [selectedStudentsList, configurations, studentStatusMap]);

  // Selection handlers
  const handleToggleStudent = (studentId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredStudents.forEach((s) => next.add(s.id));
      return next;
    });
    toast.info(`Selected all ${filteredStudents.length} matching students.`);
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
    toast.info("Cleared student selection.");
  };

  const isAllFilteredSelected =
    filteredStudents.length > 0 &&
    filteredStudents.every((s) => selectedIds.has(s.id));

  // Submission validation
  const canSubmit =
    selectedIds.size > 0 &&
    selectedIncompleteStudents.length === 0 &&
    !isPending;

  const handleConfirmSubmit = () => {
    if (!canSubmit) return;
    setSubmitError(null);

    startTransition(async () => {
      try {
        const studentIdsArray = Array.from(selectedIds);
        const res = await submitRequirement(studentIdsArray);

        if (!res.success) {
          setSubmitError(res.error || "Failed to submit requirement.");
          toast.error(res.error || "Failed to submit requirement.");
          return;
        }

        toast.success("Requirement & Order created successfully!");
        setIsConfirmOpen(false);
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
        setSubmitError(msg);
        toast.error(msg);
      }
    });
  };

  return (
    <div className="space-y-6 pb-28">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Requirement Submission
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Select the specific students who need uniforms for this order. Only selected students will be included in the new requirement.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Link href="/school/sizes">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              Size Management
            </Button>
          </Link>
        </div>
      </div>

      {/* Process Banner */}
      <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-4 flex items-start gap-3 text-emerald-950">
        <Sparkles className="h-5 w-5 mt-0.5 text-emerald-600 shrink-0" />
        <div className="text-xs sm:text-sm space-y-1">
          <div className="font-semibold text-emerald-900">
            Custom Order Selection
          </div>
          <div className="text-emerald-800 leading-relaxed">
            Choose exactly which students belong to this new order. Previous delivered orders remain untouched in history. Students who were part of previous orders can be selected again whenever needed.
          </div>
        </div>
      </div>

      {/* Incomplete Students Alert (if any selected student is incomplete) */}
      {selectedIncompleteStudents.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 sm:p-5 shadow-sm space-y-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 mt-0.5 text-amber-600 shrink-0" />
            <div>
              <h3 className="font-semibold text-amber-950 text-base">
                Action Required: Incomplete Sizes Detected
              </h3>
              <p className="text-xs sm:text-sm text-amber-800 mt-0.5">
                {selectedIncompleteStudents.length} of your {selectedIds.size} selected student(s) have missing required uniform sizes. Complete their sizes or uncheck them before submitting.
              </p>
            </div>
          </div>

          <div className="bg-white/90 border border-amber-200 rounded-lg p-3 max-h-48 overflow-y-auto divide-y divide-slate-100 text-xs">
            {selectedIncompleteStudents.map((student) => {
              const status = studentStatusMap.get(student.id);
              return (
                <div key={student.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-semibold text-slate-900">{student.student_name}</span>{" "}
                    <span className="text-slate-500">({student.admission_number})</span> •{" "}
                    <span className="text-slate-600">
                      Class {student.class_name}-{student.section}
                    </span>
                    <div className="text-amber-700 font-medium text-[11px] mt-0.5">
                      Missing: {status?.missingItems.join(", ") || "Sizes incomplete"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <SizeFormDialog
                      student={student}
                      configurations={configurations}
                      trigger={
                        <Button variant="outline" size="sm" className="h-7 text-xs px-2.5">
                          Complete Size
                        </Button>
                      }
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleStudent(student.id)}
                      className="h-7 text-xs text-slate-500 hover:text-red-600 px-2"
                      title="Remove from this order"
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Metrics Cards based on SELECTION */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Selected Students
            </CardTitle>
            <Users className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold text-slate-900">{selectedIds.size}</div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              out of {students.length} total in school
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Sizes Complete
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold text-emerald-600">
              {selectedStudentsList.length - selectedIncompleteStudents.length}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">ready for production</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Sizes Pending
            </CardTitle>
            <AlertCircle
              className={`h-4 w-4 ${
                selectedIncompleteStudents.length > 0 ? "text-amber-500" : "text-slate-300"
              }`}
            />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div
              className={`text-2xl font-bold ${
                selectedIncompleteStudents.length > 0 ? "text-amber-600" : "text-slate-400"
              }`}
            >
              {selectedIncompleteStudents.length}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">among selected</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Order Items
            </CardTitle>
            <Package className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold text-blue-600">
              {selectedQuantities.totalItems}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">aggregated units</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Selection Area */}
      <Card className="shadow-sm border-slate-200">
        <CardHeader className="border-b border-slate-100 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-600" />
                Select Students for This Order
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Check the boxes of students to include. Only checked students will be in the order.
              </CardDescription>
            </div>
            {/* Selection Counter Pill */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <Badge
                variant={selectedIds.size > 0 ? "default" : "secondary"}
                className={
                  selectedIds.size > 0
                    ? "bg-emerald-600 hover:bg-emerald-700 text-xs px-3 py-1 font-semibold"
                    : "text-xs px-3 py-1 font-semibold text-slate-500"
                }
              >
                Selected: {selectedIds.size} Students
              </Badge>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 mt-4 pt-4 border-t border-slate-100">
            {/* Search Input */}
            <div className="relative sm:col-span-2">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by name or admission no..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            {/* Class Filter */}
            <div>
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">All Classes</option>
                {availableClasses.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls}
                  </option>
                ))}
              </select>
            </div>

            {/* Section Filter */}
            <div>
              <select
                value={sectionFilter}
                onChange={(e) => setSectionFilter(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">All Sections</option>
                {availableSections.map((sec) => (
                  <option key={sec} value={sec}>
                    Section {sec}
                  </option>
                ))}
              </select>
            </div>

            {/* Gender Filter */}
            <div>
              <select
                value={genderFilter}
                onChange={(e) => setGenderFilter(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">All Genders</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="all">All Size Statuses</option>
                <option value="complete">Sizes Complete</option>
                <option value="pending">Sizes Pending</option>
              </select>
            </div>
          </div>

          {/* Quick Selection Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-slate-100 text-xs">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAllFiltered}
                disabled={filteredStudents.length === 0}
                className="h-7 text-xs px-2.5"
              >
                Select All ({filteredStudents.length})
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearSelection}
                disabled={selectedIds.size === 0}
                className="h-7 text-xs text-slate-500 hover:text-slate-800 px-2"
              >
                Clear All
              </Button>
            </div>

            <div className="text-slate-500 text-xs">
              Showing {filteredStudents.length} of {students.length} students
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {filteredStudents.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              No students match the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow>
                    <TableHead className="w-12 text-center">
                      <Checkbox
                        checked={isAllFilteredSelected}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            handleSelectAllFiltered();
                          } else {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              filteredStudents.forEach((s) => next.delete(s.id));
                              return next;
                            });
                          }
                        }}
                        aria-label="Select all matching"
                      />
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700">Student</TableHead>
                    <TableHead className="font-semibold text-slate-700">Class & Sec</TableHead>
                    <TableHead className="font-semibold text-slate-700">Adm. No</TableHead>
                    <TableHead className="font-semibold text-slate-700">Gender</TableHead>
                    <TableHead className="font-semibold text-slate-700">Size Status</TableHead>
                    <TableHead className="text-right font-semibold text-slate-700">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStudents.map((student) => {
                    const isSelected = selectedIds.has(student.id);
                    const status = studentStatusMap.get(student.id);
                    const isComplete = status?.isComplete || false;

                    return (
                      <TableRow
                        key={student.id}
                        className={`transition-colors cursor-pointer ${
                          isSelected ? "bg-emerald-50/40 hover:bg-emerald-50/60" : "hover:bg-slate-50/70"
                        }`}
                        onClick={(e) => {
                          // Prevent toggling if clicked on a button or link
                          if ((e.target as HTMLElement).closest("button, a")) return;
                          handleToggleStudent(student.id);
                        }}
                      >
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleToggleStudent(student.id)}
                            aria-label={`Select ${student.student_name}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium text-slate-900">
                          <div className="flex items-center gap-2">
                            <span>{student.student_name}</span>
                            {isSelected && (
                              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 text-[10px] px-1.5 py-0">
                                Selected
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-600">
                          {student.class_name} • {student.section || "—"}
                        </TableCell>
                        <TableCell className="text-slate-600 font-mono text-xs">
                          {student.admission_number}
                        </TableCell>
                        <TableCell className="text-slate-600 capitalize">
                          {student.gender || "—"}
                        </TableCell>
                        <TableCell>
                          {isComplete ? (
                            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-normal">
                              <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
                              Complete
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-amber-50 text-amber-800 border-amber-200 text-xs font-normal"
                            >
                              <AlertCircle className="w-3 h-3 mr-1 text-amber-600" />
                              Pending Sizes
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <SizeFormDialog
                            student={student}
                            configurations={configurations}
                            trigger={
                              <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-slate-600">
                                Edit Size
                              </Button>
                            }
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quantity Summary Preview for Selected Students */}
      {selectedIds.size > 0 && selectedIncompleteStudents.length === 0 && (
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="border-b border-slate-100 pb-3">
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Package className="w-4 h-4 text-emerald-600" />
              Calculated Quantity Breakdown (Selected Students Only)
            </CardTitle>
            <CardDescription className="text-xs">
              Preview of aggregated uniform quantities based strictly on the {selectedIds.size} selected student(s).
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid md:grid-cols-2 gap-8">
              {/* Male Uniform Sizes */}
              <div className="space-y-4">
                <h3 className="font-semibold text-sm border-b pb-2 text-slate-800 uppercase tracking-wider">
                  Male Uniform Breakdown
                </h3>
                {Object.keys(selectedQuantities.breakdown.Male).length === 0 ? (
                  <p className="text-xs text-slate-400 py-2">No male uniform items for selected students.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {Object.entries(selectedQuantities.breakdown.Male).map(([itemName, sizes]) => (
                      <div key={itemName} className="bg-slate-50/60 p-3 rounded-lg border border-slate-100">
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                          {itemName}
                        </h4>
                        <ul className="space-y-1 text-xs">
                          {Object.entries(sizes)
                            .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
                            .map(([size, count]) => (
                              <li key={size} className="flex justify-between py-0.5 border-b border-slate-200/50 last:border-0">
                                <span className="text-slate-600">Size {size}</span>
                                <span className="font-bold text-slate-900">{count}</span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Female Uniform Sizes */}
              <div className="space-y-4">
                <h3 className="font-semibold text-sm border-b pb-2 text-slate-800 uppercase tracking-wider">
                  Female Uniform Breakdown
                </h3>
                {Object.keys(selectedQuantities.breakdown.Female).length === 0 ? (
                  <p className="text-xs text-slate-400 py-2">No female uniform items for selected students.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {Object.entries(selectedQuantities.breakdown.Female).map(([itemName, sizes]) => (
                      <div key={itemName} className="bg-slate-50/60 p-3 rounded-lg border border-slate-100">
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                          {itemName}
                        </h4>
                        <ul className="space-y-1 text-xs">
                          {Object.entries(sizes)
                            .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
                            .map(([size, count]) => (
                              <li key={size} className="flex justify-between py-0.5 border-b border-slate-200/50 last:border-0">
                                <span className="text-slate-600">Size {size}</span>
                                <span className="font-bold text-slate-900">{count}</span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sticky Bottom Submission Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] md:pl-64 z-20 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-xs sm:text-sm text-slate-600 text-center sm:text-left">
          {selectedIds.size === 0 ? (
            <span className="text-slate-500">Please select students above to create an order.</span>
          ) : selectedIncompleteStudents.length > 0 ? (
            <span className="text-amber-700 font-medium">
              ⚠️ {selectedIncompleteStudents.length} selected student(s) have incomplete sizes. Complete their sizes or unselect them.
            </span>
          ) : (
            <span className="text-emerald-700 font-medium">
              ✓ Ready to submit requirement for {selectedIds.size} selected student(s) ({selectedQuantities.totalItems} items).
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => setIsConfirmOpen(true)}
            className={`w-full sm:w-auto h-11 px-8 font-semibold transition-colors ${
              canSubmit
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : "bg-slate-100 text-slate-400 cursor-not-allowed"
            }`}
          >
            Review & Submit Requirement
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>

      {/* Confirm Submission Dialog */}
      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Requirement Submission</DialogTitle>
            <DialogDescription>
              Submit a new uniform requirement for the selected students.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div>
                <div className="text-xs text-slate-500 font-medium uppercase">Selected Students</div>
                <div className="text-2xl font-bold text-slate-900 mt-1">{selectedIds.size}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 font-medium uppercase">Total Items</div>
                <div className="text-2xl font-bold text-emerald-600 mt-1">
                  {selectedQuantities.totalItems}
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-600 bg-emerald-50/60 border border-emerald-100 rounded-lg p-3 leading-relaxed">
              <strong>Order Policy:</strong> Only the {selectedIds.size} selected students will be included in this new order. Previous delivered orders remain permanently preserved.
            </div>

            {submitError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs flex items-start gap-2">
                <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>{submitError}</div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsConfirmOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirmSubmit}
              disabled={isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Submitting Order...
                </>
              ) : (
                "Confirm & Create Order"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
