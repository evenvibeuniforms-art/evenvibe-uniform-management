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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  User,
  Package,
  Scissors,
  X,
} from "lucide-react";
import {
  ALTERATION_REASONS,
  SIZE_RELATED_REASONS,
  AlterationReason,
} from "./schema";
import {
  getDeliveredOrdersForSchool,
  getOrderStudents,
  getStudentOrderItems,
  submitAlterationRequest,
  uploadAlterationProof,
  StudentOrderItem,
} from "./actions";

interface DeliveredOrder {
  id: string;
  order_number: string;
  created_at: string;
  delivered_at: string | null;
  requirement_id: string | null;
}

interface HistoricalStudent {
  id: string;
  student_name: string;
  admission_number: string;
  class_name: string;
  section: string;
  gender: string;
}

interface NewAlterationDialogProps {
  onSuccess?: () => void;
}

export function NewAlterationDialog({ onSuccess }: NewAlterationDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Step 1: Orders
  const [orders, setOrders] = useState<DeliveredOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");

  // Step 2: Students
  const [students, setStudents] = useState<HistoricalStudent[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [isLegacyOrder, setIsLegacyOrder] = useState(false);
  const [legacyMessage, setLegacyMessage] = useState<string>("");

  // Step 3: Items
  const [items, setItems] = useState<StudentOrderItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [selectedItemName, setSelectedItemName] = useState<string>("");

  // Step 4: Issue / Reason
  const [reason, setReason] = useState<AlterationReason | "">("");
  const [currentSize, setCurrentSize] = useState<string>("");
  const [requiredSize, setRequiredSize] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [remarks, setRemarks] = useState<string>("");

  // Step 5: Photo Upload
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Form states
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const resetForm = () => {
    setSelectedOrderId("");
    setSelectedStudentId("");
    setStudents([]);
    setSelectedItemName("");
    setItems([]);
    setReason("");
    setCurrentSize("");
    setRequiredSize("");
    setQuantity(1);
    setRemarks("");
    setPhotoFile(null);
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }
    setPhotoPreview(null);
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLegacyOrder(false);
    setLegacyMessage("");
  };

  const handleOpenDialog = () => {
    resetForm();
    setOpen(true);
    setLoadingOrders(true);
    getDeliveredOrdersForSchool().then((res) => {
      setLoadingOrders(false);
      if (res.success) {
        setOrders(res.orders);
      } else {
        setErrorMsg(res.error || "Unable to load delivered orders.");
      }
    });
  };

  const handleOrderChange = (orderId: string | null) => {
    const val = orderId || "";
    setSelectedOrderId(val);
    setSelectedStudentId("");
    setStudents([]);
    setSelectedItemName("");
    setItems([]);
    setCurrentSize("");
    setRequiredSize("");
    setIsLegacyOrder(false);
    setLegacyMessage("");
    setErrorMsg(null);

    if (!val) return;

    setLoadingStudents(true);
    getOrderStudents(val).then((res) => {
      setLoadingStudents(false);
      if (res.success) {
        if (res.legacy) {
          setIsLegacyOrder(true);
          setLegacyMessage(
            res.message || "Student-level alteration details are not available for this previous order."
          );
          setStudents([]);
        } else {
          setIsLegacyOrder(false);
          setLegacyMessage("");
          setStudents(res.students);
        }
      } else {
        setErrorMsg(res.error || "Unable to load students for this order.");
      }
    });
  };

  const handleStudentChange = (studentId: string | null) => {
    const val = studentId || "";
    setSelectedStudentId(val);
    setSelectedItemName("");
    setItems([]);
    setCurrentSize("");
    setRequiredSize("");
    setErrorMsg(null);

    if (!val || !selectedOrderId) return;

    setLoadingItems(true);
    getStudentOrderItems(selectedOrderId, val).then((res) => {
      setLoadingItems(false);
      if (res.success) {
        setItems(res.items);
      } else {
        setErrorMsg(res.error || "Unable to load items for this student.");
      }
    });
  };

  const handleItemChange = (itemName: string | null) => {
    const val = itemName || "";
    setSelectedItemName(val);
    setQuantity(1);
    setRequiredSize("");

    const item = items.find((i) => i.itemName === val);
    if (item) {
      setCurrentSize(item.currentSize || "");
    } else {
      setCurrentSize("");
    }
  };

  const selectedStudent = students.find((s) => s.id === selectedStudentId);
  const selectedItem = items.find((i) => i.itemName === selectedItemName);
  const isSizeRelated = reason && SIZE_RELATED_REASONS.includes(reason as AlterationReason);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setErrorMsg("Invalid image type. Please select a PNG, JPG, or WEBP file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg("Image size exceeds 5MB limit.");
      return;
    }

    setErrorMsg(null);
    setPhotoFile(file);
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
      setPhotoPreview(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!selectedOrderId) {
      setErrorMsg("Please select a delivered order.");
      return;
    }
    if (!selectedStudentId) {
      setErrorMsg("Please select a student.");
      return;
    }
    if (!selectedItemName) {
      setErrorMsg("Please select a uniform item.");
      return;
    }
    if (!reason) {
      setErrorMsg("Please select a reason for request.");
      return;
    }
    if (isSizeRelated && (!requiredSize || requiredSize.trim() === "")) {
      setErrorMsg("Required size is mandatory for size-related requests.");
      return;
    }
    if (quantity < 1) {
      setErrorMsg("Quantity must be at least 1.");
      return;
    }
    if (selectedItem && quantity > selectedItem.maxQuantity) {
      setErrorMsg(`Quantity cannot exceed the ordered quantity (${selectedItem.maxQuantity}).`);
      return;
    }

    startTransition(async () => {
      let uploadedPhotoUrl: string | null = null;

      if (photoFile) {
        setUploadingPhoto(true);
        const formData = new FormData();
        formData.append("file", photoFile);
        const uploadRes = await uploadAlterationProof(formData);
        setUploadingPhoto(false);

        if (!uploadRes.success) {
          setErrorMsg(uploadRes.error || "Failed to upload proof photo. Please try again.");
          return;
        }
        uploadedPhotoUrl = uploadRes.storagePath || null;
      }

      const res = await submitAlterationRequest({
        orderId: selectedOrderId,
        studentId: selectedStudentId,
        itemName: selectedItemName,
        reason: reason as AlterationReason,
        currentSize: currentSize || null,
        requiredSize: requiredSize || null,
        quantity,
        remarks: remarks || null,
        proofPhotoUrl: uploadedPhotoUrl,
      });

      if (!res.success) {
        setErrorMsg(res.error || "Unable to submit alteration request. Please try again.");
      } else {
        setSuccessMsg("Alteration request submitted successfully.");
        setTimeout(() => {
          setOpen(false);
          resetForm();
          if (onSuccess) onSuccess();
        }, 1200);
      }
    });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(dateStr));
  };

  return (
    <>
      <Button
        onClick={handleOpenDialog}
        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-medium shadow-sm"
      >
        <Plus className="h-4 w-4" />
        New Alteration Request
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-900">
              <Scissors className="h-5 w-5 text-emerald-600" />
              New Alteration Request
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-sm">
              Request corrections or rework for uniforms already delivered to your school.
            </DialogDescription>
          </DialogHeader>

          {errorMsg && (
            <div className="p-3 my-2 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-800">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Validation Error</div>
                <div>{errorMsg}</div>
              </div>
            </div>
          )}

          {successMsg && (
            <div className="p-3 my-2 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2 text-sm text-emerald-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Success</div>
                <div>{successMsg}</div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5 pt-2">
            {/* Step 1: Delivered Order Selector */}
            <div className="space-y-1.5">
              <Label htmlFor="orderSelect" className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                <Package className="h-4 w-4 text-slate-500" />
                1. Delivered Order <span className="text-red-500">*</span>
              </Label>
              {loadingOrders ? (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                  Loading delivered orders...
                </div>
              ) : orders.length === 0 ? (
                <div className="p-3 bg-slate-50 border rounded-md text-sm text-slate-500">
                  No delivered orders found for your school. Alteration requests can only be raised against delivered orders.
                </div>
              ) : (
                <Select
                  value={selectedOrderId}
                  onValueChange={handleOrderChange}
                >
                  <SelectTrigger id="orderSelect" className="w-full">
                    <SelectValue placeholder="Select delivered order..." />
                  </SelectTrigger>
                  <SelectContent>
                    {orders.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        <span className="font-medium text-slate-900">{o.order_number}</span>
                        <span className="text-xs text-slate-500 ml-2">
                          Ordered: {formatDate(o.created_at)} | Delivered: {formatDate(o.delivered_at)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Legacy Order Warning */}
            {isLegacyOrder && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-sm text-amber-900">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold">Legacy Order Notice</div>
                  <div>{legacyMessage}</div>
                </div>
              </div>
            )}

            {/* Step 2: Student Selector */}
            {selectedOrderId && !isLegacyOrder && (
              <div className="space-y-1.5">
                <Label htmlFor="studentSelect" className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                  <User className="h-4 w-4 text-slate-500" />
                  2. Student <span className="text-red-500">*</span>
                </Label>
                {loadingStudents ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                    Loading students for this order...
                  </div>
                ) : students.length === 0 ? (
                  <div className="p-3 bg-slate-50 border rounded-md text-sm text-slate-500">
                    No participating students found for this order.
                  </div>
                ) : (
                  <Select
                    value={selectedStudentId}
                    onValueChange={handleStudentChange}
                  >
                    <SelectTrigger id="studentSelect" className="w-full">
                      <SelectValue placeholder="Select student from this order..." />
                    </SelectTrigger>
                    <SelectContent>
                      {students.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          <span className="font-medium text-slate-900">{s.student_name}</span>
                          <span className="text-xs text-slate-500 ml-2">
                            ({s.class_name}-{s.section} | Adm: {s.admission_number})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Step 3: Student Information Card (Reference) */}
            {selectedStudent && (
              <div className="p-3.5 bg-slate-50 border rounded-lg space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Student Reference Information
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-slate-400">Name</div>
                    <div className="font-medium text-slate-900">{selectedStudent.student_name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Adm Number</div>
                    <div className="font-medium text-slate-900">{selectedStudent.admission_number}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Class</div>
                    <div className="font-medium text-slate-900">{selectedStudent.class_name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Section</div>
                    <div className="font-medium text-slate-900">{selectedStudent.section}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Gender</div>
                    <div className="font-medium text-slate-900">{selectedStudent.gender}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Uniform Item Selector */}
            {selectedStudentId && (
              <div className="space-y-1.5">
                <Label htmlFor="itemSelect" className="font-semibold text-slate-800 text-sm">
                  3. Uniform Item <span className="text-red-500">*</span>
                </Label>
                {loadingItems ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                    Loading items for this student...
                  </div>
                ) : items.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
                    No historical items found for this student in this order.
                  </div>
                ) : (
                  <Select
                    value={selectedItemName}
                    onValueChange={handleItemChange}
                  >
                    <SelectTrigger id="itemSelect" className="w-full">
                      <SelectValue placeholder="Select historical uniform item..." />
                    </SelectTrigger>
                    <SelectContent>
                      {items.map((i) => (
                        <SelectItem key={i.itemName} value={i.itemName}>
                          <span className="font-medium text-slate-900 capitalize">{i.itemName}</span>
                          {i.currentSize && (
                            <span className="text-xs text-slate-500 ml-2">
                              (Historical Size: {i.currentSize})
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Step 5: Reason for Request */}
            {selectedItemName && (
              <div className="space-y-4 pt-1 border-t border-slate-100">
                <div className="space-y-1.5">
                  <Label htmlFor="reasonSelect" className="font-semibold text-slate-800 text-sm">
                    Reason for Request <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={reason}
                    onValueChange={(val) => setReason((val as AlterationReason) || "")}
                  >
                    <SelectTrigger id="reasonSelect" className="w-full">
                      <SelectValue placeholder="Select alteration reason..." />
                    </SelectTrigger>
                    <SelectContent>
                      {ALTERATION_REASONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Step 6: Current Size & Required Size (Conditional) */}
                {isSizeRelated && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-blue-50/60 border border-blue-100 rounded-lg">
                    <div>
                      <Label className="text-xs font-semibold text-slate-600 mb-1 block">
                        Current Size (Historical)
                      </Label>
                      <div className="p-2 bg-white border rounded text-sm font-semibold text-slate-900">
                        {currentSize || "Not recorded"}
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="requiredSizeSelect" className="text-xs font-semibold text-slate-600 mb-1 block">
                        Required Size <span className="text-red-500">*</span>
                      </Label>
                      {selectedItem && selectedItem.availableSizes.length > 0 ? (
                        <Select
                          value={requiredSize}
                          onValueChange={(val) => setRequiredSize(val || "")}
                        >
                          <SelectTrigger id="requiredSizeSelect" className="bg-white">
                            <SelectValue placeholder="Select required size..." />
                          </SelectTrigger>
                          <SelectContent>
                            {selectedItem.availableSizes.map((sz) => (
                              <SelectItem key={sz} value={sz}>
                                Size {sz} {sz === currentSize ? "(Current)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id="requiredSizeSelect"
                          value={requiredSize}
                          onChange={(e) => setRequiredSize(e.target.value)}
                          placeholder="Enter required size (e.g. 34)"
                          className="bg-white"
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* Step 7: Quantity */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="quantityInput" className="font-semibold text-slate-800 text-sm">
                      Quantity <span className="text-red-500">*</span>
                    </Label>
                    {selectedItem && (
                      <span className="text-xs text-slate-500">
                        Maximum applicable in order: {selectedItem.maxQuantity}
                      </span>
                    )}
                  </div>
                  <Input
                    id="quantityInput"
                    type="number"
                    min={1}
                    max={selectedItem?.maxQuantity || 1}
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                    className="w-full"
                  />
                </div>

                {/* Step 8: Remarks */}
                <div className="space-y-1.5">
                  <Label htmlFor="remarksInput" className="font-semibold text-slate-800 text-sm">
                    Additional Remarks <span className="text-slate-400 font-normal">(Optional)</span>
                  </Label>
                  <Textarea
                    id="remarksInput"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Explain the problem (e.g., Exam shirt sleeve is tight, Pant received has stitching tear...)"
                    rows={3}
                    maxLength={1000}
                  />
                </div>

                {/* Step 9: Proof Photo */}
                <div className="space-y-2">
                  <Label className="font-semibold text-slate-800 text-sm flex items-center justify-between">
                    <span>Photo / Proof <span className="text-slate-400 font-normal">(Optional)</span></span>
                    <span className="text-xs text-slate-400">PNG, JPG, WEBP (Max 5MB)</span>
                  </Label>

                  {photoPreview ? (
                    <div className="relative inline-block border rounded-lg p-2 bg-slate-50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photoPreview}
                        alt="Proof Preview"
                        className="h-32 w-auto object-cover rounded border"
                      />
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 hover:bg-red-700 shadow"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <div className="text-xs text-slate-500 mt-1 truncate max-w-[200px]">
                        {photoFile?.name}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <label className="cursor-pointer border border-dashed border-slate-300 hover:border-emerald-500 rounded-lg p-3.5 flex items-center gap-2.5 text-sm text-slate-600 hover:text-emerald-700 bg-slate-50/50 hover:bg-emerald-50/30 transition-colors">
                        <Upload className="h-4 w-4" />
                        <span>Upload Proof Image</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/webp"
                          className="hidden"
                          onChange={handlePhotoChange}
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Dialog Action Buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isPending || uploadingPhoto}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={
                  isPending ||
                  uploadingPhoto ||
                  !selectedOrderId ||
                  !selectedStudentId ||
                  !selectedItemName ||
                  !reason ||
                  isLegacyOrder
                }
              >
                {isPending || uploadingPhoto ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Submitting Request...
                  </>
                ) : (
                  "Submit Alteration Request"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
