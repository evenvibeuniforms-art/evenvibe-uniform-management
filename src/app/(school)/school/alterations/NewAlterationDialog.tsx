"use client";

import React, { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Upload,
  Scissors,
  Lock,
} from "lucide-react";
import {
  ALTERATION_REASONS,
  AlterationReason,
} from "./schema";
import {
  getDeliveredOrdersForSchool,
  getDeliveredStudentsForOrder,
  getDeliveredStudentItems,
  submitAlterationRequest,
  uploadAlterationProof,
  DeliveredStudent,
  DeliveredStudentItem,
} from "./actions";
import { DEFAULT_STUDENT_SIZES, isPositiveWholeNumber } from "@/lib/constants/studentSizes";

interface DeliveredOrder {
  id: string;
  order_number: string;
  created_at: string;
  delivered_at: string | null;
  requirement_id: string | null;
  status: string;
}

interface NewAlterationDialogProps {
  onSuccess?: () => void;
  initialOrderId?: string;
}

export function NewAlterationDialog({ onSuccess, initialOrderId }: NewAlterationDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Wizard Step: 1 = Order & Class, 2 = Student Selection, 3 = Delivered Items, 4 = Alter Form
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Orders & Classes
  const [orders, setOrders] = useState<DeliveredOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string>(initialOrderId || "");
  const [classes, setClasses] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>("all");

  // Step 2: Delivered Students
  const [allDeliveredStudents, setAllDeliveredStudents] = useState<DeliveredStudent[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<DeliveredStudent | null>(null);
  const [noStudentsMsg, setNoStudentsMsg] = useState<string>("");

  // Step 3: Delivered Items
  const [deliveredItems, setDeliveredItems] = useState<DeliveredStudentItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [selectedItem, setSelectedItem] = useState<DeliveredStudentItem | null>(null);

  // Step 4: Alteration Details
  const [changeSize, setChangeSize] = useState<string>("");
  const [reason, setReason] = useState<AlterationReason>("Size Correction");
  const [remarks, setRemarks] = useState<string>("");

  // Proof Photo
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Messages
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const resetForm = () => {
    setStep(1);
    setSelectedOrderId("");
    setSelectedClass("all");
    setClasses([]);
    setSelectedStudent(null);
    setAllDeliveredStudents([]);
    setDeliveredItems([]);
    setSelectedItem(null);
    setChangeSize("");
    setReason("Size Correction");
    setRemarks("");
    setPhotoFile(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    setErrorMsg(null);
    setSuccessMsg(null);
    setNoStudentsMsg("");
  };

  const handleOpenDialog = () => {
    resetForm();
    setOpen(true);
    setLoadingOrders(true);
    getDeliveredOrdersForSchool().then((res) => {
      setLoadingOrders(false);
      if (res.success) {
        setOrders(res.orders);
        if (initialOrderId && res.orders.some((o) => o.id === initialOrderId)) {
          handleOrderSelect(initialOrderId);
        }
      } else {
        setErrorMsg(res.error || "Unable to load delivered orders.");
      }
    });
  };

  const handleOrderSelect = (orderId: string) => {
    setSelectedOrderId(orderId);
    setSelectedClass("all");
    setSelectedStudent(null);
    setDeliveredItems([]);
    setSelectedItem(null);
    setErrorMsg(null);
    setNoStudentsMsg("");

    if (!orderId) {
      setAllDeliveredStudents([]);
      setClasses([]);
      return;
    }

    setLoadingStudents(true);
    getDeliveredStudentsForOrder(orderId).then((res) => {
      setLoadingStudents(false);
      if (res.success) {
        setAllDeliveredStudents(res.deliveredStudents);
        setClasses(res.classes);
        if (res.deliveredStudents.length === 0) {
          setNoStudentsMsg(res.message || "No delivered students are available for alteration.");
        } else {
          setStep(2);
        }
      } else {
        setErrorMsg(res.error || "Unable to load delivered students.");
      }
    });
  };

  const handleStudentSelect = (student: DeliveredStudent) => {
    setSelectedStudent(student);
    setSelectedItem(null);
    setErrorMsg(null);
    setLoadingItems(true);

    getDeliveredStudentItems(selectedOrderId, student.id).then((res) => {
      setLoadingItems(false);
      if (res.success) {
        setDeliveredItems(res.items);
        setStep(3);
      } else {
        setErrorMsg(res.error || "No delivered uniform items are available for alteration.");
      }
    });
  };

  const handleItemSelect = (item: DeliveredStudentItem) => {
    if (item.isLocked) {
      setErrorMsg("Maximum 2 alteration attempts reached for this item.");
      return;
    }
    setSelectedItem(item);
    setChangeSize("");
    setReason("Size Correction");
    setRemarks("");
    setErrorMsg(null);
    setStep(4);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowed.includes(file.type)) {
      setErrorMsg("Invalid image type. Please select a PNG, JPG, or WEBP file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg("Image size exceeds 5MB limit.");
      return;
    }

    setErrorMsg(null);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderId || !selectedStudent || !selectedItem) {
      setErrorMsg("Please complete all selection steps.");
      return;
    }

    const trimmedSize = changeSize.trim();
    if (!trimmedSize) {
      setErrorMsg("Please enter a valid change size.");
      return;
    }

    if (!isPositiveWholeNumber(trimmedSize)) {
      setErrorMsg("Change size must be a valid positive whole number (e.g. 18, 20, 32, 48).");
      return;
    }

    if (trimmedSize === selectedItem.currentGivenSize) {
      setErrorMsg(`Change size (${trimmedSize}) cannot be the same as Given Size (${selectedItem.currentGivenSize}).`);
      return;
    }

    setErrorMsg(null);

    startTransition(async () => {
      let photoUrl: string | null = null;
      if (photoFile) {
        setUploadingPhoto(true);
        const formData = new FormData();
        formData.append("file", photoFile);
        const uploadRes = await uploadAlterationProof(formData);
        setUploadingPhoto(false);

        if (!uploadRes.success || !uploadRes.storagePath) {
          setErrorMsg(uploadRes.error || "Failed to upload proof photo.");
          return;
        }
        photoUrl = uploadRes.storagePath;
      }

      const res = await submitAlterationRequest({
        orderId: selectedOrderId,
        studentId: selectedStudent.id,
        itemName: selectedItem.itemName,
        styleName: selectedItem.styleName,
        color: selectedItem.color,
        reason: reason || "Size Correction",
        givenSize: selectedItem.currentGivenSize,
        changeSize: trimmedSize,
        quantity: 1,
        remarks: remarks.trim() || undefined,
        proofPhotoUrl: photoUrl,
      });

      if (res.success) {
        setSuccessMsg(res.message || "Alteration request submitted successfully.");
        // Refresh delivered items for this student to reflect new attempt counts
        if (selectedStudent) {
          getDeliveredStudentItems(selectedOrderId, selectedStudent.id).then((itRes) => {
            if (itRes.success) setDeliveredItems(itRes.items);
          });
        }
        setTimeout(() => {
          setOpen(false);
          if (onSuccess) onSuccess();
        }, 1500);
      } else {
        setErrorMsg(res.error || "Failed to submit alteration request.");
      }
    });
  };

  const filteredStudents = allDeliveredStudents.filter((s) => {
    if (selectedClass === "all") return true;
    return s.class_name === selectedClass;
  });

  return (
    <>
      <Button
        onClick={handleOpenDialog}
        className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white font-medium shadow-sm transition-all flex items-center gap-2"
      >
        <Plus className="h-4 w-4" />
        New Alteration Request
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="p-6 pb-4 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Scissors className="h-5 w-5 text-evenvibe-primary" />
                  New Alteration Request
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-1">
                  Deliveries received students only • Max 2 alteration attempts per student & item
                </DialogDescription>
              </div>

              {/* Step Pills */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className={`px-2 py-0.5 rounded-full font-medium ${step >= 1 ? "bg-evenvibe-light text-evenvibe-deep" : "bg-slate-100 text-slate-400"}`}>1. Order</span>
                <span>›</span>
                <span className={`px-2 py-0.5 rounded-full font-medium ${step >= 2 ? "bg-evenvibe-light text-evenvibe-deep" : "bg-slate-100 text-slate-400"}`}>2. Student</span>
                <span>›</span>
                <span className={`px-2 py-0.5 rounded-full font-medium ${step >= 3 ? "bg-evenvibe-light text-evenvibe-deep" : "bg-slate-100 text-slate-400"}`}>3. Items</span>
                <span>›</span>
                <span className={`px-2 py-0.5 rounded-full font-medium ${step >= 4 ? "bg-evenvibe-light text-evenvibe-deep" : "bg-slate-100 text-slate-400"}`}>4. Alter</span>
              </div>
            </div>
          </DialogHeader>

          <div className="p-6 space-y-6">
            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-status-error mt-0.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 bg-evenvibe-light border border-emerald-200 rounded-lg text-sm text-evenvibe-deep flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-evenvibe-primary shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* ---------------------------------------------------- */}
            {/* STEP 1: SELECT DELIVERED ORDER                       */}
            {/* ---------------------------------------------------- */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-slate-800 flex items-center justify-between">
                  <span>1. Select Delivered Order</span>
                  {selectedOrderId && step > 1 && (
                    <Button variant="ghost" size="sm" className="h-6 text-xs text-evenvibe-primary" onClick={() => setStep(1)}>
                      Change Order
                    </Button>
                  )}
                </Label>
                <Select
                  value={selectedOrderId}
                  onValueChange={(val) => handleOrderSelect(val || "")}
                  disabled={loadingOrders}
                >
                  <SelectTrigger className="w-full bg-white">
                    <SelectValue placeholder={loadingOrders ? "Loading delivered orders..." : "Choose a delivered order..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {orders.length === 0 && !loadingOrders ? (
                      <div className="p-4 text-center text-sm text-slate-500">
                        No delivered orders are available for alteration.
                      </div>
                    ) : (
                      orders.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.order_number} {o.delivered_at ? `(Delivered: ${new Date(o.delivered_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })})` : `(${o.status})`}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {noStudentsMsg && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-status-warning shrink-0" />
                  <span>{noStudentsMsg}</span>
                </div>
              )}
            </div>

            {/* ---------------------------------------------------- */}
            {/* STEP 2: DELIVERY RECEIVED STUDENTS (CLASS-WISE)       */}
            {/* ---------------------------------------------------- */}
            {selectedOrderId && allDeliveredStudents.length > 0 && (
              <div className="space-y-4 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-slate-800">
                    2. Delivery Received Students ({allDeliveredStudents.length})
                  </Label>
                  {/* Class Filter */}
                  {classes.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Class:</span>
                      <Select value={selectedClass} onValueChange={(val) => setSelectedClass(val || "all")}>
                        <SelectTrigger className="h-8 text-xs w-[120px] bg-white">
                          <SelectValue placeholder="All Classes" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Classes</SelectItem>
                          {classes.map((cls) => (
                            <SelectItem key={cls} value={cls}>
                              {cls}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {loadingStudents ? (
                  <div className="p-8 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-evenvibe-primary" />
                    <span>Loading delivery received students...</span>
                  </div>
                ) : filteredStudents.length === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-500 bg-slate-50 rounded-lg border border-slate-200">
                    No delivered students are available in this class.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto divide-y divide-slate-100">
                    {filteredStudents.map((stu) => {
                      const isSelected = selectedStudent?.id === stu.id;
                      return (
                        <div
                          key={stu.id}
                          onClick={() => handleStudentSelect(stu)}
                          className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${
                            isSelected ? "bg-evenvibe-light/80 border-l-4 border-evenvibe-primary" : "hover:bg-slate-50"
                          }`}
                        >
                          <div>
                            <div className="font-medium text-sm text-slate-900 flex items-center gap-2">
                              {stu.student_name}
                              <span className="text-xs font-normal text-slate-500">({stu.admission_number})</span>
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {stu.class_name} - {stu.section} • {stu.delivered_items_count} delivered uniform items
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={
                                stu.alteration_status === "Locked"
                                  ? "bg-red-50 text-red-700 border-red-200 text-xs"
                                  : stu.alteration_status === "In Progress"
                                  ? "bg-amber-50 text-amber-700 border-amber-200 text-xs"
                                  : "bg-evenvibe-light text-evenvibe-deep border-emerald-200 text-xs"
                              }
                            >
                              {stu.alteration_status} ({stu.attempts_summary})
                            </Badge>
                            <Button size="sm" variant={isSelected ? "default" : "outline"} className="h-7 text-xs">
                              {isSelected ? "Selected" : "Select"}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ---------------------------------------------------- */}
            {/* STEP 3: DELIVERED UNIFORM ITEMS FOR STUDENT           */}
            {/* ---------------------------------------------------- */}
            {selectedStudent && (
              <div className="space-y-4 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-semibold text-slate-800">
                      3. Delivered Uniform Items: {selectedStudent.student_name}
                    </Label>
                    <p className="text-xs text-slate-500">
                      {selectedStudent.admission_number} • {selectedStudent.class_name} - {selectedStudent.section}
                    </p>
                  </div>
                </div>

                {loadingItems ? (
                  <div className="p-8 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-evenvibe-primary" />
                    <span>Loading delivered items...</span>
                  </div>
                ) : deliveredItems.length === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-500 bg-slate-50 rounded-lg border border-slate-200">
                    No delivered uniform items are available for alteration.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
                    {deliveredItems.map((item) => {
                      const isSelected = selectedItem?.id === item.id;
                      return (
                        <div
                          key={item.id}
                          className={`p-3.5 flex items-center justify-between transition-colors ${
                            isSelected ? "bg-evenvibe-light/70 border-l-4 border-evenvibe-primary" : "hover:bg-slate-50/60"
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="font-medium text-sm text-slate-900 flex items-center gap-2">
                              {item.itemName}
                              <span className="text-xs text-slate-500 font-normal">
                                ({item.styleName} • {item.color})
                              </span>
                            </div>
                            <div className="text-xs text-slate-600 flex items-center gap-3">
                              <span className="flex items-center gap-1 font-medium text-slate-700">
                                Given Size: <span className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-900">{item.currentGivenSize}</span> 🔒
                              </span>
                              <span>•</span>
                              <span className="text-slate-500">
                                Attempts: <span className="font-medium">{item.attemptsLabel}</span>
                              </span>
                            </div>
                            {item.history.length > 0 && (
                              <div className="text-[11px] text-slate-500 mt-1">
                                Previous: Attempt {item.history[item.history.length - 1].attempt_number} changed to size {item.history[item.history.length - 1].change_size} ({item.history[item.history.length - 1].status})
                              </div>
                            )}
                          </div>

                          <div>
                            {item.isLocked ? (
                              <Button size="sm" variant="outline" disabled className="h-8 text-xs bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed flex items-center gap-1">
                                <Lock className="h-3 w-3" />
                                2/2 Locked
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant={isSelected ? "default" : "outline"}
                                className={`h-8 text-xs ${isSelected ? "bg-evenvibe-primary text-white" : "border-evenvibe-light text-evenvibe-deep hover:bg-evenvibe-light"}`}
                                onClick={() => handleItemSelect(item)}
                              >
                                {isSelected ? "Selected" : "Alter"}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ---------------------------------------------------- */}
            {/* STEP 4: ALTERATION DETAILS FORM                      */}
            {/* ---------------------------------------------------- */}
            {selectedItem && step >= 4 && (
              <form onSubmit={handleSubmit} className="space-y-4 pt-4 border-t-2 border-evenvibe-light bg-slate-50/50 p-4 rounded-xl">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <Scissors className="h-4 w-4 text-evenvibe-primary" />
                    Alter Item: {selectedItem.itemName} ({selectedItem.styleName})
                  </h4>
                  <Badge className="bg-evenvibe-light text-evenvibe-deep border-evenvibe-light">
                    Attempt {selectedItem.attemptsUsed + 1} of 2
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Given Size (Read-only) */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                      Given Size <Lock className="h-3 w-3 text-slate-400" />
                    </Label>
                    <Input
                      value={selectedItem.currentGivenSize}
                      readOnly
                      disabled
                      className="bg-slate-100 font-mono font-bold text-slate-800 cursor-not-allowed"
                    />
                    <p className="text-[11px] text-slate-500">
                      {selectedItem.attemptsUsed === 0
                        ? "Original delivered size snapshot."
                        : "Authoritative size from Attempt 1."}
                    </p>
                  </div>

                  {/* Change Size */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">
                      Change Size *
                    </Label>
                    <Input
                      placeholder="e.g. 28, 30, 32, 34"
                      value={changeSize}
                      onChange={(e) => setChangeSize(e.target.value.trim())}
                      className="bg-white font-mono font-medium focus:border-evenvibe-primary"
                      required
                    />
                    <p className="text-[11px] text-slate-500">
                      Positive whole numbers only (e.g. 18, 20, 32, 48).
                    </p>
                  </div>
                </div>

                {/* Preset Size Chips */}
                <div className="space-y-1">
                  <span className="text-[11px] text-slate-500">Quick Size Select:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {DEFAULT_STUDENT_SIZES.map((sz) => (
                      <button
                        type="button"
                        key={sz}
                        disabled={sz === selectedItem.currentGivenSize}
                        onClick={() => setChangeSize(sz)}
                        className={`px-2 py-0.5 text-xs rounded border transition-all ${
                          changeSize === sz
                            ? "bg-evenvibe-primary text-white border-evenvibe-primary font-bold"
                            : sz === selectedItem.currentGivenSize
                            ? "bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed line-through"
                            : "bg-white text-slate-700 border-slate-200 hover:-evenvibe-primary hover:bg-evenvibe-light/50"
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reason & Remarks */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">Reason</Label>
                    <Select value={reason} onValueChange={(val) => setReason(val as AlterationReason)}>
                      <SelectTrigger className="bg-white text-xs h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALTERATION_REASONS.map((r) => (
                          <SelectItem key={r} value={r} className="text-xs">
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">Remarks (Optional)</Label>
                    <Input
                      placeholder="e.g. Sleeves tight, waist loose"
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      className="bg-white text-xs h-9"
                    />
                  </div>
                </div>

                {/* Proof Photo Upload */}
                <div className="space-y-1.5 pt-1">
                  <Label className="text-xs font-semibold text-slate-700">Proof Photo (Optional)</Label>
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer border border-dashed border-slate-300 hover:-evenvibe-primary bg-white px-3 py-2 rounded-lg text-xs text-slate-600 flex items-center gap-2 transition-colors">
                      <Upload className="h-3.5 w-3.5 text-evenvibe-primary" />
                      <span>{photoFile ? photoFile.name : "Upload Photo (Max 5MB)"}</span>
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/webp"
                        className="hidden"
                        onChange={handlePhotoChange}
                      />
                    </label>
                    {photoPreview && (
                      <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photoPreview} alt="Proof" className="h-9 w-9 object-cover rounded border" />
                        <button
                          type="button"
                          onClick={handleRemovePhoto}
                          className="text-xs text-status-error hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Submit Action */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSelectedItem(null)}
                    disabled={isPending || uploadingPhoto}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isPending || uploadingPhoto || !changeSize}
                    className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white font-medium"
                  >
                    {isPending || uploadingPhoto ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      `Submit Alteration (Attempt ${selectedItem.attemptsUsed + 1}/2)`
                    )}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
