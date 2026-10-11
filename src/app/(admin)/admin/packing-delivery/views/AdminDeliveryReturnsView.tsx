"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OrderDeliveryReturn } from "@/types/database";
import { RotateCcw, Plus, Printer, FileText } from "lucide-react";
import { toast } from "sonner";
import { createDeliveryReturn, updateDeliveryReturnStatus } from "../actions";
import { useRouter } from "next/navigation";

interface AdminDeliveryReturnsViewProps {
  orderId: string;
  orderNumber: string;
  schoolId: string;
  schoolName: string;
  returns: OrderDeliveryReturn[];
  availableItems: Array<{
    styleName: string;
    itemName: string;
    color: string;
    size: string;
  }>;
  onPrintReturnNote: (record: OrderDeliveryReturn) => void;
}

export function AdminDeliveryReturnsView({
  orderId,
  orderNumber,
  schoolId,
  schoolName,
  returns,
  onPrintReturnNote,
}: AdminDeliveryReturnsViewProps) {
  const router = useRouter();

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [selectedStyle, setSelectedStyle] = useState("");
  const [selectedItem, setSelectedItem] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [returnQuantity, setReturnQuantity] = useState("1");
  const [returnReason, setReturnReason] = useState("");
  const [returnStatus, setReturnStatus] = useState<
    "pending" | "dispatched" | "in_transit" | "completed" | "cancelled"
  >("pending");
  const [dispatchDate, setDispatchDate] = useState("");
  const [trackingDetails, setTrackingDetails] = useState("");
  const [remarks, setRemarks] = useState("");

  // Edit / Status update state
  const [editingReturn, setEditingReturn] = useState<OrderDeliveryReturn | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const resetForm = () => {
    setSelectedStyle("");
    setSelectedItem("");
    setSelectedColor("");
    setSelectedSize("");
    setReturnQuantity("1");
    setReturnReason("");
    setReturnStatus("pending");
    setDispatchDate("");
    setTrackingDetails("");
    setRemarks("");
  };

  const handleCreateReturn = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedStyle.trim() || !selectedItem.trim() || !selectedColor.trim() || !selectedSize.trim()) {
      toast.error("Please fill in Style, Item, Color, and Size.");
      return;
    }

    const qty = parseInt(returnQuantity, 10);
    if (isNaN(qty) || qty <= 0) {
      toast.error("Return quantity must be a whole number greater than 0.");
      return;
    }

    if (!returnReason.trim() || returnReason.trim().length < 3) {
      toast.error("Please specify a reason for returning the items (at least 3 characters).");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createDeliveryReturn({
        orderId,
        schoolId,
        styleName: selectedStyle.trim(),
        itemName: selectedItem.trim(),
        color: selectedColor.trim(),
        size: selectedSize.trim(),
        quantity: qty,
        reason: returnReason.trim(),
        status: returnStatus,
        dispatchDate: dispatchDate || null,
        trackingDetails: trackingDetails.trim() || null,
        remarks: remarks.trim() || null,
      });

      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Return record created successfully.");
        setShowAddModal(false);
        resetForm();
        router.refresh();
      }
    } catch {
      toast.error("Failed to create return record.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!editingReturn) return;
    setIsUpdatingStatus(true);
    try {
      const res = await updateDeliveryReturnStatus(editingReturn.id, orderId, {
        status: editingReturn.status,
        dispatchDate: editingReturn.dispatch_date,
        trackingDetails: editingReturn.tracking_details,
        remarks: editingReturn.remarks,
      });

      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Return status updated successfully.");
        setEditingReturn(null);
        router.refresh();
      }
    } catch {
      toast.error("Failed to update return record.");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-evenvibe-primary" />
            Return / Send-Back to School Workflow
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Track garments that need to be returned to the school due to size mismatch, discrepancy, or defects.
          </p>
        </div>

        <Button
          type="button"
          size="sm"
          onClick={() => {
            resetForm();
            setShowAddModal(true);
          }}
          className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white font-medium text-xs gap-1.5 shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          Record Return / Send-Back
        </Button>
      </div>

      {/* Returns List */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
        <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-400" />
                Return Records ({returns.length})
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Each return record is tracked independently from standard order quantities.
              </CardDescription>
            </div>
            <Badge variant="outline" className="border-slate-300 text-xs">
              School: {schoolName}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {returns.length === 0 ? (
            <div className="p-10 text-center space-y-2 text-slate-500 text-xs">
              <RotateCcw className="w-8 h-8 mx-auto text-slate-300" />
              <p className="font-semibold text-slate-700 dark:text-slate-300">
                No return or send-back records found for this order.
              </p>
              <p className="text-slate-400 max-w-sm mx-auto">
                Use the &ldquo;Record Return / Send-Back&rdquo; button above if garments must be sent back to the school premises.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {returns.map((ret) => (
                <div
                  key={ret.id}
                  className="p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                        {ret.style_name}
                      </span>
                      <span className="text-slate-400">•</span>
                      <span className="text-slate-700 dark:text-slate-300 text-xs">
                        {ret.item_name} ({ret.color})
                      </span>
                      <span className="text-slate-400">•</span>
                      <Badge variant="secondary" className="text-xs font-bold px-2 py-0">
                        Size {ret.size}
                      </Badge>
                      <Badge className="bg-slate-900 text-white font-black text-xs px-2 py-0">
                        Qty: {ret.quantity} pcs
                      </Badge>

                      {/* Status Badge */}
                      <Badge
                        variant="outline"
                        className={
                          ret.status === "completed"
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300 font-bold"
                            : ret.status === "dispatched" || ret.status === "in_transit"
                            ? "bg-blue-50 text-blue-800 border-blue-300 font-bold"
                            : ret.status === "cancelled"
                            ? "bg-rose-50 text-rose-800 border-rose-300"
                            : "bg-amber-50 text-amber-800 border-amber-300 font-bold"
                        }
                      >
                        {ret.status.toUpperCase()}
                      </Badge>
                    </div>

                    <div className="text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
                      <p>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">Reason:</span>{" "}
                        {ret.reason}
                      </p>
                      {ret.tracking_details && (
                        <p>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">Tracking:</span>{" "}
                          {ret.tracking_details}
                        </p>
                      )}
                      {ret.remarks && (
                        <p>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">Remarks:</span>{" "}
                          {ret.remarks}
                        </p>
                      )}
                      <p className="text-[11px] text-slate-400">
                        Recorded on {new Date(ret.created_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {ret.dispatch_date ? ` • Dispatched on ${ret.dispatch_date}` : ""}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onPrintReturnNote(ret)}
                      className="text-xs gap-1.5"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-500" />
                      Print Return Note
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingReturn(ret)}
                      className="text-xs text-slate-600"
                    >
                      Update Status
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* MODAL: Record Return */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <RotateCcw className="w-5 h-5 text-evenvibe-primary" />
              Record Return / Send-Back to School
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Specify the garment details and reason for items sent back to {schoolName} (Order #{orderNumber}).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateReturn} className="space-y-3.5 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Style Name</Label>
                <Input
                  value={selectedStyle}
                  onChange={(e) => setSelectedStyle(e.target.value)}
                  placeholder="e.g. Vignesh Skirt"
                  required
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Item Name</Label>
                <Input
                  value={selectedItem}
                  onChange={(e) => setSelectedItem(e.target.value)}
                  placeholder="e.g. Skirt"
                  required
                  className="text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Color</Label>
                <Input
                  value={selectedColor}
                  onChange={(e) => setSelectedColor(e.target.value)}
                  placeholder="Navy Blue"
                  required
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Size</Label>
                <Input
                  value={selectedSize}
                  onChange={(e) => setSelectedSize(e.target.value)}
                  placeholder="28"
                  required
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Quantity</Label>
                <Input
                  type="number"
                  min="1"
                  value={returnQuantity}
                  onChange={(e) => setReturnQuantity(e.target.value)}
                  required
                  className="text-xs font-bold"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Reason for Return / Discrepancy *</Label>
              <Textarea
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="e.g. Size alteration needed, incorrect color batch sent, school requested return"
                rows={2}
                required
                className="text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Return Status</Label>
                <Select
                  value={returnStatus}
                  onValueChange={(val) => {
                    if (val) {
                      setReturnStatus(
                        val as "pending" | "dispatched" | "in_transit" | "completed" | "cancelled"
                      );
                    }
                  }}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="dispatched">Dispatched</SelectItem>
                    <SelectItem value="in_transit">In Transit</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Dispatch Date (Optional)</Label>
                <Input
                  type="date"
                  value={dispatchDate}
                  onChange={(e) => setDispatchDate(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Tracking / Handover Reference</Label>
              <Input
                value={trackingDetails}
                onChange={(e) => setTrackingDetails(e.target.value)}
                placeholder="e.g. Handover Note #892, Driver: Ramesh"
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Remarks (Optional)</Label>
              <Input
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Additional notes"
                className="text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAddModal(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting}
                className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white text-xs"
              >
                {isSubmitting ? "Saving..." : "Save Return Record"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: Update Return Status */}
      {editingReturn && (
        <Dialog open={Boolean(editingReturn)} onOpenChange={() => setEditingReturn(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-bold">
                Update Return Status
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Update return lifecycle status and handover details.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3.5 py-2">
              <div className="p-2.5 bg-slate-50 rounded border text-xs">
                <p className="font-semibold text-slate-900">
                  {editingReturn.style_name} • Size {editingReturn.size} ({editingReturn.quantity} pcs)
                </p>
                <p className="text-slate-500 mt-0.5">{editingReturn.reason}</p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Status</Label>
                <Select
                  value={editingReturn.status}
                  onValueChange={(val) => {
                    if (val) {
                      setEditingReturn({
                        ...editingReturn,
                        status: val as "pending" | "dispatched" | "in_transit" | "completed" | "cancelled",
                      });
                    }
                  }}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="dispatched">Dispatched</SelectItem>
                    <SelectItem value="in_transit">In Transit</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Dispatch Date</Label>
                <Input
                  type="date"
                  value={editingReturn.dispatch_date || ""}
                  onChange={(e) => setEditingReturn({ ...editingReturn, dispatch_date: e.target.value })}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Tracking / Handover Reference</Label>
                <Input
                  value={editingReturn.tracking_details || ""}
                  onChange={(e) => setEditingReturn({ ...editingReturn, tracking_details: e.target.value })}
                  placeholder="e.g. Courier Docket or Handover signature"
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Remarks</Label>
                <Textarea
                  value={editingReturn.remarks || ""}
                  onChange={(e) => setEditingReturn({ ...editingReturn, remarks: e.target.value })}
                  rows={2}
                  className="text-xs"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingReturn(null)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleUpdateStatus}
                disabled={isUpdatingStatus}
                className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white text-xs"
              >
                {isUpdatingStatus ? "Updating..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
