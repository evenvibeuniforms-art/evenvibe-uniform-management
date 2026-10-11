"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { OrderFollowupDispatch } from "@/types/database";
import { Truck, Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createFollowupDispatch } from "../actions";
import { useRouter } from "next/navigation";
import { getTodayDateIST } from "@/lib/utils";

interface FollowupItemDraft {
  styleName: string;
  itemName: string;
  color: string;
  size: string;
  quantity: number;
}

interface AdminDeliveryFollowupDispatchesViewProps {
  orderId: string;
  orderNumber: string;
  schoolId: string;
  schoolName: string;
  followupDispatches: OrderFollowupDispatch[];
  pendingShortItems: Array<{
    styleName: string;
    itemName: string;
    color: string;
    size: string;
    originalQuantity: number;
    actualQuantity: number;
    difference: number;
  }>;
  onPrintDispatchSheet: (dispatch: OrderFollowupDispatch) => void;
  openCreateModalDirectly?: boolean;
  onCloseCreateModalDirectly?: () => void;
}

export function AdminDeliveryFollowupDispatchesView({
  orderId,
  orderNumber,
  schoolId,
  schoolName,
  followupDispatches,
  pendingShortItems,
  onPrintDispatchSheet,
  openCreateModalDirectly = false,
  onCloseCreateModalDirectly,
}: AdminDeliveryFollowupDispatchesViewProps) {
  const router = useRouter();

  const [showModal, setShowModal] = useState(openCreateModalDirectly);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Fields
  const nextRefIndex = followupDispatches.length + 1;
  const [dispatchReference, setDispatchReference] = useState(
    `FD-${orderNumber}-${String(nextRefIndex).padStart(2, "0")}`
  );
  const [dispatchDate, setDispatchDate] = useState(getTodayDateIST());
  const [courierName, setCourierName] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [dispatchStatus, setDispatchStatus] = useState<
    "scheduled" | "dispatched" | "in_transit" | "delivered" | "cancelled"
  >("scheduled");
  const [remarks, setRemarks] = useState("");

  // Items draft
  const initialItems: FollowupItemDraft[] = pendingShortItems
    .filter((it) => it.difference < 0)
    .map((it) => ({
      styleName: it.styleName,
      itemName: it.itemName,
      color: it.color,
      size: it.size,
      quantity: Math.abs(it.difference),
    }));

  const [itemsDraft, setItemsDraft] = useState<FollowupItemDraft[]>(
    initialItems.length > 0
      ? initialItems
      : [
          {
            styleName: "",
            itemName: "",
            color: "",
            size: "",
            quantity: 1,
          },
        ]
  );

  const handleAddItemRow = () => {
    setItemsDraft((prev) => [
      ...prev,
      {
        styleName: "",
        itemName: "",
        color: "",
        size: "",
        quantity: 1,
      },
    ]);
  };

  const handleRemoveItemRow = (idx: number) => {
    setItemsDraft((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleItemFieldChange = (
    idx: number,
    field: keyof FollowupItemDraft,
    val: string | number
  ) => {
    setItemsDraft((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        return { ...row, [field]: val };
      })
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!dispatchReference.trim()) {
      toast.error("Dispatch reference is required.");
      return;
    }

    if (!dispatchDate) {
      toast.error("Dispatch date is required.");
      return;
    }

    if (itemsDraft.length === 0) {
      toast.error("Please add at least one item to this follow-up dispatch.");
      return;
    }

    for (const it of itemsDraft) {
      if (!it.styleName.trim() || !it.itemName.trim() || !it.color.trim() || !it.size.trim()) {
        toast.error("All item fields (Style, Item, Color, Size) must be filled.");
        return;
      }
      if (it.quantity <= 0) {
        toast.error("Quantity for each item must be at least 1.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const res = await createFollowupDispatch({
        orderId,
        schoolId,
        dispatchReference: dispatchReference.trim(),
        courierName: courierName.trim() || null,
        trackingNumber: trackingNumber.trim() || null,
        dispatchDate: dispatchDate.trim(),
        status: dispatchStatus,
        remarks: remarks.trim() || null,
        items: itemsDraft.map((it) => ({
          styleName: it.styleName.trim(),
          itemName: it.itemName.trim(),
          color: it.color.trim(),
          size: it.size.trim(),
          quantity: it.quantity,
        })),
      });

      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Follow-up dispatch created successfully.");
        setShowModal(false);
        if (onCloseCreateModalDirectly) onCloseCreateModalDirectly();
        router.refresh();
      }
    } catch {
      toast.error("Failed to create follow-up dispatch.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Truck className="w-5 h-5 text-evenvibe-primary" />
            Follow-Up Dispatches ({followupDispatches.length})
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage separate dispatches for items that were short in the initial delivery or need to be sent later.
          </p>
        </div>

        <Button
          type="button"
          size="sm"
          onClick={() => setShowModal(true)}
          className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white font-medium text-xs gap-1.5 shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          Create Follow-up Dispatch
        </Button>
      </div>

      {/* Dispatches List */}
      {followupDispatches.length === 0 ? (
        <Card className="border-dashed p-10 text-center text-slate-500 text-xs">
          <Truck className="w-8 h-8 mx-auto text-slate-300 mb-2" />
          <p className="font-semibold text-slate-700 dark:text-slate-300">
            No follow-up dispatches recorded yet for this order.
          </p>
          <p className="text-slate-400 max-w-sm mx-auto mt-1">
            If items were short in the primary delivery, click &ldquo;Create Follow-up Dispatch&rdquo; to schedule a subsequent shipment.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {followupDispatches.map((fd) => {
            const totalPieces = (fd.items || []).reduce((acc, it) => acc + it.quantity, 0);

            return (
              <Card
                key={fd.id}
                className="overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900"
              >
                <CardHeader className="bg-slate-50/70 dark:bg-slate-800/40 p-4 md:p-5 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                          Ref: {fd.dispatch_reference}
                        </span>
                        <Badge
                          variant="outline"
                          className={
                            fd.status === "delivered"
                              ? "bg-emerald-50 text-emerald-800 border-emerald-300 font-bold text-xs"
                              : fd.status === "dispatched" || fd.status === "in_transit"
                              ? "bg-blue-50 text-blue-800 border-blue-300 font-bold text-xs"
                              : "bg-amber-50 text-amber-800 border-amber-300 font-bold text-xs"
                          }
                        >
                          {fd.status.toUpperCase()}
                        </Badge>
                        <Badge className="bg-slate-900 text-white font-black text-xs">
                          {totalPieces} Pieces
                        </Badge>
                      </div>

                      <p className="text-xs text-slate-500">
                        Dispatch Date:{" "}
                        <strong className="text-slate-700 dark:text-slate-300">{fd.dispatch_date}</strong>
                        {fd.courier_name ? ` • Courier: ${fd.courier_name}` : ""}
                        {fd.tracking_number ? ` • Tracking: ${fd.tracking_number}` : ""}
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onPrintDispatchSheet(fd)}
                      className="text-xs gap-1.5 self-start sm:self-auto shrink-0"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-500" />
                      Print Dispatch Sheet
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="p-4 md:p-5 space-y-3">
                  <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/60 font-semibold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                          <th className="p-2 border-r border-slate-200 dark:border-slate-800">Style</th>
                          <th className="p-2 border-r border-slate-200 dark:border-slate-800">Item</th>
                          <th className="p-2 border-r border-slate-200 dark:border-slate-800">Color</th>
                          <th className="p-2 border-r border-slate-200 dark:border-slate-800 text-center">Size</th>
                          <th className="p-2 text-right">Dispatch Quantity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {(fd.items || []).map((it) => (
                          <tr key={it.id}>
                            <td className="p-2 font-semibold border-r border-slate-200 dark:border-slate-800">
                              {it.style_name}
                            </td>
                            <td className="p-2 border-r border-slate-200 dark:border-slate-800">{it.item_name}</td>
                            <td className="p-2 border-r border-slate-200 dark:border-slate-800">{it.color}</td>
                            <td className="p-2 border-r border-slate-200 dark:border-slate-800 text-center font-bold">
                              Size {it.size}
                            </td>
                            <td className="p-2 text-right font-bold text-slate-900 dark:text-slate-100">
                              {it.quantity} pcs
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {fd.remarks && (
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Remarks:</span>{" "}
                      {fd.remarks}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* MODAL: Create Follow-up Dispatch */}
      <Dialog
        open={showModal}
        onOpenChange={(open) => {
          setShowModal(open);
          if (!open && onCloseCreateModalDirectly) onCloseCreateModalDirectly();
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Truck className="w-5 h-5 text-evenvibe-primary" />
              Create Follow-Up Dispatch
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Schedule shipment for pending or short quantities for {schoolName} (Order #{orderNumber}).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Dispatch Reference Ref *</Label>
                <Input
                  value={dispatchReference}
                  onChange={(e) => setDispatchReference(e.target.value)}
                  required
                  className="text-xs font-bold"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Dispatch Date *</Label>
                <Input
                  type="date"
                  value={dispatchDate}
                  onChange={(e) => setDispatchDate(e.target.value)}
                  required
                  className="text-xs font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Courier / Partner</Label>
                <Input
                  value={courierName}
                  onChange={(e) => setCourierName(e.target.value)}
                  placeholder="e.g. BlueDart, DTDC"
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Tracking Number</Label>
                <Input
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="e.g. TRK1234567"
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Status</Label>
                <Select
                  value={dispatchStatus}
                  onValueChange={(val) => {
                    if (val) {
                      setDispatchStatus(
                        val as "scheduled" | "dispatched" | "in_transit" | "delivered" | "cancelled"
                      );
                    }
                  }}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="dispatched">Dispatched</SelectItem>
                    <SelectItem value="in_transit">In Transit</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Items Table in Modal */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Items to Include in Follow-up Dispatch ({itemsDraft.length})
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddItemRow}
                  className="h-7 text-xs gap-1"
                >
                  <Plus className="w-3 h-3" /> Add Item
                </Button>
              </div>

              <div className="border border-slate-200 rounded overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 font-semibold text-slate-700 border-b border-slate-200">
                      <th className="p-2">Style</th>
                      <th className="p-2">Item</th>
                      <th className="p-2">Color</th>
                      <th className="p-2 w-20">Size</th>
                      <th className="p-2 w-20 text-center">Qty</th>
                      <th className="p-2 w-10 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {itemsDraft.map((row, idx) => (
                      <tr key={idx}>
                        <td className="p-1.5">
                          <Input
                            value={row.styleName}
                            onChange={(e) => handleItemFieldChange(idx, "styleName", e.target.value)}
                            placeholder="Style"
                            required
                            className="h-7 text-xs"
                          />
                        </td>
                        <td className="p-1.5">
                          <Input
                            value={row.itemName}
                            onChange={(e) => handleItemFieldChange(idx, "itemName", e.target.value)}
                            placeholder="Item"
                            required
                            className="h-7 text-xs"
                          />
                        </td>
                        <td className="p-1.5">
                          <Input
                            value={row.color}
                            onChange={(e) => handleItemFieldChange(idx, "color", e.target.value)}
                            placeholder="Color"
                            required
                            className="h-7 text-xs"
                          />
                        </td>
                        <td className="p-1.5">
                          <Input
                            value={row.size}
                            onChange={(e) => handleItemFieldChange(idx, "size", e.target.value)}
                            placeholder="Size"
                            required
                            className="h-7 text-xs text-center"
                          />
                        </td>
                        <td className="p-1.5 text-center">
                          <Input
                            type="number"
                            min="1"
                            value={row.quantity}
                            onChange={(e) =>
                              handleItemFieldChange(idx, "quantity", parseInt(e.target.value, 10) || 1)
                            }
                            required
                            className="h-7 text-xs text-center font-bold"
                          />
                        </td>
                        <td className="p-1.5 text-center">
                          {itemsDraft.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveItemRow(idx)}
                              className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Remarks (Optional)</Label>
              <Textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Notes about this follow-up consignment"
                rows={2}
                className="text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowModal(false);
                  if (onCloseCreateModalDirectly) onCloseCreateModalDirectly();
                }}
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
                {isSubmitting ? "Creating..." : "Create Follow-up Dispatch"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
