"use client";

import { useState, useEffect, startTransition } from "react";
import { useRouter } from "next/navigation";
import { useRealtimeSubscription } from "@/lib/supabase/useRealtime";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import AdminOrderQuantityBreakdown from "../../orders/views/AdminOrderQuantityBreakdown";
import {
  startProduction,
  updateProductionStage,
  updateProductionQuantity,
  updateProductionRemarks,
} from "../actions";
import { toast } from "sonner";
import {
  ArrowLeft,
  Factory,
  CheckCircle2,
  AlertCircle,
  Play,
  ArrowRight,
  Edit3,
  History,
  Layers,
  CheckCheck,
  Building2,
  Calendar,
  ClipboardCheck,
  Truck,
  Lock,
  Shuffle,
} from "lucide-react";
import Link from "next/link";

interface OrderInfo {
  id: string;
  order_number: string;
  status: string;
  created_at: string;
  updated_at: string;
  schools?: { id: string; name: string } | null;
  requirements?: {
    id: string;
    requirement_number: string;
    total_students: number | null;
    regular_uniform_students: number | null;
    tshirt_uniform_students: number | null;
  } | null;
}

interface OrderStatusEvent {
  id: string;
  status: string;
  created_at: string;
  note?: string | null;
}

interface ReqItem {
  id: string;
  requirement_id: string;
  class_name: string | null;
  section_name: string | null;
  gender: string | null;
  item_name: string;
  style_id?: string | null;
  style_name?: string | null;
  color?: string | null;
  size: string;
  quantity: number;
}

interface ProductionRecord {
  id: string;
  stage: string;
  total_quantity: number;
  completed_quantity: number;
  started_at: string;
  completed_at: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

interface StageHistoryItem {
  id: string;
  from_stage: string | null;
  to_stage: string;
  note: string | null;
  created_at: string;
  changed_by: string;
  profiles?: {
    id: string;
    full_name: string | null;
    role: string;
  } | null;
}

import {
  OrderWorkflowStage,
  ProductionStageKey,
  STAGE_CONFIG_MAP,
  formatWorkflowStageLabel,
  getWorkflowStageBadgeColor,
  resolveOrderCurrentStage,
  getNextProductionStage,
} from "@/lib/productionWorkflow";
import OrderWorkflowConfigurator from "@/components/production/OrderWorkflowConfigurator";
import StockSizesBreakdown from "@/components/production/StockSizesBreakdown";
import InventoryMaterialStage from "@/components/production/InventoryMaterialStage";
import InventoryPrintView from "@/components/production/InventoryPrintView";
import CuttingStage from "@/components/production/CuttingStage";
import ProductionSequenceModal from "@/components/production/ProductionSequenceModal";
import CuttingPrintView from "@/components/production/CuttingPrintView";
import DynamicProductionStage from "@/components/production/DynamicProductionStage";
import DynamicStagePrintView from "@/components/production/DynamicStagePrintView";
import CheckingProductionStage from "@/components/production/CheckingProductionStage";
import CheckingPrintView from "@/components/production/CheckingPrintView";
import IroningPackingProductionStage from "@/components/production/IroningPackingProductionStage";
import IroningPackingPrintView from "@/components/production/IroningPackingPrintView";
import { StoredCheckingItem, calculateCheckingStage } from "@/lib/production/checkingEngine";
import {
  StoredIroningPackingItem,
  calculateIroningStep,
  calculatePackingStep,
  isIroningStepCompleted,
} from "@/lib/production/ironingPackingEngine";
import {
  StoredInventoryMaterial,
  calculateInventoryRequirements,
  InventoryCalculationResult,
} from "@/lib/production/inventoryCalculations";
import {
  StoredCuttingItem,
  calculateCuttingRequirements,
  CuttingCalculationResult,
  OrderStudentDetail,
} from "@/lib/production/cuttingCalculations";
import {
  StoredStageItem,
  calculateDynamicStage,
} from "@/lib/production/dynamicStageEngine";

const formatDate = (dateString: string | null, includeTime = false) => {
  if (!dateString) return "—";
  const d = new Date(dateString);
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  if (includeTime) {
    options.hour = "2-digit";
    options.minute = "2-digit";
  }
  return d.toLocaleDateString("en-US", options);
};

const formatStageLabel = (stage: string) => formatWorkflowStageLabel(stage);
const getStageBadgeColor = (stage: string) => getWorkflowStageBadgeColor(stage);

export interface DynamicItemSummary {
  itemName: string;
  totalQuantity: number;
  studentCount: number | null;
}

const formatItemName = (name: string) => {
  if (!name) return "";
  return name.replace(/\b\w/g, (c) => c.toUpperCase());
};

export default function AdminProductionDetailsView({
  order: initialOrder,
  requirementItems,
  productionRecord: initialProductionRecord,
  stageHistory,
  orderStatusHistory,
  totalStudents,
  classStudentCounts = {},
  dynamicItems,
  orderWorkflows: initialOrderWorkflows = [],
  inventoryMaterials: initialInventoryMaterials = [],
  cuttingItems: initialCuttingItems = [],
  savedStageItems = [],
  savedCheckingItems = [],
  savedIroningPackingItems = [],
  orderStudents = [],
  isWorkflowLocked = false,
}: {
  order: OrderInfo;
  requirementItems: ReqItem[];
  productionRecord: ProductionRecord | null;
  stageHistory: StageHistoryItem[];
  orderStatusHistory: OrderStatusEvent[];
  totalStudents: number;
  classStudentCounts?: Record<string, number>;
  dynamicItems: DynamicItemSummary[];
  orderWorkflows?: OrderWorkflowStage[];
  inventoryMaterials?: StoredInventoryMaterial[];
  cuttingItems?: StoredCuttingItem[];
  savedStageItems?: StoredStageItem[];
  savedCheckingItems?: StoredCheckingItem[];
  savedIroningPackingItems?: StoredIroningPackingItem[];
  orderStudents?: OrderStudentDetail[];
  isWorkflowLocked?: boolean;
}) {
  const router = useRouter();

  const [currentInventoryMaterials, setCurrentInventoryMaterials] = useState<StoredInventoryMaterial[]>(
    initialInventoryMaterials
  );
  const [liveCalculationResult, setLiveCalculationResult] = useState<InventoryCalculationResult | null>(null);

  const printCalculationResult =
    liveCalculationResult || calculateInventoryRequirements(requirementItems, currentInventoryMaterials);

  const [currentCuttingItems, setCurrentCuttingItems] = useState<StoredCuttingItem[]>(
    initialCuttingItems
  );
  const [liveCuttingResult, setLiveCuttingResult] = useState<CuttingCalculationResult | null>(null);

  const printCuttingResult =
    liveCuttingResult ||
    calculateCuttingRequirements(
      requirementItems,
      currentCuttingItems,
      undefined,
      orderStudents,
      totalStudents
    );

  // Dedicated Print Mode Isolation State
  const [activePrintDocument, setActivePrintDocument] = useState<"inventory" | "cutting" | "dynamic_stage" | "checking" | "ironing_packing" | null>(null);
  const [printDynamicStageKey, setPrintDynamicStageKey] = useState<string | null>(null);

  const [currentStageItems, setCurrentStageItems] = useState<StoredStageItem[]>(
    savedStageItems || []
  );
  const [prevInitialStageItems, setPrevInitialStageItems] = useState(savedStageItems);
  if (savedStageItems !== prevInitialStageItems) {
    setPrevInitialStageItems(savedStageItems);
    setCurrentStageItems(savedStageItems || []);
  }

  const [currentCheckingItems, setCurrentCheckingItems] = useState<StoredCheckingItem[]>(
    savedCheckingItems || []
  );
  const [prevInitialCheckingItems, setPrevInitialCheckingItems] = useState(savedCheckingItems);
  if (savedCheckingItems !== prevInitialCheckingItems) {
    setPrevInitialCheckingItems(savedCheckingItems);
    setCurrentCheckingItems(savedCheckingItems || []);
  }

  const [currentIroningPackingItems, setCurrentIroningPackingItems] = useState<StoredIroningPackingItem[]>(
    savedIroningPackingItems || []
  );
  const [prevInitialIroningPackingItems, setPrevInitialIroningPackingItems] = useState(savedIroningPackingItems);
  if (savedIroningPackingItems !== prevInitialIroningPackingItems) {
    setPrevInitialIroningPackingItems(savedIroningPackingItems);
    setCurrentIroningPackingItems(savedIroningPackingItems || []);
  }

  const [printIroningPackingMode, setPrintIroningPackingMode] = useState<"ironing" | "packing" | "combined">("combined");

  useEffect(() => {
    const handleAfterPrint = () => {
      setActivePrintDocument(null);
      setPrintDynamicStageKey(null);
    };
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, []);

  const handlePrintCutting = () => {
    setActivePrintDocument("cutting");
    setTimeout(() => {
      window.print();
    }, 50);
  };

  const handlePrintDynamicStage = (stgKey: string) => {
    setPrintDynamicStageKey(stgKey);
    setActivePrintDocument("dynamic_stage");
    setTimeout(() => {
      window.print();
    }, 50);
  };

  const handlePrintChecking = () => {
    setActivePrintDocument("checking");
    setTimeout(() => {
      window.print();
    }, 50);
  };

  const handlePrintIroningPacking = (mode: "ironing" | "packing" | "combined" = "combined") => {
    setPrintIroningPackingMode(mode);
    setActivePrintDocument("ironing_packing");
    setTimeout(() => {
      window.print();
    }, 50);
  };


  const [order, setOrder] = useState<OrderInfo>(initialOrder);
  const [prevInitialOrder, setPrevInitialOrder] = useState(initialOrder);
  if (initialOrder !== prevInitialOrder) {
    setPrevInitialOrder(initialOrder);
    setOrder(initialOrder);
    setCurrentCuttingItems(initialCuttingItems);
    setLiveCuttingResult(null);
    setCurrentInventoryMaterials(initialInventoryMaterials);
    setLiveCalculationResult(null);
  }

  const [prevInitialCuttingItems, setPrevInitialCuttingItems] = useState(initialCuttingItems);
  if (initialCuttingItems !== prevInitialCuttingItems) {
    setPrevInitialCuttingItems(initialCuttingItems);
    setCurrentCuttingItems(initialCuttingItems);
    setLiveCuttingResult(null);
  }

  const [prevInitialInventoryMaterials, setPrevInitialInventoryMaterials] = useState(initialInventoryMaterials);
  if (initialInventoryMaterials !== prevInitialInventoryMaterials) {
    setPrevInitialInventoryMaterials(initialInventoryMaterials);
    setCurrentInventoryMaterials(initialInventoryMaterials);
    setLiveCalculationResult(null);
  }

  const [productionRecord, setProductionRecord] = useState<ProductionRecord | null>(initialProductionRecord);
  const [prevInitialProductionRecord, setPrevInitialProductionRecord] = useState(initialProductionRecord);
  if (initialProductionRecord !== prevInitialProductionRecord) {
    setPrevInitialProductionRecord(initialProductionRecord);
    setProductionRecord(initialProductionRecord);
  }

  const [workflows, setWorkflows] = useState<OrderWorkflowStage[]>(initialOrderWorkflows);
  const [prevInitialWorkflows, setPrevInitialWorkflows] = useState(initialOrderWorkflows);
  if (initialOrderWorkflows !== prevInitialWorkflows) {
    setPrevInitialWorkflows(initialOrderWorkflows);
    setWorkflows(initialOrderWorkflows);
  }

  // Realtime subscription for workflows
  useRealtimeSubscription({
    table: "order_production_workflows",
    filter: `order_id=eq.${order.id}`,
    onEvent: () => {
      startTransition(() => {
        router.refresh();
      });
    },
  });

  // Realtime subscription for order updates
  useRealtimeSubscription({
    table: "orders",
    filter: `id=eq.${order.id}`,
    onEvent: (payload) => {
      if (payload.eventType === "UPDATE" && payload.new) {
        const updated = payload.new as Record<string, unknown>;
        setOrder((prev) => ({
          ...prev,
          status: (updated.status as string) || prev.status,
          updated_at: (updated.updated_at as string) || prev.updated_at,
        }));
      }
    },
  });

  // Realtime subscription for production record changes
  useRealtimeSubscription({
    table: "production_records",
    filter: `order_id=eq.${order.id}`,
    onEvent: (payload) => {
      if (payload.new) {
        const updated = payload.new as unknown as ProductionRecord;
        setProductionRecord(updated);
        setEditCompletedQty(updated.completed_quantity || 0);
        setEditRemarks(updated.remarks || "");
        toast.info("Production details updated in real time");
        startTransition(() => {
          router.refresh();
        });
      }
    },
  });

  // Realtime subscription for stage history
  useRealtimeSubscription({
    table: "production_stage_history",
    onEvent: (payload) => {
      if (payload.eventType === "INSERT") {
        startTransition(() => {
          router.refresh();
        });
      }
    },
  });

  // Realtime subscription for cutting items
  useRealtimeSubscription({
    table: "order_cutting_items",
    filter: `order_id=eq.${order.id}`,
    onEvent: () => {
      startTransition(() => {
        router.refresh();
      });
    },
  });

  // Realtime subscription for dynamic stage items (stitching, printing, embroidering)
  useRealtimeSubscription({
    table: "order_stage_items",
    filter: `order_id=eq.${order.id}`,
    onEvent: () => {
      startTransition(() => {
        router.refresh();
      });
    },
  });

  // Realtime subscription for checking items
  useRealtimeSubscription({
    table: "order_checking_items",
    filter: `order_id=eq.${order.id}`,
    onEvent: () => {
      startTransition(() => {
        router.refresh();
      });
    },
  });

  // Realtime subscription for ironing & packing items
  useRealtimeSubscription({
    table: "order_ironing_packing_items",
    filter: `order_id=eq.${order.id}`,
    onEvent: () => {
      startTransition(() => {
        router.refresh();
      });
    },
  });

  // Tabs State
  const [activeTab, setActiveTab] = useState("progress");

  // Dialog States
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [startRemarks, setStartRemarks] = useState("");
  const [isStarting, setIsStarting] = useState(false);

  const [showAdvanceDialog, setShowAdvanceDialog] = useState(false);
  const [advanceNote, setAdvanceNote] = useState("");
  const [isAdvancing, setIsAdvancing] = useState(false);

  const [showQtyDialog, setShowQtyDialog] = useState(false);
  const [editCompletedQty, setEditCompletedQty] = useState<number>(
    initialProductionRecord?.completed_quantity || 0
  );
  const [qtyNote, setQtyNote] = useState("");
  const [isUpdatingQty, setIsUpdatingQty] = useState(false);

  const [showRemarksDialog, setShowRemarksDialog] = useState(false);
  const [editRemarks, setEditRemarks] = useState(initialProductionRecord?.remarks || "");
  const [isUpdatingRemarks, setIsUpdatingRemarks] = useState(false);

  // Production Sequence Arrangement Modal State (triggered after Cutting completes)
  const [showSequenceModal, setShowSequenceModal] = useState(false);

  // Derived Values based on order-specific workflow sequence
  const sortedWorkflows = [...workflows].sort((a, b) => a.sequence_order - b.sequence_order);
  const middleStageKeys: ProductionStageKey[] = ["stitching", "printing", "embroidering"];
  const middleWorkflows = sortedWorkflows.filter((w) => middleStageKeys.includes(w.stage_key));
  const inProgressStage = sortedWorkflows.find((w) => w.status === "in_progress");
  const allStagesCompleted = sortedWorkflows.length === 8 && sortedWorkflows.every((w) => w.status === "completed");
  const allStagesPending = sortedWorkflows.length === 8 && sortedWorkflows.every((w) => w.status === "pending");
  const hasAnyCompletedStage = sortedWorkflows.some((w) => w.status === "completed");

  const isCuttingCompleted =
    sortedWorkflows.find((w) => w.stage_key === "cutting")?.status === "completed";

  const isInitialFinished =
    sortedWorkflows.find((w) => w.stage_key === "stock_sizes")?.status === "completed" &&
    sortedWorkflows.find((w) => w.stage_key === "inventory")?.status === "completed" &&
    isCuttingCompleted;

  const isReadyToStart =
    !inProgressStage &&
    !hasAnyCompletedStage &&
    (!productionRecord || productionRecord.stage === "ready_to_start" || allStagesPending);

  const hasStartedMiddleOrFinal = sortedWorkflows.some(
    (w) => w.sequence_order >= 4 && (w.status === "in_progress" || w.status === "completed")
  );

  const isAwaitingMiddleArrangement =
    isInitialFinished &&
    !hasStartedMiddleOrFinal;

  const resolved = resolveOrderCurrentStage(
    workflows,
    order.status,
    productionRecord?.stage
  );

  const currentStage = allStagesCompleted
    ? "production_completed"
    : isReadyToStart
    ? "ready_to_start"
    : isAwaitingMiddleArrangement
    ? "cutting"
    : resolved.currentStageKey;

  const currentStageSeq = resolved.currentSequence;

  // An order is read-only in production only if delivered/dispatched/cancelled or all stages completed
  const isOrderProductionActive = order.status === "confirmed" || order.status === "production";
  const isOrderReadOnly = !isOrderProductionActive || allStagesCompleted;

  // Determine expected next stage for advancement with strict state machine invariants
  const { nextStageKey, nextStageActionText } = getNextProductionStage(currentStage, workflows);

  const totalQuantity = productionRecord
    ? productionRecord.total_quantity
    : requirementItems.reduce((acc, item) => acc + (item.quantity || 0), 0);

  const completedQuantity = productionRecord ? productionRecord.completed_quantity : 0;
  const pendingQuantity = Math.max(0, totalQuantity - completedQuantity);
  const progressPercent = totalQuantity > 0 ? Math.round((completedQuantity / totalQuantity) * 100) : 0;

  const confirmedHistoryEvent = orderStatusHistory.find((h) => h.status === "confirmed");
  const confirmedDate = confirmedHistoryEvent ? confirmedHistoryEvent.created_at : null;

  // Handlers
  const handleStartProduction = async () => {
    setIsStarting(true);
    const res = await startProduction(order.id, startRemarks);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("Production started successfully with Stock Sizes!");
      setShowStartDialog(false);
      // Optimistically update workflow so Stock Sizes is immediately in progress
      setWorkflows((prev) =>
        prev.map((w) =>
          w.sequence_order === 1
            ? { ...w, status: "in_progress", started_at: new Date().toISOString() }
            : w
        )
      );
      setOrder((prev) => ({ ...prev, status: "production" }));
      router.refresh();
    }
    setIsStarting(false);
  };

  const handleAdvanceStage = async () => {
    if (!nextStageKey) return;
    if (nextStageKey === currentStage) {
      toast.error(`Invalid transition: already at ${formatStageLabel(currentStage)}`);
      return;
    }

    setIsAdvancing(true);
    const targetStage = nextStageKey;
    const res = await updateProductionStage(
      order.id,
      targetStage,
      advanceNote
    );
    if (res.error) {
      toast.error(res.error);
    } else {
      if (currentStage === "cutting" || targetStage === "cutting_completed") {
        toast.success("Cutting completed! Arrange and save the middle production sequence.");
      } else {
        toast.success(`Production advanced to ${formatWorkflowStageLabel(targetStage)}`);
      }
      setShowAdvanceDialog(false);
      setAdvanceNote("");

      // Optimistically update both productionRecord and workflows
      setProductionRecord((prev) =>
        prev
          ? {
              ...prev,
              stage: (currentStage === "cutting" || targetStage === "cutting_completed") ? "cutting" : targetStage,
              updated_at: new Date().toISOString(),
            }
          : prev
      );

      setWorkflows((prev) => {
        const sorted = [...prev].sort((a, b) => a.sequence_order - b.sequence_order);
        if (targetStage === "inventory") {
          return sorted.map((w) => {
            if (w.sequence_order === 1) return { ...w, status: "completed", completed_at: new Date().toISOString() };
            if (w.sequence_order === 2) return { ...w, status: "in_progress", started_at: new Date().toISOString() };
            return w;
          });
        }
        if (targetStage === "cutting") {
          return sorted.map((w) => {
            if (w.sequence_order <= 2) return { ...w, status: "completed", completed_at: w.completed_at || new Date().toISOString() };
            if (w.sequence_order === 3) return { ...w, status: "in_progress", started_at: new Date().toISOString() };
            return w;
          });
        }
        if (currentStage === "cutting" || targetStage === "cutting_completed") {
          return sorted.map((w) => {
            if (w.sequence_order <= 3) return { ...w, status: "completed", completed_at: w.completed_at || new Date().toISOString() };
            return w;
          });
        }
        const targetW = sorted.find((w) => w.stage_key === targetStage);
        if (targetW) {
          return sorted.map((w) => {
            if (w.sequence_order < targetW.sequence_order) {
              return { ...w, status: "completed", completed_at: w.completed_at || new Date().toISOString() };
            }
            if (w.sequence_order === targetW.sequence_order) {
              return { ...w, status: "in_progress", started_at: new Date().toISOString() };
            }
            return w;
          });
        }
        return sorted;
      });

      if (targetStage === "cutting") {
        setActiveTab("cutting");
      }

      router.refresh();
    }
    setIsAdvancing(false);
  };

  const handleSaveQuantity = async () => {
    if (editCompletedQty < 0 || !Number.isInteger(editCompletedQty)) {
      toast.error("Please enter a valid whole number >= 0");
      return;
    }
    if (editCompletedQty > totalQuantity) {
      toast.error(`Completed quantity cannot exceed total quantity (${totalQuantity})`);
      return;
    }

    setIsUpdatingQty(true);
    const res = await updateProductionQuantity(order.id, editCompletedQty, qtyNote);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("Completed quantity updated successfully");
      setShowQtyDialog(false);
      setQtyNote("");
      router.refresh();
    }
    setIsUpdatingQty(false);
  };

  const handleSaveRemarks = async () => {
    setIsUpdatingRemarks(true);
    const res = await updateProductionRemarks(order.id, editRemarks);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("Remarks updated successfully");
      setShowRemarksDialog(false);
      router.refresh();
    }
    setIsUpdatingRemarks(false);
  };

  return (
    <div className="w-full">
      {/* 1. Dedicated Print Documents (ONLY visible during print) */}
      <div
        id="cutting-print-document"
        className={
          activePrintDocument === "cutting" ||
          (!activePrintDocument && (activeTab === "cutting" || currentStage === "cutting"))
            ? "hidden print:block w-full"
            : "hidden print:hidden"
        }
      >
        <CuttingPrintView
          orderNumber={order.order_number}
          schoolName={order.schools?.name || ""}
          calculationResult={printCuttingResult}
        />
      </div>

      <div
        id="inventory-print-document"
        className={
          activePrintDocument === "inventory" ||
          (!activePrintDocument && activeTab === "inventory") ||
          (!activePrintDocument && activeTab !== "cutting" && currentStage === "inventory")
            ? "hidden print:block w-full"
            : "hidden print:hidden"
        }
      >
        <InventoryPrintView
          orderNumber={order.order_number}
          schoolName={order.schools?.name || ""}
          calculationResult={printCalculationResult}
        />
      </div>

      {printDynamicStageKey && (
        <div
          id="dynamic-stage-print-document"
          className={
            activePrintDocument === "dynamic_stage" ||
            (!activePrintDocument && activeTab === printDynamicStageKey)
              ? "hidden print:block w-full"
              : "hidden print:hidden"
          }
        >
          <DynamicStagePrintView
            orderNumber={order.order_number}
            schoolName={order.schools?.name || ""}
            calculationResult={calculateDynamicStage({
              stageKey: printDynamicStageKey,
              workflows,
              cuttingItems: currentCuttingItems,
              stageItems: currentStageItems,
            })}
            workflows={workflows}
          />
        </div>
      )}

      <div
        id="checking-print-document"
        className={
          activePrintDocument === "checking" ||
          (!activePrintDocument && (activeTab === "checking" || currentStage === "checking"))
            ? "hidden print:block w-full"
            : "hidden print:hidden"
        }
      >
        <CheckingPrintView
          orderNumber={order.order_number}
          schoolName={order.schools?.name || ""}
          calculationResult={calculateCheckingStage({
            workflows,
            stageItems: currentStageItems,
            savedCheckingItems: currentCheckingItems,
          })}
          workflows={workflows}
        />
      </div>

      <div
        id="ironing-packing-print-document"
        className={
          activePrintDocument === "ironing_packing" ||
          (!activePrintDocument && (activeTab === "ironing_packing" || currentStage === "ironing_packing"))
            ? "hidden print:block w-full"
            : "hidden print:hidden"
        }
      >
        <IroningPackingPrintView
          orderNumber={order.order_number}
          schoolName={order.schools?.name || ""}
          mode={printIroningPackingMode}
          ironingResult={calculateIroningStep({
            savedCheckingItems: currentCheckingItems,
            savedIroningItems: currentIroningPackingItems.filter((i) => i.stage_key === "ironing"),
          })}
          packingResult={calculatePackingStep({
            isIroningCompleted: isIroningStepCompleted(
              sortedWorkflows.find((w) => w.stage_key === "ironing_packing"),
              currentIroningPackingItems
            ),
            savedIroningItems: currentIroningPackingItems.filter((i) => i.stage_key === "ironing"),
            savedPackingItems: currentIroningPackingItems.filter((i) => i.stage_key === "packing"),
          })}
        />
      </div>

      {/* 2. Normal Screen UI (Hidden during print) */}
      <div className="production-screen-ui print:hidden space-y-6 w-full min-w-0 pb-12">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-4 w-full min-w-0">
          <div className="flex items-start gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => router.push("/admin/production")}
              className="h-9 w-9 shrink-0 mt-0.5"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 break-all">
                  Order #{order.order_number}
                </h1>
                <Badge
                  variant="outline"
                  className={`px-2.5 py-0.5 text-xs font-semibold shrink-0 ${getStageBadgeColor(
                    currentStage
                  )}`}
                >
                  {formatStageLabel(currentStage)}
                </Badge>
                {order.status === "production" && currentStage === "production_completed" && (
                  <Badge className="bg-evenvibe-primary text-white hover:bg-evenvibe-deep text-xs shrink-0">
                    Ready for Quality Check
                  </Badge>
                )}
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                <span className="flex items-center gap-1 font-medium text-slate-700">
                  <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="break-words">{order.schools?.name || "Unknown School"}</span>
                </span>
                <span className="text-slate-300 hidden sm:inline">•</span>
                <span className="capitalize text-slate-500">Order Lifecycle: {order.status.replace(/_/g, " ")}</span>
              </p>
            </div>
          </div>

          {/* Primary Action Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            {isReadyToStart && (
              <Button
                className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white gap-2 shadow-sm w-full sm:w-auto text-xs sm:text-sm h-9"
                onClick={() => setShowStartDialog(true)}
                disabled={isStarting}
              >
                <Play className="h-4 w-4" />
                {isStarting ? "Starting..." : "Start Production"}
              </Button>
            )}

            {isAwaitingMiddleArrangement ? (
              <Button
                className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white gap-2 shadow-sm font-semibold w-full sm:w-auto text-xs sm:text-sm h-9"
                onClick={() => setShowSequenceModal(true)}
              >
                <Shuffle className="h-4 w-4" />
                Arrange Production Sequence
              </Button>
            ) : (
              productionRecord && order.status === "production" && nextStageKey && (
                <Button
                  className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white gap-2 shadow-sm w-full sm:w-auto text-xs sm:text-sm h-9"
                  onClick={() => setShowAdvanceDialog(true)}
                  disabled={isAdvancing}
                >
                  <ArrowRight className="h-4 w-4" />
                  {isAdvancing ? "Updating..." : nextStageActionText}
                </Button>
              )
            )}

            {productionRecord && (
              <Button
                variant="outline"
                className="border-slate-300 hover:bg-slate-50 gap-1.5 w-full sm:w-auto text-xs sm:text-sm h-9"
                onClick={() => {
                  setEditCompletedQty(productionRecord.completed_quantity);
                  setShowQtyDialog(true);
                }}
                disabled={isUpdatingQty}
              >
                <Edit3 className="h-3.5 w-3.5" />
                Update Progress
              </Button>
            )}

            {currentStage === "production_completed" && order.status === "production" && (
              <Link href={`/admin/quality-check/${order.id}`} className="w-full sm:w-auto">
                <Button className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white gap-2 shadow-sm w-full text-xs sm:text-sm h-9">
                  <ClipboardCheck className="h-4 w-4" />
                  Go to Quality Check
                </Button>
              </Link>
            )}

            {["quality_check", "packed", "dispatched", "in_transit", "delivered"].includes(order.status) && (
              <Link href={`/admin/quality-check/${order.id}`} className="w-full sm:w-auto">
                <Button variant="outline" className="border-slate-300 hover:bg-slate-50 gap-1.5 text-emerald-800 w-full text-xs sm:text-sm h-9">
                  <ClipboardCheck className="h-4 w-4 text-evenvibe-primary" />
                  View Quality Check
                </Button>
              </Link>
            )}

            {["packed", "dispatched", "in_transit", "delivered"].includes(order.status) && (
              <Link href={`/admin/packing-delivery/${order.id}`} className="w-full sm:w-auto">
                <Button variant="outline" className="border-slate-300 hover:bg-slate-50 gap-1.5 text-evenvibe-deep w-full text-xs sm:text-sm h-9">
                  <Truck className="h-4 w-4 text-evenvibe-primary" />
                  View Packing & Delivery
                </Button>
              </Link>
            )}

            <Link href={`/admin/orders/${order.id}`} className="w-full sm:w-auto">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-slate-900 w-full text-xs h-9"
              >
                View Order
              </Button>
            </Link>
          </div>
        </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col h-auto overflow-visible">
        {/* Mobile Tab Navigation (visible on mobile < md) */}
        <div className="md:hidden space-y-3 mb-6 w-full">
          {/* Quick Jump Dropdown */}
          <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <span className="text-xs font-semibold text-slate-600 shrink-0">Stage View:</span>
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value)}
              className="w-full text-xs font-medium bg-white border border-slate-300 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-2xs"
            >
              <option value="progress">Production Progress</option>
              <option value="stock_sizes">Stock Size Requirements {currentStage === "stock_sizes" ? "• Active" : ""}</option>
              <option value="inventory">Inventory Material {currentStage === "inventory" ? "• Active" : ""}</option>
              <option value="cutting">Cutting Requirements {currentStage === "cutting" ? "• Active" : ""}</option>
              {middleWorkflows.map((mw) => (
                <option key={`opt-${mw.stage_key}`} value={mw.stage_key}>
                  {formatWorkflowStageLabel(mw.stage_key)} {currentStage === mw.stage_key ? "• Active" : mw.status === "completed" ? "✓ Done" : ""}
                </option>
              ))}
              <option value="checking">Checking (Quality Check) {currentStage === "checking" ? "• Active" : ""}</option>
              <option value="ironing_packing">Ironing & Packing {currentStage === "ironing_packing" ? "• Active" : ""}</option>
            </select>
          </div>

          {/* 2-Column Responsive Wrapped Grid of Tabs */}
          <TabsList className="grid grid-cols-2 gap-1.5 w-full bg-slate-100/90 p-1.5 rounded-lg border border-slate-200/80 !h-auto">
            <TabsTrigger
              value="progress"
              className="w-full text-[11px] font-medium py-2 px-2 rounded data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-2xs text-slate-700 flex items-center justify-center gap-1 text-center truncate"
            >
              Progress
            </TabsTrigger>
            <TabsTrigger
              value="stock_sizes"
              className="w-full text-[11px] font-medium py-2 px-2 rounded data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-2xs text-slate-700 flex items-center justify-center gap-1 text-center truncate"
            >
              <span>Stock Sizes</span>
              {currentStage === "stock_sizes" && (
                <span className="h-1.5 w-1.5 rounded-full bg-evenvibe-primary shrink-0" />
              )}
            </TabsTrigger>
            <TabsTrigger
              value="inventory"
              className="w-full text-[11px] font-medium py-2 px-2 rounded data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-2xs text-slate-700 flex items-center justify-center gap-1 text-center truncate"
            >
              <span>Inventory</span>
              {currentStage === "inventory" && (
                <span className="h-1.5 w-1.5 rounded-full bg-status-warning shrink-0" />
              )}
            </TabsTrigger>
            <TabsTrigger
              value="cutting"
              className="w-full text-[11px] font-medium py-2 px-2 rounded data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-2xs text-slate-700 flex items-center justify-center gap-1 text-center truncate"
            >
              <span>Cutting</span>
              {currentStage === "cutting" && (
                <span className="h-1.5 w-1.5 rounded-full bg-evenvibe-primary shrink-0" />
              )}
            </TabsTrigger>
            {middleWorkflows.map((mw) => {
              const isStageActive = currentStage === mw.stage_key;
              const isStageCompleted = mw.status === "completed";
              return (
                <TabsTrigger
                  key={`m-tab-${mw.stage_key}`}
                  value={mw.stage_key}
                  className="w-full text-[11px] font-medium py-2 px-2 rounded data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-2xs text-slate-700 flex items-center justify-center gap-1 text-center truncate"
                >
                  <span className="truncate">{formatWorkflowStageLabel(mw.stage_key)}</span>
                  {isStageActive && (
                    <span className="h-1.5 w-1.5 rounded-full bg-evenvibe-primary shrink-0" />
                  )}
                  {isStageCompleted && (
                    <span className="text-[10px] text-evenvibe-primary font-bold shrink-0">✓</span>
                  )}
                </TabsTrigger>
              );
            })}
            <TabsTrigger
              value="checking"
              className="w-full text-[11px] font-medium py-2 px-2 rounded data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-2xs text-slate-700 flex items-center justify-center gap-1 text-center truncate"
            >
              <span>Checking</span>
              {currentStage === "checking" && (
                <span className="h-1.5 w-1.5 rounded-full bg-evenvibe-primary shrink-0" />
              )}
            </TabsTrigger>
            <TabsTrigger
              value="ironing_packing"
              className="w-full text-[11px] font-medium py-2 px-2 rounded data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-2xs text-slate-700 flex items-center justify-center gap-1 text-center truncate"
            >
              <span>Ironing & Packing</span>
              {currentStage === "ironing_packing" && (
                <span className="h-1.5 w-1.5 rounded-full bg-status-warning shrink-0" />
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Desktop Tabs List (hidden on mobile, visible on md+) */}
        <div className="hidden md:block overflow-x-auto border-b border-slate-200 w-full min-w-0 pb-px">
          <TabsList className="inline-flex w-max justify-start !h-auto pb-1 bg-transparent space-x-6 border-b-0">
            <TabsTrigger
              value="progress"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:text-emerald-700 data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2 px-1 font-semibold"
            >
              Production Progress
            </TabsTrigger>
            <TabsTrigger
              value="stock_sizes"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:text-emerald-700 data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2 px-1 font-semibold flex items-center gap-1.5"
            >
              <span>Stock Size Requirements</span>
              {currentStage === "stock_sizes" && (
                <Badge className="bg-evenvibe-primary text-white text-[10px] px-1.5 py-0 h-4">
                  Active Stage
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="inventory"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:text-emerald-700 data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2 px-1 font-semibold flex items-center gap-1.5"
            >
              <span>Inventory Material</span>
              {currentStage === "inventory" && (
                <Badge className="bg-status-warning text-white text-[10px] px-1.5 py-0 h-4">
                  Active Stage
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="cutting"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-evenvibe-primary data-[state=active]:text-evenvibe-deep data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2 px-1 font-semibold flex items-center gap-1.5"
            >
              <span>Cutting Requirements</span>
              {currentStage === "cutting" && (
                <Badge className="bg-evenvibe-primary text-white text-[10px] px-1.5 py-0 h-4">
                  Active Stage
                </Badge>
              )}
            </TabsTrigger>
            {middleWorkflows.map((mw) => {
              const isStageActive = currentStage === mw.stage_key;
              const isStageCompleted = mw.status === "completed";
              const isStageLocked = mw.status === "pending" || isAwaitingMiddleArrangement;
              return (
                <TabsTrigger
                  key={mw.stage_key}
                  value={mw.stage_key}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-evenvibe-primary data-[state=active]:text-evenvibe-deep data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2 px-1 font-semibold flex items-center gap-1.5"
                >
                  <span>{formatWorkflowStageLabel(mw.stage_key)}</span>
                  {isStageActive && (
                    <Badge className="bg-evenvibe-primary text-white text-[10px] px-1.5 py-0 h-4">
                      Active Stage
                    </Badge>
                  )}
                  {isStageCompleted && (
                    <Badge
                      variant="outline"
                      className="bg-evenvibe-light text-evenvibe-deep border-emerald-300 text-[10px] px-1.5 py-0 h-4 font-bold"
                    >
                      ✓
                    </Badge>
                  )}
                  {!isStageActive && !isStageCompleted && isStageLocked && (
                    <Lock className="h-3 w-3 text-slate-400" />
                  )}
                </TabsTrigger>
              );
            })}
            {/* Stage 7: Checking Tab Trigger */}
            {(() => {
              const checkingWf = sortedWorkflows.find((w) => w.stage_key === "checking");
              const isStageActive = currentStage === "checking";
              const isStageCompleted = checkingWf?.status === "completed";
              const isStageLocked = sortedWorkflows.some(
                (w) => w.sequence_order < 7 && w.status !== "completed"
              );
              return (
                <TabsTrigger
                  value="checking"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-evenvibe-primary data-[state=active]:text-evenvibe-deep data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2 px-1 font-semibold flex items-center gap-1.5"
                >
                  <span>Checking (Quality Check)</span>
                  {isStageActive && (
                    <Badge className="bg-evenvibe-primary text-white text-[10px] px-1.5 py-0 h-4">
                      Active Stage
                    </Badge>
                  )}
                  {isStageCompleted && (
                    <Badge
                      variant="outline"
                      className="bg-evenvibe-light text-evenvibe-deep border-emerald-300 text-[10px] px-1.5 py-0 h-4 font-bold"
                    >
                      ✓
                    </Badge>
                  )}
                  {!isStageActive && !isStageCompleted && isStageLocked && (
                    <Lock className="h-3 w-3 text-slate-400" />
                  )}
                </TabsTrigger>
              );
            })()}
            {/* Stage 8: Ironing & Packing Tab Trigger */}
            {(() => {
              const ironingPackingWf = sortedWorkflows.find((w) => w.stage_key === "ironing_packing");
              const isStageActive = currentStage === "ironing_packing";
              const isStageCompleted = ironingPackingWf?.status === "completed";
              const isStageLocked = sortedWorkflows.some(
                (w) => w.sequence_order < 8 && w.status !== "completed"
              );
              return (
                <TabsTrigger
                  value="ironing_packing"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-status-warning data-[state=active]:text-amber-700 data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2 px-1 font-semibold flex items-center gap-1.5"
                >
                  <span>Ironing & Packing</span>
                  {isStageActive && (
                    <Badge className="bg-status-warning text-white text-[10px] px-1.5 py-0 h-4">
                      Active Stage
                    </Badge>
                  )}
                  {isStageCompleted && (
                    <Badge
                      variant="outline"
                      className="bg-evenvibe-light text-evenvibe-deep border-emerald-300 text-[10px] px-1.5 py-0 h-4 font-bold"
                    >
                      ✓
                    </Badge>
                  )}
                  {!isStageActive && !isStageCompleted && isStageLocked && (
                    <Lock className="h-3 w-3 text-slate-400" />
                  )}
                </TabsTrigger>
              );
            })()}
          </TabsList>
        </div>

        {/* Tab 1: Progress & Overview */}
        <TabsContent value="progress" className="space-y-6 mt-6 w-full h-auto flex-none overflow-visible">
          {/* Production Progress & Manufacturing Workflow Stepper Container */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-visible h-auto w-full">
            {/* Stepper Header (Natural flow, ample padding, clean typography and spacing) */}
            <div className="bg-slate-50/80 border-b border-slate-200 p-4 sm:p-5 rounded-t-xl h-auto">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1">
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Factory className="h-5 w-5 text-evenvibe-primary shrink-0" />
                    Manufacturing Workflow Stepper
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 break-words leading-relaxed">
                    Sequential order of 8 production stages configured specifically for this order.
                  </p>
                </div>
                <div className="self-start sm:self-center shrink-0">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-white border border-slate-200 text-slate-800 shadow-2xs">
                    {progressPercent}% Completed
                  </span>
                </div>
              </div>
            </div>

            {/* Stepper Content Body */}
            <div className="p-3.5 sm:p-6 space-y-6 sm:space-y-8 h-auto overflow-visible">
              {/* Mobile Visual Stage Stepper (1 card per row, w-full, strictly normal document flow) */}
              <div className="sm:hidden flex flex-col gap-2.5 w-full h-auto overflow-visible">
                {sortedWorkflows.map((w, idx) => {
                  const stageConfig = STAGE_CONFIG_MAP[w.stage_key] || {
                    key: w.stage_key,
                    label: formatWorkflowStageLabel(w.stage_key),
                    icon: CheckCheck,
                    description: "",
                  };
                  const Icon = stageConfig.icon;
                  const isCurrent =
                    w.status === "in_progress" ||
                    (currentStage !== "production_completed" && (w.stage_key as string) === currentStage);
                  const isCompleted =
                    w.status === "completed" ||
                    currentStage === "production_completed" ||
                    (currentStageSeq !== null && w.sequence_order < currentStageSeq);

                  let isLocked = false;
                  let displayStatusText = "○ Pending";

                  if (isCompleted) {
                    displayStatusText = "✓ Completed";
                  } else if (isCurrent) {
                    displayStatusText = "▶ In Progress";
                  } else {
                    if (isReadyToStart) {
                      if (idx === 0) {
                        displayStatusText = "○ Pending";
                      } else {
                        isLocked = true;
                        displayStatusText = "🔒 Locked";
                      }
                    } else {
                      const prevStage = idx > 0 ? sortedWorkflows[idx - 1] : null;
                      const isPrevCompleted =
                        prevStage?.status === "completed" ||
                        (currentStageSeq !== null && prevStage && prevStage.sequence_order < currentStageSeq);
                      if (isPrevCompleted && !inProgressStage && idx >= 3 && idx <= 5) {
                        displayStatusText = "○ Pending";
                      } else {
                        isLocked = true;
                        displayStatusText = "🔒 Locked";
                      }
                    }
                  }

                  return (
                    <div
                      key={`mob-step-${w.stage_key}`}
                      onClick={() => setActiveTab(w.stage_key)}
                      className={`w-full p-3.5 rounded-xl border transition-all flex flex-wrap items-center justify-between gap-2.5 cursor-pointer h-auto overflow-visible ${
                        isCurrent
                          ? "bg-blue-50/90 border-blue-400 ring-2 ring-blue-500/20 shadow-xs"
                          : isCompleted
                          ? "bg-emerald-50/70 border-emerald-200 text-slate-800"
                          : isLocked
                          ? "bg-slate-50 border-slate-200 text-slate-400 opacity-60"
                          : "bg-white border-slate-200 text-slate-700 shadow-2xs"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center font-bold text-xs ${
                            isCurrent
                              ? "bg-evenvibe-primary text-white shadow-sm"
                              : isCompleted
                              ? "bg-evenvibe-primary text-white"
                              : isLocked
                              ? "bg-slate-100 text-slate-400 border border-slate-200"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : isLocked ? (
                            <Lock className="h-4 w-4 text-slate-400" />
                          ) : isCurrent ? (
                            <span className="text-sm">●</span>
                          ) : (
                            <Icon className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-mono text-slate-400">Stage {idx + 1}</span>
                            <p
                              className={`text-xs font-semibold break-words ${
                                isCurrent
                                  ? "text-blue-950 font-bold"
                                  : isCompleted
                                  ? "text-slate-800"
                                  : isLocked
                                  ? "text-slate-400"
                                  : "text-slate-700"
                              }`}
                            >
                              {stageConfig.label}
                            </p>
                          </div>
                          {w.completed_at && (
                            <span className="text-[10px] text-muted-foreground block truncate mt-0.5">
                              Completed {formatDate(w.completed_at)}
                            </span>
                          )}
                          {isCurrent && w.started_at && (
                            <span className="text-[10px] text-muted-foreground block truncate mt-0.5">
                              Started {formatDate(w.started_at)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <span
                          className={`text-xs font-semibold px-2.5 py-1 rounded-full inline-block ${
                            isCurrent
                              ? "bg-blue-100 text-blue-800 font-bold"
                              : isCompleted
                              ? "bg-emerald-100 text-emerald-800"
                              : isLocked
                              ? "bg-slate-100 text-slate-400"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {displayStatusText}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Visual Stage Stepper (hidden on mobile, visible on sm+) */}
              <div className="hidden sm:grid sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2.5 relative w-full min-w-0">
                {sortedWorkflows.map((w, idx) => {
                  const stageConfig = STAGE_CONFIG_MAP[w.stage_key] || {
                    key: w.stage_key,
                    label: formatWorkflowStageLabel(w.stage_key),
                    icon: CheckCheck,
                    description: "",
                  };
                  const Icon = stageConfig.icon;
                  const isCurrent =
                    w.status === "in_progress" ||
                    (currentStage !== "production_completed" && (w.stage_key as string) === currentStage);
                  const isCompleted =
                    w.status === "completed" ||
                    currentStage === "production_completed" ||
                    (currentStageSeq !== null && w.sequence_order < currentStageSeq);

                  let isLocked = false;
                  let displayStatusText = "○ Pending";

                  if (isCompleted) {
                    displayStatusText = "✓ Completed";
                  } else if (isCurrent) {
                    displayStatusText = "▶ In Progress";
                  } else {
                    if (isReadyToStart) {
                      if (idx === 0) {
                        displayStatusText = "○ Pending";
                      } else {
                        isLocked = true;
                        displayStatusText = "🔒 Locked";
                      }
                    } else {
                      // Production is running
                      const prevStage = idx > 0 ? sortedWorkflows[idx - 1] : null;
                      const isPrevCompleted =
                        prevStage?.status === "completed" ||
                        (currentStageSeq !== null && prevStage && prevStage.sequence_order < currentStageSeq);
                      if (isPrevCompleted && !inProgressStage && idx >= 3 && idx <= 5) {
                        displayStatusText = "○ Pending";
                      } else {
                        isLocked = true;
                        displayStatusText = "🔒 Locked";
                      }
                    }
                  }

                  return (
                    <div
                      key={w.stage_key}
                      className={`relative p-2.5 rounded-lg border transition-all flex flex-col items-center text-center gap-1.5 min-w-0 ${
                        isCurrent
                          ? "bg-blue-50/80 border-blue-400 ring-2 ring-blue-500/20 shadow-sm"
                          : isCompleted
                          ? "bg-emerald-50/60 border-emerald-200 text-slate-800"
                          : isLocked
                          ? "bg-slate-50/80 border-slate-200 text-slate-400 opacity-60"
                          : "bg-white border-slate-200 text-slate-600 shadow-2xs"
                      }`}
                    >
                      <div
                        className={`h-8 w-8 rounded-full flex items-center justify-center transition-all ${
                          isCurrent
                            ? "bg-evenvibe-primary text-white shadow-md shadow-blue-200"
                            : isCompleted
                            ? "bg-evenvibe-primary text-white"
                            : isLocked
                            ? "bg-slate-100 text-slate-400 border border-slate-200"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : isLocked ? (
                          <Lock className="h-3.5 w-3.5 text-slate-400" />
                        ) : (
                          <Icon className="h-4 w-4" />
                        )}
                      </div>
                      <div className="w-full">
                        <span className="text-[10px] font-mono text-slate-400 block mb-0.5">
                          {idx + 1}
                        </span>
                        <p
                          className={`text-xs font-semibold truncate ${
                            isCurrent
                              ? "text-blue-950 font-bold"
                              : isCompleted
                              ? "text-slate-800"
                              : isLocked
                              ? "text-slate-400"
                              : "text-slate-700"
                          }`}
                          title={stageConfig.label}
                        >
                          {stageConfig.label}
                        </p>
                        <span
                          className={`text-[10px] block mt-0.5 font-medium ${
                            isCurrent
                              ? "text-blue-700 font-bold"
                              : isCompleted
                              ? "text-evenvibe-deep font-semibold"
                              : isLocked
                              ? "text-slate-400"
                              : "text-slate-600"
                          }`}
                        >
                          {displayStatusText}
                        </span>
                        {w.completed_at && (
                          <span className="text-[9px] text-muted-foreground block mt-0.5 truncate">
                            {formatDate(w.completed_at)}
                          </span>
                        )}
                        {isCurrent && w.started_at && (
                          <span className="text-[9px] text-muted-foreground block mt-0.5 truncate">
                            {formatDate(w.started_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Progress Counters & Bar */}
              <div className="bg-slate-50 rounded-xl p-5 border space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-center">
                  <div className="bg-white p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground font-medium">Total Quantity</p>
                    <p className="text-2xl font-bold text-slate-900 mt-0.5">{totalQuantity}</p>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-emerald-100">
                    <p className="text-xs text-evenvibe-deep font-medium">Completed</p>
                    <p className="text-2xl font-bold text-evenvibe-primary mt-0.5">{completedQuantity}</p>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-amber-100">
                    <p className="text-xs text-amber-700 font-medium">Pending</p>
                    <p className="text-2xl font-bold text-status-warning mt-0.5">{pendingQuantity}</p>
                  </div>
                  <div className="bg-white p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground font-medium">Progress Rate</p>
                    <p className="text-2xl font-bold text-evenvibe-primary mt-0.5">{progressPercent}%</p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Overall Progress</span>
                    <span>{progressPercent}% completed</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-status-success h-3 rounded-full transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Manufacturing Processing Actions Card */}
              <div className="rounded-xl border p-5 bg-gradient-to-r from-slate-50 to-white shadow-sm">
                {isReadyToStart && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="space-y-1 text-center sm:text-left">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 mb-1">
                        Ready To Start
                      </div>
                      <h4 className="text-base font-bold text-slate-900">
                        Initiate Manufacturing Workflow
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Order #{order.order_number} is ready. Start production to track cutting, stitching, and finishing.
                      </p>
                    </div>
                    <Button
                      size="lg"
                      className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white shadow gap-2 font-medium px-6 shrink-0 w-full sm:w-auto"
                      onClick={() => setShowStartDialog(true)}
                      disabled={isStarting}
                    >
                      <Play className="h-4 w-4" />
                      {isStarting ? "Starting..." : "Start Production"}
                    </Button>
                  </div>
                )}

                {productionRecord && currentStage !== "production_completed" && (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Active Stage:
                          </span>
                          <Badge className="bg-evenvibe-primary text-white text-xs font-medium">
                            {formatStageLabel(currentStage)}
                          </Badge>
                        </div>
                        <h4 className="text-base font-bold text-slate-900 mt-1">
                          Manufacturing Processing in Progress
                        </h4>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-slate-300 hover:bg-slate-100 text-slate-800 gap-1.5 shadow-sm"
                          onClick={() => {
                            setEditCompletedQty(productionRecord.completed_quantity);
                            setShowQtyDialog(true);
                          }}
                          disabled={isUpdatingQty}
                        >
                          <Edit3 className="h-3.5 w-3.5 text-slate-600" />
                          Update Completed Units ({completedQuantity}/{totalQuantity})
                        </Button>

                        {nextStageKey && (
                          <Button
                            size="sm"
                            className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white gap-1.5 shadow font-medium"
                            onClick={() => setShowAdvanceDialog(true)}
                            disabled={isAdvancing}
                          >
                            <ArrowRight className="h-4 w-4" />
                            {isAdvancing ? "Updating..." : nextStageActionText}
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="text-xs text-slate-600 bg-white p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span>
                        Manufactured: <strong>{completedQuantity}</strong> / <strong>{totalQuantity}</strong> units ({progressPercent}%)
                      </span>
                      {nextStageKey && (
                        <span className="text-evenvibe-deep font-medium">
                          Next Stage: {formatStageLabel(nextStageKey)}
                        </span>
                      )}
                    </div>

                    {currentStage === "stock_sizes" && (
                      <div className="pt-2 border-t border-slate-200/80 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-50/70 border border-emerald-200 rounded-lg p-3.5">
                          <div className="space-y-0.5">
                            <h5 className="text-xs font-bold text-emerald-950 uppercase tracking-wide">
                              Active Stage: Stock Size Requirements
                            </h5>
                            <p className="text-xs text-emerald-800">
                              Required uniform quantities based on the students and sizes in this order.
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveTab("stock_sizes")}
                            className="text-xs border-emerald-300 text-emerald-900 hover:bg-emerald-100 bg-white shadow-2xs shrink-0 self-start sm:self-center font-medium"
                          >
                            Open Full View →
                          </Button>
                        </div>
                        <StockSizesBreakdown
                          requirementItems={requirementItems}
                          totalStudents={totalStudents}
                          classStudentCounts={classStudentCounts}
                          orderNumber={order.order_number}
                          schoolName={order.schools?.name}
                        />
                      </div>
                    )}

                    {currentStage === "inventory" && (
                      <div className="pt-2 border-t border-slate-200/80 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50/70 border border-amber-200 rounded-lg p-3.5">
                          <div className="space-y-0.5">
                            <h5 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                              Active Stage: Inventory Material Requirement
                            </h5>
                            <p className="text-xs text-amber-800">
                              Enter the Gram / Piece for each style and color to calculate total material weight before advancing to Cutting.
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveTab("inventory")}
                            className="text-xs border-amber-300 text-amber-900 hover:bg-amber-100 bg-white shadow-2xs shrink-0 self-start sm:self-center font-medium"
                          >
                            Open Dedicated Tab →
                          </Button>
                        </div>
                        <InventoryMaterialStage
                          orderId={order.id}
                          orderNumber={order.order_number}
                          schoolName={order.schools?.name}
                          requirementItems={requirementItems}
                          savedMaterials={currentInventoryMaterials}
                          currentStage={currentStage}
                          isLocked={isWorkflowLocked}
                          onMaterialsUpdated={(updated) => setCurrentInventoryMaterials(updated)}
                          onStageAdvanced={() => router.refresh()}
                          onCalculationResultChange={setLiveCalculationResult}
                        />
                      </div>
                    )}

                    {currentStage === "cutting" && (
                      <div className="pt-2 border-t border-slate-200/80 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-evenvibe-light/70 border border-evenvibe-light rounded-lg p-3.5">
                          <div className="space-y-0.5">
                            <h5 className="text-xs font-bold text-evenvibe-deep uppercase tracking-wide">
                              Active Stage: Cutting — Actual Cut vs Required Quantity
                            </h5>
                            <p className="text-xs text-evenvibe-deep">
                              Enter the actual number of pieces cut for each size. Every size must have an actual cut quantity entered before completing Cutting.
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveTab("cutting")}
                            className="text-xs -evenvibe-primary text-evenvibe-deep hover:bg-evenvibe-light bg-white shadow-2xs shrink-0 self-start sm:self-center font-medium"
                          >
                            Open Dedicated Tab →
                          </Button>
                        </div>
                        <CuttingStage
                          key={`cutting-progress-${order.id}`}
                          orderId={order.id}
                          orderNumber={order.order_number}
                          schoolName={order.schools?.name}
                          requirementItems={requirementItems}
                          savedCuttingItems={currentCuttingItems}
                          currentStage={currentStage}
                          isLocked={isWorkflowLocked}
                          isCuttingCompleted={isCuttingCompleted}
                          isAwaitingSequence={isAwaitingMiddleArrangement}
                          orderStudents={orderStudents}
                          totalStudents={totalStudents}
                          onCuttingUpdated={(updated) => setCurrentCuttingItems(updated)}
                          onCuttingCompleted={(updatedWorkflows) => {
                            if (updatedWorkflows) {
                              setWorkflows(updatedWorkflows);
                            } else {
                              setWorkflows((prev) =>
                                prev.map((w) =>
                                  w.stage_key === "cutting"
                                    ? { ...w, status: "completed", completed_at: new Date().toISOString() }
                                    : w
                                )
                              );
                            }
                            setShowSequenceModal(true);
                          }}
                          onOpenSequenceModal={() => setShowSequenceModal(true)}
                          onStageAdvanced={() => router.refresh()}
                          onCalculationResultChange={setLiveCuttingResult}
                          onPrint={handlePrintCutting}
                        />
                      </div>
                    )}

                    {["stitching", "printing", "embroidering"].includes(currentStage) && (
                      <div className="pt-2 border-t border-slate-200/80 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-evenvibe-light/70 border border-evenvibe-light rounded-lg p-3.5">
                          <div className="space-y-0.5">
                            <h5 className="text-xs font-bold text-evenvibe-deep uppercase tracking-wide">
                              Active Stage: {formatWorkflowStageLabel(currentStage)} Operation
                            </h5>
                            <p className="text-xs text-evenvibe-deep">
                              Enter actual mistaked {formatWorkflowStageLabel(currentStage).toLowerCase()} quantity. Every size must have an actual quantity entered before completing.
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveTab(currentStage)}
                            className="text-xs -evenvibe-primary text-evenvibe-deep hover:bg-evenvibe-light bg-white shadow-2xs shrink-0 self-start sm:self-center font-medium"
                          >
                            Open Dedicated Tab →
                          </Button>
                        </div>
                        <DynamicProductionStage
                          key={`dynamic-progress-${currentStage}-${order.id}`}
                          orderId={order.id}
                          orderNumber={order.order_number}
                          schoolName={order.schools?.name}
                          stageKey={currentStage}
                          workflows={workflows}
                          cuttingItems={currentCuttingItems}
                          savedStageItems={currentStageItems}
                          currentStage={currentStage}
                          isLocked={isOrderReadOnly}
                          onStageUpdated={(updated) => setCurrentStageItems(updated)}
                          onStageAdvanced={() => router.refresh()}
                          onPrint={() => handlePrintDynamicStage(currentStage)}
                        />
                      </div>
                    )}

                    {currentStage === "checking" && (
                      <div className="pt-2 border-t border-slate-200/80 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-blue-50/70 border border-blue-200 rounded-lg p-3.5">
                          <div className="space-y-0.5">
                            <h5 className="text-xs font-bold text-blue-950 uppercase tracking-wide">
                              Active Stage: Quality Checking Operation
                            </h5>
                            <p className="text-xs text-blue-800">
                              Verify quality against actual physical output from the final dynamic production stage. Enter Passed, Rework, and Reject quantities for every size.
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveTab("checking")}
                            className="text-xs border-blue-300 text-blue-900 hover:bg-blue-100 bg-white shadow-2xs shrink-0 self-start sm:self-center font-medium"
                          >
                            Open Dedicated Tab →
                          </Button>
                        </div>
                        <CheckingProductionStage
                          key={`checking-progress-${order.id}`}
                          orderId={order.id}
                          orderNumber={order.order_number}
                          schoolName={order.schools?.name}
                          workflows={workflows}
                          stageItems={currentStageItems}
                          savedCheckingItems={currentCheckingItems}
                          currentStage={currentStage}
                          isLocked={isOrderReadOnly}
                          onCheckingUpdated={(updated) => setCurrentCheckingItems(updated)}
                          onStageAdvanced={() => router.refresh()}
                          onPrint={handlePrintChecking}
                        />
                      </div>
                    )}

                    {currentStage === "ironing_packing" && (
                      <div className="pt-2 border-t border-slate-200/80 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50/70 border border-amber-200 rounded-lg p-3.5">
                          <div className="space-y-0.5">
                            <h5 className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                              Active Stage: Ironing & Packing Operation
                            </h5>
                            <p className="text-xs text-amber-800">
                              Final production stage. Complete industrial steam pressing and folding/bagging to finish the order.
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveTab("ironing_packing")}
                            className="text-xs border-amber-300 text-amber-900 hover:bg-amber-100 bg-white shadow-2xs shrink-0 self-start sm:self-center font-medium"
                          >
                            Open Dedicated Tab →
                          </Button>
                        </div>
                        <IroningPackingProductionStage
                          key={`ironing-packing-progress-${order.id}`}
                          orderId={order.id}
                          orderNumber={order.order_number}
                          schoolName={order.schools?.name}
                          workflows={workflows}
                          savedCheckingItems={currentCheckingItems}
                          savedIroningPackingItems={currentIroningPackingItems}
                          currentStage={currentStage}
                          isLocked={isOrderReadOnly}
                          onIroningPackingUpdated={(updated) => setCurrentIroningPackingItems(updated)}
                          onWorkflowUpdated={(updated) => setWorkflows(updated)}
                          onStageAdvanced={() => {
                            setWorkflows((prev) =>
                              prev.map((w) =>
                                w.stage_key === "ironing_packing" || w.sequence_order === 8
                                  ? { ...w, ironing_completed_at: w.ironing_completed_at || new Date().toISOString() }
                                  : w
                              )
                            );
                            router.refresh();
                          }}
                          onPrint={(mode) => handlePrintIroningPacking(mode)}
                        />
                      </div>
                    )}

                    {isAwaitingMiddleArrangement && (
                      <div className="pt-2">
                        <div className="p-5 rounded-xl border border-evenvibe-light bg-gradient-to-r from-indigo-50/90 via-white to-purple-50/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="space-y-1.5">
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <CheckCircle2 className="h-3.5 w-3.5 text-evenvibe-primary" />
                              CUTTING COMPLETED ✓
                            </div>
                            <h4 className="text-base font-bold text-slate-900">
                              Production sequence has not been arranged yet.
                            </h4>
                            <p className="text-xs text-slate-600 max-w-xl leading-relaxed">
                              Cutting stage has been completed successfully. Arrange the next 3 production stages (Stitching, Printing, Embroidering) to unlock the manufacturing workflow.
                            </p>
                          </div>
                          <Button
                            onClick={() => setShowSequenceModal(true)}
                            className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white font-semibold shadow-md gap-2 shrink-0 self-start sm:self-center h-10 px-5"
                          >
                            <Shuffle className="h-4 w-4" />
                            Arrange Production Sequence
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {currentStage === "production_completed" && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="space-y-1 text-center sm:text-left">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 mb-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Completed
                      </div>
                      <h4 className="text-base font-bold text-slate-900">
                        Production Successfully Completed
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        All {totalQuantity} units have been manufactured. Order is ready for Quality Check.
                      </p>
                    </div>

                    <Link href={`/admin/quality-check/${order.id}`} className="shrink-0 w-full sm:w-auto">
                      <Button
                        size="lg"
                        className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white shadow gap-2 font-medium px-6 w-full sm:w-auto"
                      >
                        <ClipboardCheck className="h-4 w-4" />
                        Go to Quality Check
                      </Button>
                    </Link>
                  </div>
                )}
              </div>

              {/* Remarks Section */}
              <div className="flex items-start justify-between p-4 rounded-lg border bg-white gap-4">
                <div className="space-y-1 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Production Remarks
                  </p>
                  <p className="text-sm text-slate-800 italic">
                    {productionRecord?.remarks || "No remarks recorded yet."}
                  </p>
                </div>
                {productionRecord && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs shrink-0"
                    onClick={() => {
                      setEditRemarks(productionRecord.remarks || "");
                      setShowRemarksDialog(true);
                    }}
                  >
                    Edit Remarks
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* 2-Column Info Grid: Order Info & Quantity Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Order Info Card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-slate-600" />
                  Order Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm divide-y">
                <div className="flex justify-between pt-1">
                  <span className="text-muted-foreground">Order Number</span>
                  <span className="font-semibold text-slate-900">{order.order_number}</span>
                </div>
                <div className="flex justify-between pt-3">
                  <span className="text-muted-foreground">School</span>
                  <span className="font-medium text-slate-800">{order.schools?.name || "Unknown School"}</span>
                </div>
                <div className="flex justify-between pt-3">
                  <span className="text-muted-foreground">Order Date</span>
                  <span className="text-slate-800">{formatDate(order.created_at)}</span>
                </div>
                <div className="flex justify-between pt-3">
                  <span className="text-muted-foreground">Confirmed Date</span>
                  <span className="text-slate-800">{formatDate(confirmedDate)}</span>
                </div>
                <div className="flex justify-between pt-3">
                  <span className="text-muted-foreground">Production Started</span>
                  <span className="text-slate-800">{formatDate(productionRecord?.started_at || null, true)}</span>
                </div>
                <div className="flex justify-between pt-3">
                  <span className="text-muted-foreground">Production Completed</span>
                  <span className="text-slate-800">{formatDate(productionRecord?.completed_at || null, true)}</span>
                </div>
                <div className="flex justify-between pt-3">
                  <span className="text-muted-foreground">Last Updated</span>
                  <span className="text-slate-800">
                    {formatDate(productionRecord?.updated_at || order.updated_at, true)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Quantity Overview Card */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4 w-4 text-slate-600" />
                  Historical Quantity Overview
                </CardTitle>
                <CardDescription>
                  Snapshot from Requirement #{order.requirements?.requirement_number}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-50 rounded-lg border text-center">
                    <p className="text-xs text-muted-foreground">Total Students</p>
                    <p className="text-xl font-bold text-slate-900 mt-0.5">
                      {totalStudents}
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border text-center">
                    <p className="text-xs text-muted-foreground">Total Items</p>
                    <p className="text-xl font-bold text-slate-900 mt-0.5">
                      {requirementItems.reduce((acc, item) => acc + (item.quantity || 0), 0)}
                    </p>
                  </div>
                  {dynamicItems.map((item) => (
                    <div
                      key={item.itemName}
                      className="p-3 bg-slate-50 rounded-lg border text-center"
                    >
                      <p
                        className="text-xs text-muted-foreground font-medium truncate"
                        title={formatItemName(item.itemName)}
                      >
                        {formatItemName(item.itemName)}
                      </p>
                      <p className="text-lg font-semibold text-slate-800 mt-0.5">
                        {item.studentCount !== null
                          ? `${item.studentCount} ${item.studentCount === 1 ? "student" : "students"}`
                          : "—"}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg flex items-start gap-2 text-xs text-amber-900">
                  <AlertCircle className="h-4 w-4 text-status-warning shrink-0 mt-0.5" />
                  <span>
                    Quantities are locked historical records from order submission. Future student
                    changes will not alter this production batch.
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 2: Quantity Breakdown */}
        <TabsContent value="breakdown" className="mt-6">
          <AdminOrderQuantityBreakdown
            requirementItems={requirementItems}
            orderNumber={order.order_number}
            schoolName={order.schools?.name || "School"}
          />
        </TabsContent>

        {/* Tab 3: Timeline */}
        <TabsContent value="timeline" className="mt-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-5 w-5 text-evenvibe-primary" />
                Production Audit Trail
              </CardTitle>
              <CardDescription>
                Chronological log of manufacturing stage updates, milestones, and remarks.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stageHistory.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  No production events recorded yet.
                </div>
              ) : (
                <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {stageHistory.map((item) => (
                    <div key={item.id} className="relative group">
                      {/* Timeline dot */}
                      <div className="absolute -left-[27px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-status-success shadow-sm" />
                      <div className="p-3.5 rounded-lg border bg-white shadow-xs space-y-1.5">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-slate-900">
                              {formatStageLabel(item.to_stage)}
                            </span>
                            {item.from_stage && item.from_stage !== item.to_stage && (
                              <span className="text-xs text-muted-foreground">
                                (from {formatStageLabel(item.from_stage)})
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground font-mono">
                            {formatDate(item.created_at, true)}
                          </span>
                        </div>
                        {item.note && (
                          <p className="text-xs text-slate-700 bg-slate-50 p-2 rounded border border-slate-100">
                            {item.note}
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground">
                          Updated by: {item.profiles?.full_name || "EvenVibe Admin"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="stock_sizes" className="space-y-6 mt-6">
          <StockSizesBreakdown
            requirementItems={requirementItems}
            totalStudents={totalStudents}
            classStudentCounts={classStudentCounts}
            orderNumber={order.order_number}
            schoolName={order.schools?.name}
          />
        </TabsContent>
        <TabsContent value="inventory" className="space-y-6 mt-6">
          <InventoryMaterialStage
            orderId={order.id}
            orderNumber={order.order_number}
            schoolName={order.schools?.name}
            requirementItems={requirementItems}
            savedMaterials={currentInventoryMaterials}
            currentStage={currentStage}
            isLocked={isWorkflowLocked}
            onStageAdvanced={() => {
              setProductionRecord((prev) =>
                prev ? { ...prev, stage: "cutting", updated_at: new Date().toISOString() } : prev
              );
              setWorkflows((prev) =>
                prev.map((w) => {
                  if (w.sequence_order <= 2) return { ...w, status: "completed", completed_at: w.completed_at || new Date().toISOString() };
                  if (w.sequence_order === 3) return { ...w, status: "in_progress", started_at: new Date().toISOString() };
                  return w;
                })
              );
              setActiveTab("cutting");
              router.refresh();
            }}
            onCalculationResultChange={setLiveCalculationResult}
          />
        </TabsContent>
        <TabsContent value="cutting" className="space-y-6 mt-6">
          <CuttingStage
            key={`cutting-tab-${order.id}`}
            orderId={order.id}
            orderNumber={order.order_number}
            schoolName={order.schools?.name}
            requirementItems={requirementItems}
            savedCuttingItems={currentCuttingItems}
            currentStage={currentStage}
            isLocked={isOrderReadOnly}
            isCuttingCompleted={isCuttingCompleted}
            isAwaitingSequence={isAwaitingMiddleArrangement}
            orderStudents={orderStudents}
            totalStudents={totalStudents}
            onCuttingUpdated={(updated) => setCurrentCuttingItems(updated)}
            onCuttingCompleted={(updatedWorkflows) => {
              if (updatedWorkflows) {
                setWorkflows(updatedWorkflows);
              } else {
                setWorkflows((prev) =>
                  prev.map((w) =>
                    w.stage_key === "cutting"
                      ? { ...w, status: "completed", completed_at: new Date().toISOString() }
                      : w
                  )
                );
              }
              setShowSequenceModal(true);
            }}
            onOpenSequenceModal={() => setShowSequenceModal(true)}
            onStageAdvanced={() => {
              setWorkflows((prev) =>
                prev.map((w) => {
                  if (w.sequence_order <= 3) return { ...w, status: "completed", completed_at: w.completed_at || new Date().toISOString() };
                  return w;
                })
              );
              router.refresh();
            }}
            onCalculationResultChange={setLiveCuttingResult}
            onPrint={handlePrintCutting}
          />
        </TabsContent>
        {middleWorkflows.map((mw) => (
          <TabsContent key={mw.stage_key} value={mw.stage_key} className="space-y-6 mt-6">
            <DynamicProductionStage
              key={`dynamic-tab-${mw.stage_key}-${order.id}`}
              orderId={order.id}
              orderNumber={order.order_number}
              schoolName={order.schools?.name}
              stageKey={mw.stage_key}
              workflows={workflows}
              cuttingItems={currentCuttingItems}
              savedStageItems={currentStageItems}
              currentStage={currentStage}
              isLocked={isOrderReadOnly}
              onStageUpdated={(updated) => setCurrentStageItems(updated)}
              onStageAdvanced={() => router.refresh()}
              onPrint={() => handlePrintDynamicStage(mw.stage_key)}
            />
          </TabsContent>
        ))}
        <TabsContent value="checking" className="space-y-6 mt-6">
          <CheckingProductionStage
            key={`checking-tab-${order.id}`}
            orderId={order.id}
            orderNumber={order.order_number}
            schoolName={order.schools?.name}
            workflows={workflows}
            stageItems={currentStageItems}
            savedCheckingItems={currentCheckingItems}
            currentStage={currentStage}
            isLocked={isOrderReadOnly}
            onCheckingUpdated={(updated) => setCurrentCheckingItems(updated)}
            onStageAdvanced={() => router.refresh()}
            onPrint={handlePrintChecking}
          />
        </TabsContent>
        <TabsContent value="ironing_packing" className="space-y-6 mt-6">
          <IroningPackingProductionStage
            key={`ironing-packing-tab-${order.id}`}
            orderId={order.id}
            orderNumber={order.order_number}
            schoolName={order.schools?.name}
            workflows={workflows}
            savedCheckingItems={currentCheckingItems}
            savedIroningPackingItems={currentIroningPackingItems}
            currentStage={currentStage}
            isLocked={isOrderReadOnly}
            onIroningPackingUpdated={(updated) => setCurrentIroningPackingItems(updated)}
            onWorkflowUpdated={(updated) => setWorkflows(updated)}
            onStageAdvanced={() => {
              setWorkflows((prev) =>
                prev.map((w) =>
                  w.stage_key === "ironing_packing" || w.sequence_order === 8
                    ? { ...w, ironing_completed_at: w.ironing_completed_at || new Date().toISOString() }
                    : w
                )
              );
              router.refresh();
            }}
            onPrint={(mode) => handlePrintIroningPacking(mode)}
          />
        </TabsContent>
        <TabsContent value="workflow" className="space-y-6 mt-6">
          <OrderWorkflowConfigurator
            orderId={order.id}
            initialWorkflows={workflows}
            isLocked={!!isWorkflowLocked}
            orderNumber={order.order_number}
            onWorkflowUpdated={(updated) => setWorkflows(updated)}
          />
        </TabsContent>
      </Tabs>

      {/* Dialog 1: Start Production Dialog */}
      <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Play className="h-5 w-5 text-evenvibe-primary" />
              Start Production
            </DialogTitle>
            <DialogDescription>
              Initiate manufacturing for Order #{order.order_number}. This will transition the
              order lifecycle to Production and lock in the historical batch quantity ({totalQuantity} items).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="startRemarks">Initial Remarks (Optional)</Label>
              <Textarea
                id="startRemarks"
                placeholder="e.g., Fabric sourced, sent to cutting department..."
                value={startRemarks}
                onChange={(e) => setStartRemarks(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowStartDialog(false)}
              disabled={isStarting}
            >
              Cancel
            </Button>
            <Button
              className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white"
              onClick={handleStartProduction}
              disabled={isStarting}
            >
              {isStarting ? "Starting..." : "Confirm & Start Production"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 2: Advance Stage Dialog */}
      <Dialog open={showAdvanceDialog} onOpenChange={setShowAdvanceDialog}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <ArrowRight className="h-5 w-5 text-evenvibe-primary" />
              {nextStageActionText}
            </DialogTitle>
            <DialogDescription>
              Move manufacturing progress from{" "}
              <strong>{formatStageLabel(currentStage)}</strong> to{" "}
              <strong>{nextStageKey ? formatStageLabel(nextStageKey) : ""}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="advanceNote">Stage Note / Remarks (Optional)</Label>
              <Textarea
                id="advanceNote"
                placeholder="e.g., Cutting verified by team lead..."
                value={advanceNote}
                onChange={(e) => setAdvanceNote(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowAdvanceDialog(false)}
              disabled={isAdvancing}
            >
              Cancel
            </Button>
            <Button
              className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white"
              onClick={handleAdvanceStage}
              disabled={isAdvancing}
            >
              {isAdvancing ? "Updating..." : "Advance Stage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 3: Update Progress / Completed Quantity Dialog */}
      <Dialog open={showQtyDialog} onOpenChange={setShowQtyDialog}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Edit3 className="h-5 w-5 text-evenvibe-primary" />
              Update Production Progress
            </DialogTitle>
            <DialogDescription>
              Record completed items manufactured so far. Total required: {totalQuantity} items.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="completedQty">Completed Quantity (0 to {totalQuantity})</Label>
              <Input
                id="completedQty"
                type="number"
                min="0"
                max={totalQuantity}
                value={editCompletedQty}
                onChange={(e) => setEditCompletedQty(parseInt(e.target.value) || 0)}
              />
              <div className="flex justify-between text-xs text-muted-foreground pt-1">
                <span>
                  Pending:{" "}
                  <strong>{Math.max(0, totalQuantity - editCompletedQty)}</strong> items
                </span>
                <span>
                  Progress:{" "}
                  <strong>
                    {totalQuantity > 0 ? Math.round((editCompletedQty / totalQuantity) * 100) : 0}%
                  </strong>
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="qtyNote">Progress Note (Optional)</Label>
              <Input
                id="qtyNote"
                placeholder="e.g., Batch 1 of shirts stitched..."
                value={qtyNote}
                onChange={(e) => setQtyNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowQtyDialog(false)}
              disabled={isUpdatingQty}
            >
              Cancel
            </Button>
            <Button
              className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white"
              onClick={handleSaveQuantity}
              disabled={isUpdatingQty}
            >
              {isUpdatingQty ? "Saving..." : "Save Progress"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 4: Edit Remarks Dialog */}
      <Dialog open={showRemarksDialog} onOpenChange={setShowRemarksDialog}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-slate-900">Edit Production Remarks</DialogTitle>
            <DialogDescription>
              Update internal operational notes for this production order.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="remarksInput">Remarks</Label>
              <Textarea
                id="remarksInput"
                placeholder="Enter internal manufacturing remarks..."
                value={editRemarks}
                onChange={(e) => setEditRemarks(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowRemarksDialog(false)}
              disabled={isUpdatingRemarks}
            >
              Cancel
            </Button>
            <Button
              className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white"
              onClick={handleSaveRemarks}
              disabled={isUpdatingRemarks}
            >
              {isUpdatingRemarks ? "Saving..." : "Save Remarks"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Production Sequence Arrangement Modal (Post-Cutting Completion) */}
      <ProductionSequenceModal
        isOpen={showSequenceModal}
        onClose={() => setShowSequenceModal(false)}
        orderId={order.id}
        orderNumber={order.order_number}
        schoolName={order.schools?.name}
        initialMiddleStages={
          middleWorkflows.length === 3
            ? (middleWorkflows.map((mw) => mw.stage_key) as ProductionStageKey[])
            : ["stitching", "printing", "embroidering"]
        }
        onSequenceSaved={(newWorkflows, firstStageKey) => {
          setWorkflows(newWorkflows);
          setProductionRecord((prev) =>
            prev ? { ...prev, stage: firstStageKey, updated_at: new Date().toISOString() } : prev
          );
          setActiveTab(firstStageKey);
          router.refresh();
        }}
      />
      </div>
    </div>
  );
}
