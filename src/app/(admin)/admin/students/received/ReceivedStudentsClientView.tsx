"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  PackageCheck,
  CheckCircle2,
  ArrowLeft,
  Search,
  School,
  Building2,
  ChevronRight,
  Eye,
  Shirt,
  Users,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { MobileCard, MobileCardField, MobileCardActions } from "@/components/ui/mobile-card";
import {
  DeliveredOrderOption,
  DeliveredStudent,
  ClassSummary,
  getReceivedStudentsForOrder,
} from "./actions";

interface ReceivedStudentsClientViewProps {
  orders: DeliveredOrderOption[];
  initialOrderId?: string;
  initialOrderData?: {
    classes: ClassSummary[];
    students: DeliveredStudent[];
  };
  backHref?: string;
}

export function ReceivedStudentsClientView({
  orders,
  initialOrderId,
  initialOrderData,
  backHref = "/admin/students",
}: ReceivedStudentsClientViewProps) {
  const [selectedOrderId, setSelectedOrderId] = useState<string>(
    initialOrderId || (orders.length > 0 ? orders[0].id : "")
  );
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassSummary[]>(initialOrderData?.classes || []);
  const [students, setStudents] = useState<DeliveredStudent[]>(initialOrderData?.students || []);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudentForView, setSelectedStudentForView] = useState<DeliveredStudent | null>(null);
  const [isPending, startTransition] = useTransition();

  // Handle order change
  const handleSelectOrder = (orderId: string) => {
    setSelectedOrderId(orderId);
    setSelectedClass(null);
    startTransition(async () => {
      const res = await getReceivedStudentsForOrder(orderId);
      setClasses(res.classes);
      setStudents(res.students);
    });
  };

  const selectedOrder = orders.find((o) => o.id === selectedOrderId);

  // Filter students by selected class and search
  const classStudents = students.filter((s) => {
    if (selectedClass && s.class_name !== selectedClass) return false;
    if (studentSearch.trim()) {
      const q = studentSearch.toLowerCase();
      const matchName = s.student_name.toLowerCase().includes(q);
      const matchAdm = s.admission_number.toLowerCase().includes(q);
      return matchName || matchAdm;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* 1. Header & Back Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href={backHref}>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-500 hover:text-slate-800">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <PackageCheck className="h-6 w-6 text-evenvibe-primary shrink-0" />
              Received Students
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Track student dress handover and distribution across delivered orders.
            </p>
          </div>
        </div>

        {/* Selected Order Indicator on Tablet/Desktop */}
        {selectedOrder && (
          <div className="hidden sm:flex items-center gap-2 bg-evenvibe-light border border-emerald-200/80 px-3 py-1.5 rounded-lg text-xs text-emerald-800 font-medium">
            <CheckCircle2 className="h-4 w-4 text-evenvibe-primary shrink-0" />
            <span>Order: <strong className="font-mono">{selectedOrder.order_number}</strong></span>
          </div>
        )}
      </div>

      {/* 2. Order Selector */}
      <Card className="border-slate-200 shadow-xs">
        <CardHeader className="p-4 sm:p-5 pb-3">
          <CardTitle className="text-sm sm:text-base font-semibold text-slate-900 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-slate-500" />
            Select Delivered Order
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Choose a finalized order to inspect received students by class.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-5 pt-0">
          {orders.length === 0 ? (
            <div className="py-6 text-center text-slate-500 text-sm">
              No delivered orders found. Delivered orders appear automatically once dispatched or marked delivered.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {orders.map((ord) => {
                const isSelected = ord.id === selectedOrderId;
                return (
                  <button
                    key={ord.id}
                    type="button"
                    onClick={() => handleSelectOrder(ord.id)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-2.5 ${
                      isSelected
                        ? "border-evenvibe-primary bg-emerald-50/50 shadow-xs ring-1 ring-emerald-500/20"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 w-full">
                      <div>
                        <div className="font-mono text-xs font-bold text-slate-900 break-all">
                          {ord.order_number}
                        </div>
                        <div className="text-xs text-slate-600 flex items-center gap-1 mt-0.5">
                          <School className="h-3 w-3 text-slate-400 shrink-0" />
                          <span className="truncate">{ord.school_name}</span>
                        </div>
                      </div>
                      <Badge
                        variant="secondary"
                        className={`text-[10px] uppercase font-bold shrink-0 ${
                          ord.status === "delivered"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-evenvibe-light text-evenvibe-deep"
                        }`}
                      >
                        {ord.status}
                      </Badge>
                    </div>

                    <div className="text-[11px] text-slate-500 flex items-center justify-between w-full pt-1 border-t border-slate-100">
                      <span>{ord.delivered_at ? new Date(ord.delivered_at).toLocaleDateString("en-IN") : "Recent"}</span>
                      {isSelected ? (
                        <span className="text-evenvibe-deep font-semibold flex items-center gap-0.5">
                          Selected ✓
                        </span>
                      ) : (
                        <span className="text-slate-400">Tap to select</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Class Navigation / Breadcrumbs */}
      {selectedOrder && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <span
                onClick={() => setSelectedClass(null)}
                className={`cursor-pointer hover:underline ${
                  selectedClass ? "text-slate-500" : "text-slate-900 font-bold"
                }`}
              >
                All Classes ({classes.length})
              </span>
              {selectedClass && (
                <>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                  <span className="text-evenvibe-deep font-bold">Class {selectedClass}</span>
                </>
              )}
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-evenvibe-primary" />}
            </div>

            {selectedClass && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedClass(null)}
                className="h-8 text-xs font-medium"
              >
                ← Back to Classes
              </Button>
            )}
          </div>

          {/* If No Class is Selected: Show Class Cards */}
          {!selectedClass ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {classes.length === 0 ? (
                <div className="col-span-full py-12 text-center text-slate-500 bg-white border border-slate-200 rounded-xl">
                  <Users className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="font-semibold text-slate-700 text-sm">No student delivery items found for this order.</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Items are synced automatically when Quality Check passed items are allocated.
                  </p>
                </div>
              ) : (
                classes.map((cls) => (
                  <div
                    key={cls.class_name}
                    className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs flex flex-col justify-between gap-3 hover:border-slate-300 transition-all"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-base text-slate-900">
                          Class {cls.class_name}
                        </h3>
                        <Badge className="bg-evenvibe-light text-evenvibe-deep border-emerald-200 text-xs font-semibold">
                          {cls.received_students} / {cls.total_students} Received
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {cls.total_students} student{cls.total_students > 1 ? "s" : ""} allocated in this delivery
                      </p>
                    </div>

                    <Button
                      onClick={() => setSelectedClass(cls.class_name)}
                      variant="outline"
                      className="w-full text-xs font-semibold h-8 border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800"
                    >
                      View Students →
                    </Button>
                  </div>
                ))
              )}
            </div>
          ) : (
            /* When a Class is Selected: Show Student Cards / Table */
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search student or admission number..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  className="pl-9 text-xs h-9 bg-white"
                />
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto bg-white border border-slate-200 rounded-xl shadow-xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider">
                      <th className="py-3 px-4">Student</th>
                      <th className="py-3 px-4">Admission Number</th>
                      <th className="py-3 px-4">Section</th>
                      <th className="py-3 px-4">Gender</th>
                      <th className="py-3 px-4 text-center">Items</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right pr-6">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {classStudents.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                          No matching students found in Class {selectedClass}.
                        </td>
                      </tr>
                    ) : (
                      classStudents.map((st) => (
                        <tr key={st.student_id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4 font-semibold text-slate-900">
                            {st.student_name}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-600">
                            {st.admission_number}
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            {st.section ? `Section ${st.section}` : "—"}
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            {st.gender || "—"}
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-slate-800">
                            {st.items.reduce((acc, i) => acc + i.quantity, 0)} pcs
                          </td>
                          <td className="py-3 px-4 text-center">
                            <Badge className="bg-emerald-100 text-emerald-800 border-0 font-medium px-2 py-0.5 text-[11px]">
                              {st.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-right pr-6">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedStudentForView(st)}
                              className="h-7 text-xs font-semibold px-2.5"
                            >
                              <Eye className="h-3 w-3 mr-1 text-evenvibe-primary" />
                              View Items
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards View */}
              <div className="md:hidden space-y-3">
                {classStudents.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 text-xs bg-white border border-slate-200 rounded-xl">
                    No matching students found in Class {selectedClass}.
                  </div>
                ) : (
                  classStudents.map((st) => (
                    <MobileCard key={st.student_id}>
                      <MobileCardField label="Student">
                        <span className="font-semibold text-slate-900">{st.student_name}</span>
                      </MobileCardField>
                      <MobileCardField label="Admission Number">
                        <span className="font-mono text-slate-600">{st.admission_number}</span>
                      </MobileCardField>
                      <MobileCardField label="Section">
                        <span className="text-slate-600">{st.section ? `Section ${st.section}` : "—"}</span>
                      </MobileCardField>
                      <MobileCardField label="Status">
                        <Badge className="bg-emerald-100 text-emerald-800 border-0 font-medium px-2 py-0.5 text-xs">
                          {st.status}
                        </Badge>
                      </MobileCardField>
                      <MobileCardActions>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedStudentForView(st)}
                          className="w-full h-8 text-xs font-semibold"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1 text-evenvibe-primary" />
                          View Items ({st.items.reduce((acc, i) => acc + i.quantity, 0)} pcs)
                        </Button>
                      </MobileCardActions>
                    </MobileCard>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Student Uniform Items Dialog */}
      <Dialog
        open={!!selectedStudentForView}
        onOpenChange={(open) => !open && setSelectedStudentForView(null)}
      >
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md max-h-[85vh] overflow-y-auto p-5">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Shirt className="h-4 w-4 text-evenvibe-primary" />
              {selectedStudentForView?.student_name}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Admission: {selectedStudentForView?.admission_number} • Class {selectedStudentForView?.class_name}
              {selectedStudentForView?.section ? ` • Sec ${selectedStudentForView.section}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 border-b pb-1.5">
              <span>Delivered Uniform Items</span>
              <Badge className="bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                ✓ Dress Received
              </Badge>
            </div>

            <div className="space-y-2">
              {selectedStudentForView?.items.map((item, idx) => (
                <div
                  key={idx}
                  className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-800">{item.item_name}</div>
                    <div className="text-[11px] text-slate-500">
                      {item.style_name || "Standard Style"} {item.color ? `• ${item.color}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-slate-900 bg-white border border-slate-200 px-2 py-0.5 rounded">
                      Size {item.size}
                    </span>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Qty: {item.quantity}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              onClick={() => setSelectedStudentForView(null)}
              className="w-full text-xs h-8"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
