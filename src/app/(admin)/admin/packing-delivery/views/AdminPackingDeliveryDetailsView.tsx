"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Truck,
  CheckCircle2,
  AlertCircle,
  Play,
  Save,
  Send,
  Package,
  Building2,
  Printer,
  Download,
  Loader2,
  History,
  ChevronDown,
  ChevronUp,
  Camera,
  UploadCloud,
  Trash2,
  Plus,
  Eye,
  X,
} from "lucide-react";

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
import { useRealtimeRefresh } from "@/lib/supabase/useRealtime";
import { DeliveryProofImage } from "@/types/database";
import { DeliveryProofLightbox } from "@/components/delivery/DeliveryProofLightbox";
import { getTodayDateIST } from "@/lib/utils";
import {
  startDelivery,
  saveDeliveryDetails,
  dispatchOrder,
  markOrderDelivered,
  uploadDeliveryProofImages,
  deleteDeliveryProofImage,
  saveDeliveryBatchActualQuantities,
  createNextDeliveryBatch,
  completeDeliveryBatch,
} from "../actions";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  OrderDeliveryActualItem,
  OrderDeliveryReturn,
  OrderFollowupDispatch,
  OrderDeliveryBatch,
} from "@/types/database";
import {
  AdminDeliveryQuantityMatrix,
  MatrixItem,
} from "./AdminDeliveryQuantityMatrix";
import { AdminDeliveryExtraShortView } from "./AdminDeliveryExtraShortView";
import { AdminDeliveryReturnsView } from "./AdminDeliveryReturnsView";
import { AdminDeliveryFollowupDispatchesView } from "./AdminDeliveryFollowupDispatchesView";
import {
  AdminDeliveryPrintDocuments,
  PrintableDocumentType,
} from "./AdminDeliveryPrintDocuments";

export interface DeliveryItemRow {
  id: string;
  styleName: string;
  itemName: string;
  color: string;
  size: string;
  quantity: number;
  status: "ready" | "in_progress" | "dispatched" | "delivered";
}

interface OrderInfo {
  id: string;
  order_number: string;
  status: string;
  courier_name: string | null;
  tracking_number: string | null;
  estimated_delivery: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  delivery_remarks?: string | null;
  created_at: string;
  updated_at: string;
  schools?: { id: string; name: string } | null;
}

interface QCRecord {
  id: string;
  status: string;
  total_quantity: number;
  checked_quantity: number;
  passed_quantity: number;
  defective_quantity: number;
  completed_at: string | null;
  remarks: string | null;
}

interface PackingRecord {
  id: string;
  status: string;
  total_quantity: number;
  packed_quantity: number;
  remarks: string | null;
  started_at: string | null;
  completed_at: string | null;
}

interface HistoryItem {
  id: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  created_at: string;
  profiles?: { full_name: string | null; role: string | null } | null;
}

interface OrderStatusHistoryItem {
  id: string;
  status: string;
  note: string | null;
  created_at: string;
}

interface AdminPackingDeliveryDetailsViewProps {
  order: OrderInfo;
  qcRecord: QCRecord | null;
  deliveryItems: DeliveryItemRow[];
  packingRecord: PackingRecord | null;
  packingHistory: HistoryItem[];
  orderStatusHistory: OrderStatusHistoryItem[];
  proofImages?: DeliveryProofImage[];
  savedActualItems?: OrderDeliveryActualItem[];
  deliveryReturns?: OrderDeliveryReturn[];
  followupDispatches?: OrderFollowupDispatch[];
  deliveryBatches?: OrderDeliveryBatch[];
  requirementItems?: Array<{
    id: string;
    item_name: string;
    style_id?: string | null;
    style_name?: string | null;
    color?: string | null;
    size: string;
    quantity: number;
  }>;
}

export default function AdminPackingDeliveryDetailsView({
  order,
  qcRecord,
  deliveryItems,
  packingRecord,
  packingHistory,
  orderStatusHistory,
  proofImages = [],
  savedActualItems = [],
  deliveryReturns = [],
  followupDispatches = [],
  deliveryBatches = [],
  requirementItems = [],
}: AdminPackingDeliveryDetailsViewProps) {
  const router = useRouter();

  // Realtime updates on orders, packing records, and delivery proof images
  useRealtimeRefresh({
    tables: [
      { table: "orders" },
      { table: "packing_records" },
      { table: "delivery_proof_images" },
    ],
  });

  // Section 3: Authoritative QC Completion Rule (or Production Bypassed)
  const isQcCompleted =
    qcRecord?.status === "completed" ||
    qcRecord?.status === "passed" ||
    (!qcRecord && ["confirmed", "packed", "dispatched", "in_transit", "delivered"].includes(order.status));

  // Section 11: Delivery Statuses
  const isDelivered = order.status === "delivered";
  const isDispatched = order.status === "dispatched" || order.status === "in_transit";
  const hasStartedDelivery = Boolean(packingRecord) || isDispatched || isDelivered;

  // Quantity calculations strictly from approved QC Passed quantity
  const totalApprovedQuantity = useMemo(() => {
    if (deliveryItems.length > 0) {
      return deliveryItems.reduce((acc, item) => acc + item.quantity, 0);
    }
    return qcRecord?.passed_quantity || 0;
  }, [deliveryItems, qcRecord?.passed_quantity]);

  // Active state representation
  const deliveryStatus: "pending_qc" | "ready" | "in_progress" | "dispatched" | "delivered" =
    useMemo(() => {
      if (!isQcCompleted) return "pending_qc";
      if (isDelivered) return "delivered";
      if (isDispatched) return "dispatched";
      if (hasStartedDelivery) return "in_progress";
      return "ready";
    }, [isQcCompleted, isDelivered, isDispatched, hasStartedDelivery]);

  // Section 13 & 20: Delivery Details Form State
  const [courierName, setCourierName] = useState(order.courier_name || "");
  const [trackingNumber, setTrackingNumber] = useState(order.tracking_number || "");
  const [estimatedDelivery, setEstimatedDelivery] = useState(
    order.estimated_delivery ? order.estimated_delivery.split("T")[0] : ""
  );
  const [deliveryRemarks, setDeliveryRemarks] = useState(
    order.delivery_remarks || packingRecord?.remarks || ""
  );

  // Estimated delivery date validation state
  const todayDateStr = useMemo(() => getTodayDateIST(), []);
  const initialSavedDate = useMemo(
    () => (order.estimated_delivery ? order.estimated_delivery.split("T")[0] : ""),
    [order.estimated_delivery]
  );
  const [dateError, setDateError] = useState<string | null>(null);

  const handleDateChange = (val: string) => {
    setEstimatedDelivery(val);
    if (val && val < todayDateStr && val !== initialSavedDate) {
      setDateError("Estimated delivery date cannot be earlier than today.");
    } else {
      setDateError(null);
    }
  };

  // Section: Delivery Quantities Matrix & Multi-Batch Consignment State
  const [activeTab, setActiveTab] = useState<string>("matrix");

  // 1. All original ordered items across the entire order (authoritative baseline)
  const allOriginalItems: MatrixItem[] = useMemo(() => {
    const map = new Map<string, MatrixItem>();
    const sourceList =
      requirementItems && requirementItems.length > 0
        ? requirementItems.map((r) => ({
            id: r.id,
            styleName: r.style_name?.trim() || "Standard",
            itemName: r.item_name?.trim() || "Uniform Item",
            color: r.color?.trim() || "Default",
            size: r.size?.trim() || "Standard",
            quantity: r.quantity || 0,
          }))
        : deliveryItems.map((d) => ({
            id: d.id,
            styleName: d.styleName?.trim() || "Standard",
            itemName: d.itemName?.trim() || "Uniform Item",
            color: d.color?.trim() || "Default",
            size: d.size?.trim() || "Standard",
            quantity: d.quantity || 0,
          }));

    for (const it of sourceList) {
      const k = `${it.styleName}_${it.itemName}_${it.color}_${it.size}`;
      if (map.has(k)) {
        map.get(k)!.originalQuantity += it.quantity;
      } else {
        map.set(k, {
          id: it.id,
          styleName: it.styleName,
          itemName: it.itemName,
          color: it.color,
          size: it.size,
          originalQuantity: it.quantity,
        });
      }
    }
    return Array.from(map.values());
  }, [requirementItems, deliveryItems]);

  // 2. Existing batch list sorted by batch number ascending
  const existingBatchList: OrderDeliveryBatch[] = useMemo(() => {
    if (deliveryBatches && deliveryBatches.length > 0) {
      return [...deliveryBatches].sort((a, b) => a.batch_number - b.batch_number);
    }
    // Fallback if legacy rows exist in savedActualItems before migration
    if (savedActualItems && savedActualItems.length > 0) {
      const distinctNums = Array.from(new Set(savedActualItems.map((s) => s.batch_number || 1))).sort((a, b) => a - b);
      return distinctNums.map((num) => ({
        id: `batch-${num}`,
        order_id: order.id,
        batch_number: num,
        batch_reference: `BATCH-${String(num).padStart(3, "0")}`,
        status: ["dispatched", "in_transit", "delivered"].includes(order.status) ? (order.status as "dispatched" | "delivered") : "draft",
        courier_name: order.courier_name,
        tracking_number: order.tracking_number,
        estimated_delivery: order.estimated_delivery,
        remarks: order.delivery_remarks || null,
        created_by: null,
        created_at: order.created_at,
        updated_at: order.updated_at,
        dispatched_at: order.shipped_at,
        delivered_at: order.delivered_at,
      }));
    }
    return [];
  }, [deliveryBatches, savedActualItems, order]);

  // 3. Finalized batches (quantities physically dispatched or delivered)
  const finalizedBatches = useMemo(() => {
    return existingBatchList.filter((b) =>
      ["dispatched", "in_transit", "delivered"].includes(b.status)
    );
  }, [existingBatchList]);

  // 4. Sum of finalized delivered quantities per combination (Independent Non-Netting Rule)
  const finalizedQuantitiesMap = useMemo(() => {
    const map = new Map<string, number>();
    const finBatchNums = new Set(finalizedBatches.map((b) => b.batch_number));
    if (finBatchNums.size === 0 && ["dispatched", "in_transit", "delivered"].includes(order.status)) {
      finBatchNums.add(1);
    }

    for (const s of savedActualItems) {
      const bNum = s.batch_number || 1;
      if (finBatchNums.has(bNum)) {
        const k = `${s.style_name.trim()}_${s.item_name.trim()}_${s.color.trim()}_${s.size.trim()}`;
        const prev = map.get(k) || 0;
        map.set(k, prev + s.actual_quantity);
      }
    }
    return map;
  }, [finalizedBatches, savedActualItems, order.status]);

  // 5. Active returns per combination (reduces accepted quantity, reappears as pending)
  const returnsMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const ret of deliveryReturns) {
      if (ret.status === "cancelled") continue;
      const k = `${ret.style_name.trim()}_${ret.item_name.trim()}_${ret.color.trim()}_${ret.size.trim()}`;
      const prev = map.get(k) || 0;
      map.set(k, prev + ret.quantity);
    }
    return map;
  }, [deliveryReturns]);

  // 6. Remaining and Extra quantities per combination:
  // Accepted/Retained = max(0, Finalized Delivered - Active Returns)
  // Remaining = max(0, Original - Accepted/Retained)
  // Extra = max(0, Accepted/Retained - Original)
  const remainingQuantitiesMap = useMemo(() => {
    const map = new Map<
      string,
      { original: number; finalized: number; returned: number; accepted: number; remaining: number; extra: number }
    >();
    for (const item of allOriginalItems) {
      const k = `${item.styleName}_${item.itemName}_${item.color}_${item.size}`;
      const fin = finalizedQuantitiesMap.get(k) || 0;
      const ret = returnsMap.get(k) || 0;
      const accepted = Math.max(0, fin - ret);
      const remaining = Math.max(0, item.originalQuantity - accepted);
      const extra = Math.max(0, accepted - item.originalQuantity);
      map.set(k, {
        original: item.originalQuantity,
        finalized: fin,
        returned: ret,
        accepted,
        remaining,
        extra,
      });
    }
    return map;
  }, [allOriginalItems, finalizedQuantitiesMap, returnsMap]);

  // Total remaining pieces pending across entire order
  const totalOrderRemaining = useMemo(() => {
    let sum = 0;
    for (const info of remainingQuantitiesMap.values()) {
      sum += info.remaining;
    }
    return sum;
  }, [remainingQuantitiesMap]);

  const totalOriginalOrderPieces = useMemo(() => {
    return allOriginalItems.reduce((acc, it) => acc + it.originalQuantity, 0);
  }, [allOriginalItems]);

  const totalFinalizedDeliveredPieces = useMemo(() => {
    let sum = 0;
    for (const info of remainingQuantitiesMap.values()) {
      sum += info.finalized;
    }
    return sum;
  }, [remainingQuantitiesMap]);

  const totalExtraPieces = useMemo(() => {
    let sum = 0;
    for (const info of remainingQuantitiesMap.values()) {
      sum += info.extra;
    }
    return sum;
  }, [remainingQuantitiesMap]);

  // 6. Active Draft Batch & Next Batch Number
  const activeDraftBatch = useMemo(() => {
    return existingBatchList.find((b) => b.status === "draft");
  }, [existingBatchList]);

  const activeBatchNumber = useMemo(() => {
    if (activeDraftBatch) return activeDraftBatch.batch_number;
    const maxNum = existingBatchList.reduce((max, b) => Math.max(max, b.batch_number), 0);
    return maxNum === 0 ? 1 : maxNum + 1;
  }, [activeDraftBatch, existingBatchList]);

  const activeBatchReference = useMemo(() => {
    return activeDraftBatch?.batch_reference || `BATCH-${String(activeBatchNumber).padStart(3, "0")}`;
  }, [activeDraftBatch, activeBatchNumber]);

  // 7. Selected Batch View: "active" | batch_number | "consolidated"
  const [selectedBatchView, setSelectedBatchView] = useState<number | "active" | "consolidated">(() => {
    if (totalOrderRemaining > 0) return "active";
    if (existingBatchList.length > 0) return existingBatchList[existingBatchList.length - 1].batch_number;
    return "consolidated";
  });

  // 8. Filter completed groups for next delivery entry (Requirement 3 & 4)
  const activeMatrixItems = useMemo(() => {
    return allOriginalItems
      .filter((it) => {
        const k = `${it.styleName}_${it.itemName}_${it.color}_${it.size}`;
        const rem = remainingQuantitiesMap.get(k)?.remaining || 0;
        return rem > 0;
      })
      .map((it) => {
        const k = `${it.styleName}_${it.itemName}_${it.color}_${it.size}`;
        const rem = remainingQuantitiesMap.get(k)?.remaining || 0;
        return {
          ...it,
          originalQuantity: it.originalQuantity,
          pendingQuantity: rem,
        };
      });
  }, [allOriginalItems, remainingQuantitiesMap]);

  // 9. Active batch input quantities state & validation errors
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [activeBatchActuals, setActiveBatchActuals] = useState<Record<string, string>>({});

  const handleQuantityChange = (key: string, val: string) => {
    setActiveBatchActuals((prev) => ({ ...prev, [key]: val }));
    if (validationErrors[key]) {
      setValidationErrors((prev) => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    }
  };

  const handleFillMissingZeroes = () => {
    setActiveBatchActuals((prev) => {
      const updated = { ...prev };
      for (const item of activeMatrixItems) {
        const k = `${item.styleName}_${item.itemName}_${item.color}_${item.size}`;
        if (updated[k] === undefined || updated[k].trim() === "") {
          updated[k] = "0";
        }
      }
      return updated;
    });
    setValidationErrors({});
    toast.success("Filled missing delivery quantities with 0.");
  };

  // Helper to determine the currently selected batch record (if viewing a specific number)
  const selectedBatchRecord = useMemo(() => {
    if (typeof selectedBatchView === "number") {
      return existingBatchList.find((b) => b.batch_number === selectedBatchView) || null;
    }
    return null;
  }, [selectedBatchView, existingBatchList]);

  // Target batch number being operated on (if active view or draft batch view)
  const targetBatchNumber = useMemo(() => {
    if (typeof selectedBatchView === "number" && selectedBatchRecord?.status === "draft") {
      return selectedBatchView;
    }
    return activeBatchNumber;
  }, [selectedBatchView, selectedBatchRecord, activeBatchNumber]);

  // Is the current view an editable batch entry (active entry or draft batch)?
  const isEditingActiveBatch = useMemo(() => {
    if (selectedBatchView === "active") return totalOrderRemaining > 0;
    if (typeof selectedBatchView === "number") {
      return selectedBatchRecord?.status === "draft";
    }
    return false;
  }, [selectedBatchView, totalOrderRemaining, selectedBatchRecord]);

  // Read-only logic strictly based on the currently selected batch (User Requirement)
  const isCurrentMatrixReadOnly = useMemo(() => {
    if (selectedBatchView === "consolidated") return true;
    if (selectedBatchView === "active") {
      return totalOrderRemaining === 0;
    }
    if (typeof selectedBatchView === "number") {
      // Draft batches are editable!
      if (selectedBatchRecord?.status === "draft") {
        return false;
      }
      // Dispatched, in_transit, delivered batches are read-only to protect audit trail
      return true;
    }
    return true;
  }, [selectedBatchView, totalOrderRemaining, selectedBatchRecord]);

  // Dynamic matrix items for current selected view
  const currentMatrixItems: MatrixItem[] = useMemo(() => {
    if (isEditingActiveBatch) {
      return activeMatrixItems;
    }
    if (typeof selectedBatchView === "number") {
      // In historical/finalized batch view, show ONLY combinations that had positive actual deliveries in that batch
      const batchItems = savedActualItems.filter(
        (s) => (s.batch_number || 1) === selectedBatchView && s.actual_quantity > 0
      );
      if (batchItems.length > 0) {
        return batchItems.map((s) => {
          const k = `${s.style_name.trim()}_${s.item_name.trim()}_${s.color.trim()}_${s.size.trim()}`;
          const origMatch = allOriginalItems.find(
            (o) =>
              o.styleName.trim() === s.style_name.trim() &&
              o.itemName.trim() === s.item_name.trim() &&
              o.color.trim() === s.color.trim() &&
              o.size.trim() === s.size.trim()
          );
          const remInfo = remainingQuantitiesMap.get(k);
          return {
            id: s.id,
            styleName: s.style_name.trim(),
            itemName: s.item_name.trim(),
            color: s.color.trim(),
            size: s.size.trim(),
            originalQuantity: origMatch ? origMatch.originalQuantity : s.original_quantity,
            pendingQuantity: remInfo ? remInfo.remaining : 0,
          };
        });
      }
      return [];
    }
    return allOriginalItems.map((it) => {
      const k = `${it.styleName}_${it.itemName}_${it.color}_${it.size}`;
      return {
        ...it,
        pendingQuantity: remainingQuantitiesMap.get(k)?.remaining || 0,
      };
    });
  }, [
    isEditingActiveBatch,
    activeMatrixItems,
    selectedBatchView,
    savedActualItems,
    allOriginalItems,
    remainingQuantitiesMap,
  ]);

  // Dynamic actual quantities for current selected view (pre-populates active pending items with '0' or draft value)
  const currentActualQuantities: Record<string, string> = useMemo(() => {
    if (isEditingActiveBatch) {
      const map: Record<string, string> = {};
      const draftItems = savedActualItems.filter((s) => (s.batch_number || 1) === targetBatchNumber);
      const draftMap = new Map<string, number>();
      for (const it of draftItems) {
        const k = `${it.style_name.trim()}_${it.item_name.trim()}_${it.color.trim()}_${it.size.trim()}`;
        draftMap.set(k, it.actual_quantity);
      }
      for (const it of activeMatrixItems) {
        const k = `${it.styleName}_${it.itemName}_${it.color}_${it.size}`;
        if (activeBatchActuals[k] !== undefined) {
          map[k] = activeBatchActuals[k];
        } else if (draftMap.has(k)) {
          map[k] = String(draftMap.get(k));
        } else {
          map[k] = "0";
        }
      }
      return map;
    }
    if (typeof selectedBatchView === "number") {
      const map: Record<string, string> = {};
      const batchItems = savedActualItems.filter(
        (s) => (s.batch_number || 1) === selectedBatchView && s.actual_quantity > 0
      );
      for (const s of batchItems) {
        const k = `${s.style_name.trim()}_${s.item_name.trim()}_${s.color.trim()}_${s.size.trim()}`;
        map[k] = String(s.actual_quantity);
      }
      return map;
    }
    // Consolidated
    const map: Record<string, string> = {};
    for (const item of allOriginalItems) {
      const k = `${item.styleName}_${item.itemName}_${item.color}_${item.size}`;
      map[k] = String(finalizedQuantitiesMap.get(k) || 0);
    }
    return map;
  }, [
    isEditingActiveBatch,
    targetBatchNumber,
    activeBatchActuals,
    savedActualItems,
    activeMatrixItems,
    selectedBatchView,
    allOriginalItems,
    finalizedQuantitiesMap,
  ]);

  const hasUnsavedChanges = useMemo(() => {
    if (isCurrentMatrixReadOnly) return false;
    for (const item of activeMatrixItems) {
      const k = `${item.styleName}_${item.itemName}_${item.color}_${item.size}`;
      const currentVal = activeBatchActuals[k] ?? "";
      const savedMatch = savedActualItems.find(
        (s) =>
          (s.batch_number || 1) === targetBatchNumber &&
          s.style_name.trim() === item.styleName &&
          s.item_name.trim() === item.itemName &&
          s.color.trim() === item.color &&
          s.size.trim() === item.size
      );
      const savedVal = savedMatch !== undefined ? String(savedMatch.actual_quantity) : "";
      if (currentVal !== savedVal) return true;
    }
    return false;
  }, [
    isCurrentMatrixReadOnly,
    activeMatrixItems,
    activeBatchActuals,
    savedActualItems,
    targetBatchNumber,
  ]);

  // Reconciliation for current view
  const reconciliationData = useMemo(() => {
    let totalOriginal = 0;
    let totalActual = 0;
    let totalExtra = 0;
    let totalShort = 0;
    let totalNotDelivered = 0;

    const rows: Array<{
      styleName: string;
      itemName: string;
      color: string;
      size: string;
      originalQuantity: number;
      actualQuantity: number;
      difference: number;
      classification: "exact" | "extra" | "short" | "not_delivered";
    }> = [];

    for (const item of currentMatrixItems) {
      const k = `${item.styleName}_${item.itemName}_${item.color}_${item.size}`;
      const valStr = currentActualQuantities[k];
      const orig = item.originalQuantity;
      totalOriginal += orig;

      const actNum = valStr !== undefined && valStr.trim() !== "" ? parseInt(valStr, 10) : 0;
      const act = isNaN(actNum) || actNum < 0 ? 0 : actNum;
      totalActual += act;

      const diff = act - orig;
      let classification: "exact" | "extra" | "short" | "not_delivered";

      if (diff === 0) {
        classification = "exact";
      } else if (diff > 0) {
        classification = "extra";
        totalExtra += diff;
      } else {
        if (act === 0 && orig > 0) {
          classification = "not_delivered";
          totalNotDelivered += orig;
          totalShort += orig;
        } else {
          classification = "short";
          totalShort += orig - act;
        }
      }

      rows.push({
        styleName: item.styleName,
        itemName: item.itemName,
        color: item.color,
        size: item.size,
        originalQuantity: orig,
        actualQuantity: act,
        difference: diff,
        classification,
      });
    }

    return {
      rows,
      summary: {
        totalOriginal,
        totalActual,
        totalExtra,
        totalShort,
        totalNotDelivered,
      },
    };
  }, [currentMatrixItems, currentActualQuantities]);

  // Consolidated reconciliation data across all finalized batches (for Extra/Short & summary cards)
  const consolidatedReconciliationData = useMemo(() => {
    let totalOriginal = 0;
    let totalActual = 0;
    let totalExtra = 0;
    let totalShort = 0;
    let totalNotDelivered = 0;

    const rows: Array<{
      styleName: string;
      itemName: string;
      color: string;
      size: string;
      originalQuantity: number;
      actualQuantity: number;
      difference: number;
      classification: "exact" | "extra" | "short" | "not_delivered";
    }> = [];

    for (const item of allOriginalItems) {
      const k = `${item.styleName}_${item.itemName}_${item.color}_${item.size}`;
      const orig = item.originalQuantity;
      const rec = remainingQuantitiesMap.get(k);
      // Accepted/retained quantity = max(0, finalized delivered - active returned)
      const act = rec ? rec.accepted : (finalizedQuantitiesMap.get(k) || 0);
      const rem = rec ? rec.remaining : Math.max(0, orig - act);
      const extra = rec ? rec.extra : Math.max(0, act - orig);
      const diff = act - orig;

      totalOriginal += orig;
      totalActual += act;

      let classification: "exact" | "extra" | "short" | "not_delivered";

      if (diff === 0) {
        classification = "exact";
      } else if (diff > 0) {
        classification = "extra";
        totalExtra += extra;
      } else {
        if (act === 0 && orig > 0) {
          classification = "not_delivered";
          totalNotDelivered += orig;
          totalShort += rem;
        } else {
          classification = "short";
          totalShort += rem;
        }
      }

      rows.push({
        styleName: item.styleName,
        itemName: item.itemName,
        color: item.color,
        size: item.size,
        originalQuantity: orig,
        actualQuantity: act,
        difference: diff,
        classification,
      });
    }

    return {
      rows,
      summary: {
        totalOriginal,
        totalActual,
        totalExtra,
        totalShort,
        totalNotDelivered,
      },
    };
  }, [allOriginalItems, remainingQuantitiesMap, finalizedQuantitiesMap]);

  const [isSavingQuantities, setIsSavingQuantities] = useState(false);
  const [isFinalizingBatch, setIsFinalizingBatch] = useState(false);

  // Validate active batch: ensures every active pending combination has an explicit non-negative number
  // Highlights missing or invalid fields and does NOT validate completed/hidden items.
  const validateActiveBatchQuantities = () => {
    const errors: Record<string, string> = {};
    let firstErrorMsg: string | null = null;

    for (const item of activeMatrixItems) {
      const k = `${item.styleName}_${item.itemName}_${item.color}_${item.size}`;
      const valStr = currentActualQuantities[k];

      if (valStr === undefined || valStr.trim() === "") {
        errors[k] = "Required (enter 0 if none delivered)";
        if (!firstErrorMsg) {
          firstErrorMsg = `Please enter actual delivery quantity for ${item.styleName} (Size ${item.size}). Enter 0 if none delivered.`;
        }
        continue;
      }

      const num = parseInt(valStr.trim(), 10);
      if (isNaN(num) || num < 0 || String(num) !== valStr.trim()) {
        errors[k] = "Must be a whole number (0, 1, 2...)";
        if (!firstErrorMsg) {
          firstErrorMsg = `Invalid quantity for ${item.styleName} (Size ${item.size}). Must be a non-negative whole number (0, 1, 2...).`;
        }
      }
    }

    setValidationErrors(errors);

    if (firstErrorMsg) {
      toast.error(firstErrorMsg);
      return false;
    }

    return true;
  };

  // Save Draft: preserve incomplete entries without blocking, defaulting blanks to 0
  const handleSaveActualQuantities = async () => {
    // Only check that entered non-empty fields are valid non-negative numbers
    const invalidErrors: Record<string, string> = {};
    for (const item of activeMatrixItems) {
      const k = `${item.styleName}_${item.itemName}_${item.color}_${item.size}`;
      const valStr = currentActualQuantities[k];
      if (valStr !== undefined && valStr.trim() !== "") {
        const num = parseInt(valStr.trim(), 10);
        if (isNaN(num) || num < 0 || String(num) !== valStr.trim()) {
          invalidErrors[k] = "Must be a non-negative whole number";
        }
      }
    }

    if (Object.keys(invalidErrors).length > 0) {
      setValidationErrors(invalidErrors);
      toast.error("Please enter valid numbers before saving draft.");
      return;
    }

    setIsSavingQuantities(true);
    try {
      const payload = activeMatrixItems.map((item) => {
        const k = `${item.styleName}_${item.itemName}_${item.color}_${item.size}`;
        const valStr = currentActualQuantities[k];
        const act = valStr !== undefined && valStr.trim() !== "" ? parseInt(valStr.trim(), 10) : 0;
        return {
          styleName: item.styleName,
          itemName: item.itemName,
          color: item.color,
          size: item.size,
          originalQuantity: item.originalQuantity,
          actualQuantity: isNaN(act) || act < 0 ? 0 : act,
        };
      });

      const targetBatchRef =
        existingBatchList.find((b) => b.batch_number === targetBatchNumber)?.batch_reference ||
        `BATCH-${String(targetBatchNumber).padStart(3, "0")}`;

      const res = await saveDeliveryBatchActualQuantities({
        orderId: order.id,
        batchNumber: targetBatchNumber,
        batchReference: targetBatchRef,
        courierName: courierName || null,
        trackingNumber: trackingNumber || null,
        estimatedDelivery: estimatedDelivery || null,
        remarks: deliveryRemarks || null,
        status: "draft",
        items: payload,
      });

      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`Draft saved for Batch #${targetBatchNumber}. Quantities do not reduce pending totals until finalized.`);
        router.refresh();
      }
    } catch {
      toast.error("Failed to save delivery batch quantities.");
    } finally {
      setIsSavingQuantities(false);
    }
  };

  // Finalize Batch: enforce that every active item has an explicit valid quantity
  const handleFinalizeDeliveryBatch = async () => {
    if (!validateActiveBatchQuantities()) return;

    // Check if target batch has already been finalized
    const targetBatch = existingBatchList.find((b) => b.batch_number === targetBatchNumber);
    if (targetBatch && ["dispatched", "in_transit", "delivered"].includes(targetBatch.status)) {
      toast.error(`Batch #${targetBatchNumber} has already been finalized and cannot be modified.`);
      return;
    }

    setIsFinalizingBatch(true);
    try {
      const payload = activeMatrixItems.map((item) => {
        const k = `${item.styleName}_${item.itemName}_${item.color}_${item.size}`;
        const act = parseInt(currentActualQuantities[k].trim(), 10);
        return {
          styleName: item.styleName,
          itemName: item.itemName,
          color: item.color,
          size: item.size,
          originalQuantity: item.originalQuantity,
          actualQuantity: isNaN(act) ? 0 : act,
        };
      });

      const targetBatchRef =
        existingBatchList.find((b) => b.batch_number === targetBatchNumber)?.batch_reference ||
        `BATCH-${String(targetBatchNumber).padStart(3, "0")}`;

      const res = await saveDeliveryBatchActualQuantities({
        orderId: order.id,
        batchNumber: targetBatchNumber,
        batchReference: targetBatchRef,
        courierName: courierName || null,
        trackingNumber: trackingNumber || null,
        estimatedDelivery: estimatedDelivery || null,
        remarks: deliveryRemarks || null,
        status: "dispatched",
        items: payload,
      });

      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`Batch #${targetBatchNumber} finalized and dispatched successfully!`);
        router.refresh();
      }
    } catch {
      toast.error("Failed to finalize delivery batch.");
    } finally {
      setIsFinalizingBatch(false);
    }
  };

  const [isCreatingBatch, setIsCreatingBatch] = useState(false);
  const handleCreateNextBatch = async () => {
    setIsCreatingBatch(true);
    try {
      const res = await createNextDeliveryBatch(order.id);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Created new delivery batch.");
        setSelectedBatchView("active");
        router.refresh();
      }
    } catch {
      toast.error("Failed to create next delivery batch");
    } finally {
      setIsCreatingBatch(false);
    }
  };

  const handlePrintStyle = (styleName: string) => {
    const bNum =
      selectedBatchView === "active"
        ? activeBatchNumber
        : typeof selectedBatchView === "number"
        ? selectedBatchView
        : undefined;
    const bRef =
      selectedBatchView === "active"
        ? activeBatchReference
        : typeof selectedBatchView === "number"
        ? `BATCH-${String(selectedBatchView).padStart(3, "0")}`
        : undefined;

    handleTriggerPrint({
      type: "style_delivery_sheet",
      styleName,
      batchNumber: bNum,
      batchReference: bRef,
    });
  };

  // Printable Document State
  const [activePrintDoc, setActivePrintDoc] = useState<PrintableDocumentType | null>(null);

  const handleTriggerPrint = (doc: PrintableDocumentType) => {
    setActivePrintDoc(doc);
    setTimeout(() => {
      window.print();
    }, 120);
  };

  useEffect(() => {
    if (!activePrintDoc) return;
    const handleAfterPrint = () => {
      setActivePrintDoc(null);
    };
    window.addEventListener("afterprint", handleAfterPrint);
    return () => {
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, [activePrintDoc]);

  // Modal states
  const [showStartModal, setShowStartModal] = useState(false);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [showDeliveredModal, setShowDeliveredModal] = useState(false);
  const [showCompleteBatchModal, setShowCompleteBatchModal] = useState(false);
  const [batchToComplete, setBatchToComplete] = useState<OrderDeliveryBatch | null>(null);
  const [completeBatchRemarks, setCompleteBatchRemarks] = useState("");
  const [startRemarks, setStartRemarks] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  // Loading states
  const [isStarting, setIsStarting] = useState(false);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [isMarkingDelivered, setIsMarkingDelivered] = useState(false);
  const [isCompletingBatch, setIsCompletingBatch] = useState(false);

  // Delivery Proof state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedProofFiles, setSelectedProofFiles] = useState<File[]>([]);
  const [proofPreviews, setProofPreviews] = useState<{ file: File; url: string }[]>([]);
  const [proofCaption, setProofCaption] = useState("");
  const [isUploadingProof, setIsUploadingProof] = useState(false);
  const [imageToDelete, setImageToDelete] = useState<DeliveryProofImage | null>(null);
  const [isDeletingImage, setIsDeletingImage] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const handleProofFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const filesArray = Array.from(e.target.files);
    const MAX_SIZE = 10 * 1024 * 1024;
    const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/jpg"];

    for (const f of filesArray) {
      if (f.size > MAX_SIZE) {
        toast.error(`"${f.name}" is too large. Maximum size is 10 MB.`);
        return;
      }
      if (!ALLOWED.includes(f.type)) {
        toast.error(`"${f.name}" has an unsupported format. Allowed: JPEG, PNG, WebP.`);
        return;
      }
    }

    const merged = [...selectedProofFiles, ...filesArray];
    setSelectedProofFiles(merged);
    const newPreviews = merged.map((f) => ({ file: f, url: URL.createObjectURL(f) }));
    setProofPreviews(newPreviews);
  };

  const handleRemoveProofPreview = (index: number) => {
    const updated = selectedProofFiles.filter((_, idx) => idx !== index);
    setSelectedProofFiles(updated);
    const newPreviews = updated.map((f) => ({ file: f, url: URL.createObjectURL(f) }));
    setProofPreviews(newPreviews);
  };

  const handleUploadProof = async () => {
    if (selectedProofFiles.length === 0) return;
    setIsUploadingProof(true);
    try {
      const formData = new FormData();
      formData.append("orderId", order.id);
      if (proofCaption.trim()) {
        formData.append("caption", proofCaption.trim());
      }
      selectedProofFiles.forEach((file) => formData.append("files", file));

      const res = await uploadDeliveryProofImages(formData);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`Successfully uploaded ${res.count} proof ${res.count === 1 ? "photo" : "photos"}`);
        setSelectedProofFiles([]);
        setProofPreviews([]);
        setProofCaption("");
        if (fileInputRef.current) fileInputRef.current.value = "";
        router.refresh();
      }
    } catch {
      toast.error("Failed to upload delivery proof");
    } finally {
      setIsUploadingProof(false);
    }
  };

  const handleDeleteProof = async () => {
    if (!imageToDelete) return;
    setIsDeletingImage(true);
    try {
      const res = await deleteDeliveryProofImage(imageToDelete.id, order.id);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Delivery proof photo deleted");
        setImageToDelete(null);
        router.refresh();
      }
    } catch {
      toast.error("Failed to delete delivery proof");
    } finally {
      setIsDeletingImage(false);
    }
  };

  // Date formatting helper
  const formatDate = (dateString?: string | null, includeTime = false) => {
    if (!dateString) return "—";
    const d = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
      year: "numeric",
    };
    if (includeTime) {
      options.hour = "2-digit";
      options.minute = "2-digit";
    }
    return d.toLocaleDateString("en-US", options);
  };

  // Section 12: Start Delivery Handler
  const handleStartDelivery = async () => {
    if (!isQcCompleted) {
      toast.error("Complete Quality Check before starting delivery.");
      return;
    }
    if (totalApprovedQuantity <= 0) {
      toast.error("No approved pieces are available for delivery.");
      return;
    }

    setIsStarting(true);
    try {
      const res = await startDelivery(order.id, startRemarks.trim() || undefined);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Delivery preparation started successfully.");
        setShowStartModal(false);
        router.refresh();
      }
    } catch (err: unknown) {
      console.error("Start delivery error:", err);
      toast.error("Failed to start delivery. Please try again.");
    } finally {
      setIsStarting(false);
    }
  };

  // Section 13 & 20: Save Delivery Details Handler
  const handleSaveDetails = async () => {
    if (estimatedDelivery && estimatedDelivery < todayDateStr && estimatedDelivery !== initialSavedDate) {
      setDateError("Estimated delivery date cannot be earlier than today.");
      toast.error("Estimated delivery date cannot be earlier than today.");
      return;
    }
    setDateError(null);
    setIsSavingDetails(true);
    try {
      const res = await saveDeliveryDetails(order.id, {
        courierName: courierName.trim() || null,
        trackingNumber: trackingNumber.trim() || null,
        estimatedDelivery: estimatedDelivery || null,
        remarks: deliveryRemarks.trim() || null,
      });

      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Delivery details saved successfully.");
        router.refresh();
      }
    } catch (err: unknown) {
      console.error("Save details error:", err);
      toast.error("Failed to save delivery details.");
    } finally {
      setIsSavingDetails(false);
    }
  };

  // Section 15: Mark as Dispatched Handler
  const handleDispatchOrder = async () => {
    if (estimatedDelivery && estimatedDelivery < todayDateStr && estimatedDelivery !== initialSavedDate) {
      setDateError("Estimated delivery date cannot be earlier than today.");
      toast.error("Estimated delivery date cannot be earlier than today.");
      return;
    }
    setDateError(null);
    setIsDispatching(true);
    try {
      const res = await dispatchOrder(
        order.id,
        courierName.trim() || null,
        trackingNumber.trim() || null,
        estimatedDelivery || null,
        deliveryRemarks.trim() || null
      );

      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Order marked as Dispatched successfully.");
        setShowDispatchModal(false);
        router.refresh();
      }
    } catch (err: unknown) {
      console.error("Dispatch order error:", err);
      toast.error("Failed to dispatch order.");
    } finally {
      setIsDispatching(false);
    }
  };

  // Section 16: Mark as Delivered Handler
  const handleMarkDelivered = async () => {
    setIsMarkingDelivered(true);
    try {
      const res = await markOrderDelivered(
        order.id,
        "Consignment delivered to school premises by Admin",
        deliveryRemarks.trim() || undefined
      );

      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Order marked as Delivered successfully.");
        setShowDeliveredModal(false);
        router.refresh();
      }
    } catch (err: unknown) {
      console.error("Mark delivered error:", err);
      toast.error("Failed to mark order as delivered.");
    } finally {
      setIsMarkingDelivered(false);
    }
  };

  // Section 16B: Complete Specific Consignment Batch Handler
  const handleCompleteBatch = async () => {
    if (!batchToComplete) return;
    setIsCompletingBatch(true);
    try {
      const res = await completeDeliveryBatch(
        order.id,
        batchToComplete.batch_number,
        completeBatchRemarks.trim() || undefined
      );

      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(
          `Consignment Batch #${batchToComplete.batch_number} marked as Delivered successfully.`
        );
        setShowCompleteBatchModal(false);
        setCompleteBatchRemarks("");
        setBatchToComplete(null);
        router.refresh();
      }
    } catch (err: unknown) {
      console.error("Complete batch error:", err);
      toast.error("Failed to complete batch delivery.");
    } finally {
      setIsCompletingBatch(false);
    }
  };

  // Section 29: Excel Export
  const handleExportExcel = async () => {
    if (deliveryItems.length === 0) {
      toast.error("No delivery items available to export.");
      return;
    }

    const exportRows = deliveryItems.map((item) => ({
      "Order Number": order.order_number,
      School: order.schools?.name || "Unknown School",
      Style: item.styleName,
      Item: item.itemName,
      Color: item.color,
      Size: item.size,
      "Approved Quantity": item.quantity,
      "Delivered Quantity": isDelivered ? item.quantity : 0,
      "Pending Quantity": isDelivered ? 0 : item.quantity,
      Status:
        deliveryStatus === "delivered"
          ? "Delivered"
          : deliveryStatus === "dispatched"
          ? "Dispatched"
          : deliveryStatus === "in_progress"
          ? "In Progress"
          : "Ready",
    }));

    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Delivery Items");
    XLSX.writeFile(wb, `EVENVIBE-Delivery-${order.order_number}.xlsx`);
    toast.success("Delivery Excel report downloaded.");
  };

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Navigation & Breadcrumbs */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/admin/packing-delivery"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Delivery List
        </Link>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleTriggerPrint({ type: "delivery_sheet" })}
            className="inline-flex items-center gap-1.5 text-xs bg-white dark:bg-slate-900 shadow-2xs"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            Print Delivery Sheet
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleTriggerPrint({ type: "extra_short_report" })}
            className="inline-flex items-center gap-1.5 text-xs bg-white dark:bg-slate-900 shadow-2xs"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            Print Extra / Short Report
          </Button>

          {deliveryItems.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 text-xs bg-white dark:bg-slate-900 shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              Export Excel
            </Button>
          )}
        </div>
      </div>

      {/* Section 4: Page Header */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-xs uppercase font-bold tracking-wider text-evenvibe-deep dark:text-emerald-400 bg-evenvibe-light dark:bg-emerald-950/60 px-2.5 py-1 rounded-md">
              Delivery
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Order #{order.order_number}
            </h1>

            {/* Status Badge */}
            {deliveryStatus === "delivered" ? (
              <Badge className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white font-medium border-0 px-3 py-1 text-xs">
                Delivered
              </Badge>
            ) : deliveryStatus === "dispatched" ? (
              <Badge className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white font-medium border-0 px-3 py-1 text-xs">
                Dispatched
              </Badge>
            ) : deliveryStatus === "in_progress" ? (
              <Badge className="bg-evenvibe-primary hover:bg-blue-700 text-white font-medium border-0 px-3 py-1 text-xs">
                Delivery In Progress
              </Badge>
            ) : deliveryStatus === "ready" ? (
              <Badge className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white font-medium border-0 px-3 py-1 text-xs">
                Ready for Delivery
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-slate-200 text-slate-700 font-medium px-3 py-1 text-xs">
                Pending QC
              </Badge>
            )}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            School:{" "}
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {order.schools?.name || "Unknown School"}
            </span>
          </p>
        </div>

        {/* Section 21: Delivery Primary Actions */}
        <div className="flex items-center gap-3">
          {deliveryStatus === "ready" && (
            <Button
              onClick={() => setShowStartModal(true)}
              className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white font-medium gap-2 shadow-sm"
            >
              <Play className="w-4 h-4 fill-white" />
              Start Delivery
            </Button>
          )}

          {deliveryStatus === "in_progress" && (
            <Button
              onClick={() => setShowDispatchModal(true)}
              className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white font-medium gap-2 shadow-sm"
            >
              <Send className="w-4 h-4" />
              Mark as Dispatched
            </Button>
          )}

          {deliveryStatus === "dispatched" && (
            selectedBatchRecord && ["dispatched", "in_transit"].includes(selectedBatchRecord.status) ? (
              <Button
                onClick={() => {
                  setBatchToComplete(selectedBatchRecord);
                  setCompleteBatchRemarks(selectedBatchRecord.remarks || "");
                  setShowCompleteBatchModal(true);
                }}
                className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white font-medium gap-2 shadow-sm"
              >
                <CheckCircle2 className="w-4 h-4" />
                Complete Batch #{selectedBatchRecord.batch_number} Delivery
              </Button>
            ) : (
              <Button
                onClick={() => setShowDeliveredModal(true)}
                className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white font-medium gap-2 shadow-sm"
              >
                <CheckCircle2 className="w-4 h-4" />
                Mark as Delivered
              </Button>
            )
          )}

          {deliveryStatus === "delivered" && (
            <div className="flex items-center gap-2 text-evenvibe-primary dark:text-emerald-400 bg-evenvibe-light dark:bg-emerald-950/40 px-3.5 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800 text-sm font-semibold">
              <CheckCircle2 className="w-4 h-4" />
              Delivery Completed
            </div>
          )}
        </div>
      </div>

      {/* Section 3: QC Incomplete Warning */}
      {!isQcCompleted && (
        <Card className="border-amber-300 bg-amber-50/70 dark:bg-amber-950/30 shadow-sm">
          <CardContent className="p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg text-amber-700 dark:text-amber-300">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                  Quality Check Incomplete
                </h4>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  Complete Quality Check before starting delivery.
                </p>
              </div>
            </div>

            <Link href={`/admin/quality-check/${order.id}`}>
              <Button size="sm" variant="outline" className="border-amber-400 text-amber-800 hover:bg-amber-100 bg-white dark:bg-slate-900">
                Go to Quality Check
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Section 10: Reconciliation Summary Cards (Consolidated Order Fulfillment) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5 md:gap-4">
        {/* Card 1: Original Order Pieces */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 transition-all hover:shadow-md">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-[11px] uppercase font-bold text-slate-500 tracking-wider">
                Original Order
              </CardDescription>
              <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-md">
                <Package className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              </div>
            </div>
            <CardTitle className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1">
              {consolidatedReconciliationData.summary.totalOriginal}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2 mt-1">
              Confirmed ordered pieces
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Actual Delivery Pieces */}
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 transition-all hover:shadow-md hover:border-emerald-300">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-[11px] uppercase font-bold text-evenvibe-deep dark:text-emerald-400 tracking-wider">
                Actual Delivered
              </CardDescription>
              <div className="p-1.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-md">
                <CheckCircle2 className="w-3.5 h-3.5 text-evenvibe-primary dark:text-emerald-400" />
              </div>
            </div>
            <CardTitle className="text-2xl font-black text-evenvibe-deep dark:text-emerald-400 mt-1">
              {consolidatedReconciliationData.summary.totalActual}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2 mt-1">
              Finalized pieces sent
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Extra Pieces */}
        <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/20 dark:bg-blue-950/20 shadow-sm transition-all hover:shadow-md hover:border-blue-300">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-[11px] uppercase font-bold text-blue-700 dark:text-blue-300 tracking-wider">
                Extra Pieces
              </CardDescription>
              <div className="p-1.5 bg-blue-100 dark:bg-blue-900/40 rounded-md">
                <span className="text-xs font-black text-blue-700 dark:text-blue-300">+</span>
              </div>
            </div>
            <CardTitle className="text-2xl font-black text-blue-700 dark:text-blue-300 mt-1">
              +{consolidatedReconciliationData.summary.totalExtra}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-[11px] font-medium text-blue-600 dark:text-blue-400 border-t border-blue-100 dark:border-blue-900/50 pt-2 mt-1">
              Surplus physical units
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Short Pieces */}
        <Card className="border-amber-200 dark:border-amber-900 bg-amber-50/20 dark:bg-amber-950/20 shadow-sm transition-all hover:shadow-md hover:border-amber-300">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-[11px] uppercase font-bold text-amber-700 dark:text-amber-300 tracking-wider">
                Pending / Short
              </CardDescription>
              <div className="p-1.5 bg-amber-100 dark:bg-amber-900/40 rounded-md">
                <AlertCircle className="w-3.5 h-3.5 text-amber-700 dark:text-amber-300" />
              </div>
            </div>
            <CardTitle className="text-2xl font-black text-amber-700 dark:text-amber-300 mt-1">
              {totalOrderRemaining > 0 ? `-${totalOrderRemaining}` : "0"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400 border-t border-amber-100 dark:border-amber-900/50 pt-2 mt-1">
              Pending pieces to deliver
            </p>
          </CardContent>
        </Card>

        {/* Card 5: Not Delivered Pieces */}
        <Card className="border-rose-200 dark:border-rose-900 bg-rose-50/20 dark:bg-rose-950/20 shadow-sm transition-all hover:shadow-md hover:border-rose-300 col-span-2 sm:col-span-1">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-[11px] uppercase font-bold text-rose-700 dark:text-rose-300 tracking-wider">
                Unfulfilled Groups
              </CardDescription>
              <div className="p-1.5 bg-rose-100 dark:bg-rose-900/40 rounded-md">
                <span className="text-xs font-black text-rose-700 dark:text-rose-300">0</span>
              </div>
            </div>
            <CardTitle className="text-2xl font-black text-rose-700 dark:text-rose-300 mt-1">
              {consolidatedReconciliationData.summary.totalNotDelivered > 0
                ? `-${consolidatedReconciliationData.summary.totalNotDelivered}`
                : "0"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400 border-t border-rose-100 dark:border-rose-900/50 pt-2 mt-1">
              Sizes with 0 delivered
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Delivery Progress Bar */}
      {consolidatedReconciliationData.summary.totalOriginal > 0 && (
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 p-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-slate-600 dark:text-slate-300">
                Overall Order Delivery Fulfillment: <strong>{consolidatedReconciliationData.summary.totalActual}</strong> / {consolidatedReconciliationData.summary.totalOriginal} ordered pieces
              </span>
              <span className="text-evenvibe-primary font-bold">
                {Math.round((consolidatedReconciliationData.summary.totalActual / consolidatedReconciliationData.summary.totalOriginal) * 100)}%
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-evenvibe-primary transition-all duration-300"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((consolidatedReconciliationData.summary.totalActual / consolidatedReconciliationData.summary.totalOriginal) * 100)
                  )}%`,
                }}
              />
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Tabbed Delivery Quantities, Extra/Short, Returns, and Follow-up Dispatches */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-2 border-slate-200 dark:border-slate-800">
              <TabsList className="grid grid-cols-2 sm:grid-cols-4 bg-slate-100 dark:bg-slate-800 p-1 h-auto gap-1">
                <TabsTrigger
                  value="matrix"
                  className="text-xs py-2 font-semibold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900"
                >
                  Delivery Quantities
                </TabsTrigger>
                <TabsTrigger
                  value="extra-short"
                  className="text-xs py-2 font-semibold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900"
                >
                  Extra & Short ({consolidatedReconciliationData.rows.filter((r) => r.difference !== 0).length})
                </TabsTrigger>
                <TabsTrigger
                  value="returns"
                  className="text-xs py-2 font-semibold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900"
                >
                  Returns to School ({deliveryReturns.length})
                </TabsTrigger>
                <TabsTrigger
                  value="followup"
                  className="text-xs py-2 font-semibold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900"
                >
                  Follow-up Dispatches ({followupDispatches.length})
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="matrix" className="space-y-4 m-0">
              {/* Multi-Batch Consignment Navigation & Controls */}
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Truck className="w-4 h-4 text-evenvibe-primary" />
                      Delivery Consignment Batches
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Support for multiple deliveries per order. Fulfilled sizes, colors, and styles are automatically hidden from subsequent delivery entry.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      Total Ordered: <strong className="ml-1 text-slate-900 dark:text-slate-100">{totalOriginalOrderPieces}</strong>
                    </Badge>
                    <Badge variant="outline" className="text-xs text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300">
                      Delivered: <strong className="ml-1">{totalFinalizedDeliveredPieces}</strong>
                    </Badge>
                    {totalOrderRemaining > 0 ? (
                      <Badge variant="outline" className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/40 border-amber-300">
                        Pending: <strong className="ml-1">{totalOrderRemaining}</strong>
                      </Badge>
                    ) : (
                      <Badge className="text-xs bg-emerald-600 text-white">
                        All Items Fulfilled
                      </Badge>
                    )}
                    {totalExtraPieces > 0 && (
                      <Badge variant="outline" className="text-xs text-blue-700 bg-blue-50 dark:bg-blue-950/40 border-blue-300">
                        Extra: <strong className="ml-1">+{totalExtraPieces}</strong>
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Batch Selector Pills */}
                <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-100 dark:border-slate-800">
                  {existingBatchList.map((batch) => {
                    const isDraft = batch.status === "draft";
                    const isSelected =
                      selectedBatchView === batch.batch_number ||
                      (selectedBatchView === "active" && isDraft && batch.batch_number === targetBatchNumber);
                    const isBatchFinalized = ["dispatched", "in_transit", "delivered"].includes(batch.status);
                    return (
                      <button
                        key={batch.batch_number}
                        type="button"
                        onClick={() => setSelectedBatchView(batch.batch_number)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                          isSelected
                            ? isDraft
                              ? "bg-evenvibe-primary text-white shadow-sm ring-2 ring-emerald-400"
                              : "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                            : "bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        <Package className="w-3.5 h-3.5" />
                        <span>Batch #{batch.batch_number}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded font-bold uppercase ${
                            batch.status === "delivered"
                              ? "bg-emerald-100 text-emerald-800"
                              : isBatchFinalized
                              ? "bg-blue-100 text-blue-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {batch.status}
                        </span>
                      </button>
                    );
                  })}

                  {/* Active / Next Delivery Entry Pill (only if there are pending items and no draft batch already listed) */}
                  {totalOrderRemaining > 0 && !activeDraftBatch && (
                    <button
                      type="button"
                      onClick={() => setSelectedBatchView("active")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                        selectedBatchView === "active"
                          ? "bg-evenvibe-primary text-white shadow-sm ring-2 ring-emerald-400"
                          : "bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300"
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Batch #{activeBatchNumber} (Next Delivery Entry)</span>
                      <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.2 rounded font-bold">
                        {totalOrderRemaining} pcs pending
                      </span>
                    </button>
                  )}

                  {/* Consolidated View Pill */}
                  <button
                    type="button"
                    onClick={() => setSelectedBatchView("consolidated")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      selectedBatchView === "consolidated"
                        ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                        : "bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Consolidated / All Deliveries</span>
                  </button>

                  {/* Button to explicitly create next batch if existing batch is finalized and pending items exist */}
                  {existingBatchList.length > 0 &&
                    totalOrderRemaining > 0 &&
                    !activeDraftBatch && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleCreateNextBatch}
                        disabled={isCreatingBatch}
                        className="ml-auto text-xs bg-white dark:bg-slate-900 border-dashed border-emerald-400 text-emerald-700 hover:bg-emerald-50 gap-1.5 font-semibold"
                      >
                        {isCreatingBatch ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                        <span>New Consignment Batch</span>
                      </Button>
                    )}
                </div>

                {/* Status Notice Banner for currently selected view */}
                <div className="pt-2 text-xs">
                  {!isCurrentMatrixReadOnly ? (
                    <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                          Active Entry: Consignment Batch #{targetBatchNumber} (
                          {existingBatchList.find((b) => b.batch_number === targetBatchNumber)?.batch_reference ||
                            `BATCH-${String(targetBatchNumber).padStart(3, "0")}`}
                          )
                        </p>
                        <p className="text-emerald-700 dark:text-emerald-300 text-[11px] mt-0.5">
                          Showing only remaining pending quantities. Fully delivered combinations from earlier batches have been excluded from this entry screen.
                        </p>
                      </div>
                      <Badge className="bg-emerald-600 text-white font-bold shrink-0">
                        Editable Entry
                      </Badge>
                    </div>
                  ) : typeof selectedBatchView === "number" ? (
                    <div className="p-3 bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">
                            Viewing Consignment Batch #{selectedBatchView} (
                            {selectedBatchRecord?.batch_reference ||
                              `BATCH-${String(selectedBatchView).padStart(3, "0")}`}
                            )
                          </p>
                          <Badge
                            className={`text-[10px] uppercase font-bold ${
                              selectedBatchRecord?.status === "delivered"
                                ? "bg-emerald-600 text-white"
                                : selectedBatchRecord?.status === "dispatched" || selectedBatchRecord?.status === "in_transit"
                                ? "bg-blue-600 text-white"
                                : "bg-amber-600 text-white"
                            }`}
                          >
                            {selectedBatchRecord?.status || "finalized"}
                          </Badge>
                        </div>
                        <p className="text-slate-500 text-[11px] mt-0.5">
                          {selectedBatchRecord?.status === "delivered"
                            ? `Delivered on ${selectedBatchRecord.delivered_at ? new Date(selectedBatchRecord.delivered_at).toLocaleDateString() : "record"}. Quantities are locked to preserve audit trail.`
                            : ["dispatched", "in_transit"].includes(selectedBatchRecord?.status || "")
                            ? `Dispatched on ${selectedBatchRecord?.dispatched_at ? new Date(selectedBatchRecord.dispatched_at).toLocaleDateString() : "record"}. Ready to mark as delivered upon school receipt.`
                            : "Historical consignment record. Quantities are locked to preserve delivery audit trail."}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {["dispatched", "in_transit"].includes(selectedBatchRecord?.status || "") && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              setBatchToComplete(selectedBatchRecord);
                              setCompleteBatchRemarks(selectedBatchRecord?.remarks || "");
                              setShowCompleteBatchModal(true);
                            }}
                            className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white font-semibold text-xs gap-1.5 shadow-sm"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Complete Batch #{selectedBatchView} Delivery
                          </Button>
                        )}
                        <Badge variant="outline" className="text-slate-600 font-bold">
                          Read-Only History
                        </Badge>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-blue-900 dark:text-blue-200">
                          Consolidated Order Overview
                        </p>
                        <p className="text-blue-700 dark:text-blue-300 text-[11px] mt-0.5">
                          Cumulative view showing all original confirmed requirements alongside total quantities finalized across all delivery batches.
                        </p>
                      </div>
                      <Badge variant="outline" className="text-blue-700 border-blue-300 font-bold shrink-0">
                        Cumulative Summary
                      </Badge>
                    </div>
                  )}
                </div>
              </div>

              {/* Completion Banner if all items are completed and viewing active */}
              {selectedBatchView === "active" && totalOrderRemaining === 0 ? (
                <Card className="border-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/30 shadow-sm">
                  <CardContent className="p-6 text-center space-y-3">
                    <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                    <h3 className="text-base font-bold text-emerald-900 dark:text-emerald-200">
                      All Ordered Quantities Completely Fulfilled!
                    </h3>
                    <p className="text-xs text-emerald-700 dark:text-emerald-300 max-w-lg mx-auto">
                      All original confirmed uniform items ({totalOriginalOrderPieces} pcs) have been fully delivered across finalized delivery batches. No pending quantities remain to deliver.
                    </p>
                    <div className="pt-2 flex justify-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedBatchView("consolidated")}
                        className="bg-white text-xs border-emerald-300 text-emerald-800 font-semibold"
                      >
                        View Consolidated Breakdown
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleTriggerPrint({ type: "delivery_sheet" })}
                        className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white text-xs gap-1.5 font-semibold"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Print Consolidated Delivery Sheet
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <AdminDeliveryQuantityMatrix
                  matrixItems={currentMatrixItems}
                  actualQuantities={currentActualQuantities}
                  onQuantityChange={handleQuantityChange}
                  onSave={handleSaveActualQuantities}
                  onSaveDraft={handleSaveActualQuantities}
                  onFinalizeDelivery={handleFinalizeDeliveryBatch}
                  isSaving={isSavingQuantities}
                  isFinalizing={isFinalizingBatch}
                  hasUnsavedChanges={hasUnsavedChanges}
                  isOrderDelivered={isCurrentMatrixReadOnly}
                  isReadOnly={isCurrentMatrixReadOnly}
                  batchLabel={
                    !isCurrentMatrixReadOnly
                      ? `Consignment Batch #${targetBatchNumber} (Delivery Entry)`
                      : typeof selectedBatchView === "number"
                      ? `Consignment Batch #${selectedBatchView}`
                      : "Consolidated / All Deliveries"
                  }
                  onPrintStyle={handlePrintStyle}
                  onViewHistory={() => setSelectedBatchView("consolidated")}
                  validationErrors={validationErrors}
                  onFillMissingZeroes={handleFillMissingZeroes}
                />
              )}
            </TabsContent>

            <TabsContent value="extra-short" className="space-y-4 m-0">
              <AdminDeliveryExtraShortView
                items={consolidatedReconciliationData.rows}
                summary={consolidatedReconciliationData.summary}
                onPrintReport={() => handleTriggerPrint({ type: "extra_short_report" })}
                onOpenFollowupModal={() => setActiveTab("followup")}
              />
            </TabsContent>

            <TabsContent value="returns" className="space-y-4 m-0">
              <AdminDeliveryReturnsView
                orderId={order.id}
                orderNumber={order.order_number}
                schoolId={order.schools?.id || ""}
                schoolName={order.schools?.name || "School"}
                returns={deliveryReturns}
                availableItems={allOriginalItems}
                onPrintReturnNote={(rec) => handleTriggerPrint({ type: "return_note", record: rec })}
              />
            </TabsContent>

            <TabsContent value="followup" className="space-y-4 m-0">
              <AdminDeliveryFollowupDispatchesView
                orderId={order.id}
                orderNumber={order.order_number}
                schoolId={order.schools?.id || ""}
                schoolName={order.schools?.name || "School"}
                followupDispatches={followupDispatches}
                pendingShortItems={consolidatedReconciliationData.rows.filter((r) => r.difference < 0)}
                onPrintDispatchSheet={(disp) => handleTriggerPrint({ type: "followup_dispatch", dispatch: disp })}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Column: Order Information & Delivery Details */}
        <div className="space-y-6">
          {/* Section 19: Order Information */}
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
            <CardHeader className="p-5 pb-3 border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-500" />
                Order Information
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-3 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-50 dark:border-slate-800/60">
                <span className="text-slate-500">Order Number</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {order.order_number}
                </span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-50 dark:border-slate-800/60">
                <span className="text-slate-500">School</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {order.schools?.name || "Unknown School"}
                </span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-50 dark:border-slate-800/60">
                <span className="text-slate-500">Order Date</span>
                <span className="text-slate-700 dark:text-slate-300">
                  {formatDate(order.created_at)}
                </span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-50 dark:border-slate-800/60">
                <span className="text-slate-500">QC Completed Date</span>
                <span className="text-slate-700 dark:text-slate-300">
                  {formatDate(qcRecord?.completed_at)}
                </span>
              </div>
              {order.shipped_at && (
                <div className="flex items-center justify-between pb-2 border-b border-slate-50 dark:border-slate-800/60">
                  <span className="text-slate-500">Dispatched Date</span>
                  <span className="text-slate-700 dark:text-slate-300">
                    {formatDate(order.shipped_at, true)}
                  </span>
                </div>
              )}
              {order.delivered_at && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Delivered Date</span>
                  <span className="font-semibold text-evenvibe-primary dark:text-emerald-400">
                    {formatDate(order.delivered_at, true)}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 20: Delivery Details Card */}
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
            <CardHeader className="p-5 pb-3 border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Truck className="w-4 h-4 text-evenvibe-primary" />
                Delivery Details
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Courier partner, tracking reference, and schedule.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="courierName" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Delivery Partner
                </Label>
                <Input
                  id="courierName"
                  placeholder="e.g. Blue Dart, DTDC, Hand Delivery"
                  value={courierName}
                  disabled={isDelivered}
                  onChange={(e) => setCourierName(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="trackingNumber" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Tracking Number
                </Label>
                <Input
                  id="trackingNumber"
                  placeholder="e.g. TRK123456789"
                  value={trackingNumber}
                  disabled={isDelivered}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  className="h-9 text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="estimatedDelivery" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Estimated Delivery Date
                  </Label>
                  <span className="text-[10px] text-slate-400">Today or future</span>
                </div>
                <Input
                  id="estimatedDelivery"
                  type="date"
                  min={todayDateStr}
                  value={estimatedDelivery}
                  disabled={isDelivered}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className={`h-9 text-xs ${dateError ? "border-status-error focus-visible:ring-red-400" : ""}`}
                />
                {dateError && (
                  <p className="text-[11px] text-status-error font-medium flex items-center gap-1 mt-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {dateError}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="deliveryRemarks" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Delivery Remarks
                </Label>
                <Textarea
                  id="deliveryRemarks"
                  placeholder="Optional delivery instructions or notes"
                  rows={2}
                  value={deliveryRemarks}
                  disabled={isDelivered}
                  onChange={(e) => setDeliveryRemarks(e.target.value)}
                  className="text-xs"
                />
              </div>

              {!isDelivered && (
                <Button
                  onClick={handleSaveDetails}
                  disabled={isSavingDetails}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs h-9 font-medium gap-1.5 shadow-sm"
                >
                  {isSavingDetails ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  Save Delivery Details
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* SECTION: DELIVERY PROOF (Image Upload & Gallery) */}
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 overflow-hidden">
        <CardHeader className="p-5 pb-3 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Camera className="w-4 h-4 text-evenvibe-primary" />
              Delivery Proof
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Upload photos as proof of packing, dispatch or delivery.
            </CardDescription>
          </div>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/jpg"
              className="hidden"
              onChange={handleProofFileSelect}
              disabled={!isQcCompleted || isUploadingProof}
            />
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!isQcCompleted || isUploadingProof}
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs font-medium border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              <Plus className="w-3.5 h-3.5 text-evenvibe-primary" />
              Upload Images
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-5 space-y-5">
          {/* Pre-upload File Selection Previews */}
          {proofPreviews.length > 0 && (
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Selected Images ({proofPreviews.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProofFiles([]);
                    setProofPreviews([]);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="text-xs text-slate-500 hover:text-slate-700 underline"
                >
                  Clear all
                </button>
              </div>

              {/* Thumbnails of selected images */}
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {proofPreviews.map((preview, idx) => (
                  <div
                    key={`preview-${idx}`}
                    className="relative group aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={preview.url}
                      alt={preview.file.name}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveProofPreview(idx)}
                      className="absolute top-1 right-1 p-1 rounded-full bg-black/60 hover:bg-black/80 text-white transition-colors"
                      title="Remove"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[10px] px-1.5 py-0.5 truncate">
                      {preview.file.name}
                    </div>
                  </div>
                ))}
              </div>

              {/* Optional Caption Field */}
              <div className="space-y-1.5">
                <Label htmlFor="proofCaption" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Caption (optional)
                </Label>
                <Input
                  id="proofCaption"
                  placeholder="e.g. Final packed parcel photo, courier handover, delivery receipt"
                  value={proofCaption}
                  onChange={(e) => setProofCaption(e.target.value)}
                  className="h-8 text-xs bg-white dark:bg-slate-900"
                />
              </div>

              {/* Upload Button */}
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedProofFiles([]);
                    setProofPreviews([]);
                    setProofCaption("");
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  disabled={isUploadingProof}
                  className="text-xs h-8"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleUploadProof}
                  disabled={isUploadingProof}
                  className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white text-xs h-8 gap-1.5"
                >
                  {isUploadingProof ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <UploadCloud className="w-3.5 h-3.5" />
                  )}
                  {isUploadingProof
                    ? "Uploading..."
                    : `Upload ${proofPreviews.length} ${proofPreviews.length === 1 ? "Image" : "Images"}`}
                </Button>
              </div>
            </div>
          )}

          {/* Uploaded Images Gallery */}
          {proofImages.length === 0 ? (
            <div className="text-center py-8 px-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <Camera className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-60" />
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                No delivery proof uploaded yet.
              </p>
              <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                {isQcCompleted
                  ? "Upload photos as proof of packing, dispatch handover, or delivery confirmation."
                  : "Complete Quality Check before starting delivery and uploading proof."}
              </p>
              {isQcCompleted && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-3 text-xs h-8 gap-1 text-evenvibe-deep border-emerald-200 hover:bg-emerald-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Upload Images
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
              {proofImages.map((img, idx) => (
                <div
                  key={img.id}
                  className="group relative flex flex-col rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 overflow-hidden shadow-xs hover:shadow-sm transition-all"
                >
                  {/* Thumbnail */}
                  <div
                    onClick={() => setLightboxIndex(idx)}
                    className="aspect-square w-full bg-slate-100 dark:bg-slate-900 overflow-hidden cursor-pointer relative"
                  >
                    {img.signed_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={img.signed_url}
                        alt={img.caption || img.file_name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                        Unavailable
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <Eye className="w-5 h-5 text-white drop-shadow-md" />
                    </div>
                  </div>

                  {/* Details & Actions */}
                  <div className="p-2.5 flex-1 flex flex-col justify-between text-xs space-y-1.5">
                    <div>
                      {img.caption ? (
                        <p
                          className="font-semibold text-slate-800 dark:text-slate-200 text-xs line-clamp-1"
                          title={img.caption}
                        >
                          {img.caption}
                        </p>
                      ) : (
                        <p
                          className="font-mono text-[11px] text-slate-500 truncate"
                          title={img.file_name}
                        >
                          {img.file_name}
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Uploaded by {img.profiles?.full_name || "Admin"} • {formatDate(img.created_at)}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-700/60">
                      <button
                        type="button"
                        onClick={() => setLightboxIndex(idx)}
                        className="text-[11px] text-evenvibe-primary dark:text-emerald-400 hover:underline font-medium"
                      >
                        View
                      </button>

                      <button
                        type="button"
                        onClick={() => setImageToDelete(img)}
                        className="p-1 text-slate-400 hover:text-status-error rounded transition-colors"
                        title="Delete Image"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 15 & 16: Audit Trail History */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => setShowHistory((prev) => !prev)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
        >
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Delivery History
            </span>
            <span className="text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
              {packingHistory.length + orderStatusHistory.length}
            </span>
          </div>

          <div className="text-slate-400">
            {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {showHistory && (
          <div className="p-4 pt-0 border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-50 dark:divide-slate-800/50">
            {packingHistory.length === 0 && orderStatusHistory.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">No delivery history recorded yet.</p>
            ) : (
              <div className="space-y-3 pt-3">
                {orderStatusHistory.map((item) => (
                  <div
                    key={`osh-${item.id}`}
                    className="flex flex-col sm:flex-row sm:items-center justify-between text-xs py-1.5 gap-1"
                  >
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                        Order Status: {item.status}
                      </span>
                      {item.note && (
                        <p className="text-slate-500 dark:text-slate-400 mt-0.5">{item.note}</p>
                      )}
                    </div>
                    <div className="text-slate-400 shrink-0 text-[11px]">
                      {formatDate(item.created_at, true)}
                    </div>
                  </div>
                ))}

                {packingHistory.map((item) => (
                  <div
                    key={`ph-${item.id}`}
                    className="flex flex-col sm:flex-row sm:items-center justify-between text-xs py-1.5 gap-1"
                  >
                    <div>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {item.to_status === "delivered"
                          ? "Consignment Delivered"
                          : item.to_status === "dispatched"
                          ? "Shipment Dispatched"
                          : item.to_status === "in_progress"
                          ? "Delivery Preparation Started"
                          : `Status: ${item.to_status}`}
                      </span>
                      {item.note && (
                        <p className="text-slate-500 dark:text-slate-400 mt-0.5">{item.note}</p>
                      )}
                    </div>
                    <div className="text-slate-400 shrink-0 text-[11px]">
                      {formatDate(item.created_at, true)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL 1: Start Delivery Confirmation (Section 12) */}
      <Dialog open={showStartModal} onOpenChange={setShowStartModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-evenvibe-primary" />
              Start Delivery
            </DialogTitle>
            <DialogDescription>
              Start delivery preparation for Order #{order.order_number}?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3 bg-evenvibe-light dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-600">Approved Units:</span>
                <span className="font-bold text-evenvibe-deep">{totalApprovedQuantity}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Distinct Sizes:</span>
                <span className="font-bold text-slate-800">{deliveryItems.length}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="startRemarks" className="text-xs">
                Delivery Remarks (optional)
              </Label>
              <Textarea
                id="startRemarks"
                placeholder="e.g. Packing into cartons for morning dispatch"
                value={startRemarks}
                onChange={(e) => setStartRemarks(e.target.value)}
                rows={2}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowStartModal(false)}
              disabled={isStarting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleStartDelivery}
              disabled={isStarting}
              className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white"
            >
              {isStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Start Delivery"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: Mark as Dispatched Confirmation (Section 15) */}
      <Dialog open={showDispatchModal} onOpenChange={setShowDispatchModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-evenvibe-primary" />
              Mark as Dispatched
            </DialogTitle>
            <DialogDescription>
              Dispatch shipment for Order #{order.order_number}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label htmlFor="modalCourier" className="text-xs">
                Delivery Partner
              </Label>
              <Input
                id="modalCourier"
                placeholder="e.g. Blue Dart"
                value={courierName}
                onChange={(e) => setCourierName(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="modalTracking" className="text-xs">
                Tracking Number
              </Label>
              <Input
                id="modalTracking"
                placeholder="e.g. TRK987654"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="modalDate" className="text-xs">
                  Estimated Delivery Date
                </Label>
                <span className="text-[10px] text-slate-400">Today or future</span>
              </div>
              <Input
                id="modalDate"
                type="date"
                min={todayDateStr}
                value={estimatedDelivery}
                onChange={(e) => handleDateChange(e.target.value)}
                className={`h-8 text-xs ${dateError ? "border-status-error focus-visible:ring-red-400" : ""}`}
              />
              {dateError && (
                <p className="text-[11px] text-status-error font-medium flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {dateError}
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowDispatchModal(false)}
              disabled={isDispatching}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDispatchOrder}
              disabled={isDispatching}
              className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white"
            >
              {isDispatching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Dispatch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: Mark as Delivered Confirmation (Section 16) */}
      <Dialog open={showDeliveredModal} onOpenChange={setShowDeliveredModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-evenvibe-primary" />
              Mark as Delivered
            </DialogTitle>
            <DialogDescription>
              Confirm that Order #{order.order_number} has been received by {order.schools?.name || "the school"}.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 text-xs space-y-2">
            <div className="p-3 bg-evenvibe-light dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg">
              <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                Total Delivered: {totalApprovedQuantity} units
              </p>
              <p className="text-slate-500 mt-1">
                This will finalize the order delivery cycle and update order status to <strong>Delivered</strong>.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowDeliveredModal(false)}
              disabled={isMarkingDelivered}
            >
              Cancel
            </Button>
            <Button
              onClick={handleMarkDelivered}
              disabled={isMarkingDelivered}
              className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white"
            >
              {isMarkingDelivered ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Delivered"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 3B: Complete Specific Batch Delivery Confirmation */}
      <Dialog open={showCompleteBatchModal} onOpenChange={setShowCompleteBatchModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-evenvibe-primary" />
              Complete Batch Delivery
            </DialogTitle>
            <DialogDescription>
              Mark Consignment Batch #{batchToComplete?.batch_number} (
              {batchToComplete?.batch_reference ||
                `BATCH-${String(batchToComplete?.batch_number || "").padStart(3, "0")}`}
              ) as Delivered.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 text-xs space-y-3">
            <div className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-1">
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                School: {order.schools?.name || "School"}
              </p>
              {batchToComplete?.courier_name && (
                <p className="text-slate-500">
                  Courier: {batchToComplete.courier_name}{" "}
                  {batchToComplete.tracking_number ? `(${batchToComplete.tracking_number})` : ""}
                </p>
              )}
              <p className="text-slate-500 text-[11px] mt-1">
                Delivered timestamp will be recorded. If any order items remain pending after this batch, the parent order will remain dispatched until subsequent batches complete.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="batch-delivery-remarks" className="text-xs font-medium">
                Delivery Remarks / Receipt Notes (Optional)
              </Label>
              <Textarea
                id="batch-delivery-remarks"
                value={completeBatchRemarks}
                onChange={(e) => setCompleteBatchRemarks(e.target.value)}
                placeholder="e.g. Received and verified by school administration, signed physical acknowledgment."
                rows={2}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCompleteBatchModal(false)}
              disabled={isCompletingBatch}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCompleteBatch}
              disabled={isCompletingBatch}
              className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white"
            >
              {isCompletingBatch ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Batch Delivered"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 4: Delete Delivery Proof Image Confirmation */}
      <Dialog open={Boolean(imageToDelete)} onOpenChange={(open) => !open && setImageToDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-status-error">
              <Trash2 className="h-5 w-5" />
              Delete Delivery Proof Image
            </DialogTitle>
            <DialogDescription>
              Delete this delivery proof image? This action cannot be undone and will permanently remove the image from storage.
            </DialogDescription>
          </DialogHeader>

          {imageToDelete && (
            <div className="py-2 text-xs flex items-center gap-3 bg-slate-50 dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
              {imageToDelete.signed_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageToDelete.signed_url}
                  alt={imageToDelete.file_name}
                  className="w-12 h-12 rounded object-cover"
                />
              )}
              <div className="truncate">
                <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                  {imageToDelete.caption || imageToDelete.file_name}
                </p>
                <p className="text-[11px] text-slate-400">
                  Uploaded {formatDate(imageToDelete.created_at, true)}
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setImageToDelete(null)}
              disabled={isDeletingImage}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteProof}
              disabled={isDeletingImage}
            >
              {isDeletingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete Image"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox / Full-size Image Viewer */}
      {lightboxIndex !== null && (
        <DeliveryProofLightbox
          isOpen={lightboxIndex !== null}
          onClose={() => setLightboxIndex(null)}
          images={proofImages}
          currentIndex={lightboxIndex}
          onIndexChange={(newIdx) => setLightboxIndex(newIdx)}
        />
      )}

      {/* Isolated Print Containers for Browser Print / Save as PDF */}
      <AdminDeliveryPrintDocuments
        document={activePrintDoc}
        orderNumber={order.order_number}
        schoolName={order.schools?.name || "School"}
        courierName={courierName}
        trackingNumber={trackingNumber}
        estimatedDelivery={estimatedDelivery}
        actualItems={reconciliationData.rows}
        summary={reconciliationData.summary}
        hasUnsavedChanges={hasUnsavedChanges}
      />
    </div>
  );
}
