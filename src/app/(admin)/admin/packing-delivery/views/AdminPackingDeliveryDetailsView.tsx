"use client";

import { useState, useMemo, useRef } from "react";
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
import { MobileCard, MobileCardField } from "@/components/ui/mobile-card";
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
} from "../actions";

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
}

export default function AdminPackingDeliveryDetailsView({
  order,
  qcRecord,
  deliveryItems,
  packingRecord,
  packingHistory,
  orderStatusHistory,
  proofImages = [],
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

  // Section 3: Authoritative QC Completion Rule
  const isQcCompleted = qcRecord?.status === "completed" || qcRecord?.status === "passed";

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

  const deliveredQuantity = isDelivered ? totalApprovedQuantity : 0;
  const pendingQuantity = Math.max(0, totalApprovedQuantity - deliveredQuantity);
  const deliveryProgressPercent =
    totalApprovedQuantity > 0 ? Math.round((deliveredQuantity / totalApprovedQuantity) * 100) : 0;

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

  // Modal states
  const [showStartModal, setShowStartModal] = useState(false);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [showDeliveredModal, setShowDeliveredModal] = useState(false);
  const [startRemarks, setStartRemarks] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  // Loading states
  const [isStarting, setIsStarting] = useState(false);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [isMarkingDelivered, setIsMarkingDelivered] = useState(false);

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

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="hidden sm:inline-flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            Print Note
          </Button>

          {deliveryItems.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5"
            >
              <Download className="w-4 h-4 text-slate-500" />
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
            <Button
              onClick={() => setShowDeliveredModal(true)}
              className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white font-medium gap-2 shadow-sm"
            >
              <CheckCircle2 className="w-4 h-4" />
              Mark as Delivered
            </Button>
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

      {/* Section 10: Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
        {/* Card 1: Approved Quantity */}
        <Card className="border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 transition-all hover:shadow-md hover:border-emerald-200">
          <CardHeader className="p-5 pb-3">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs uppercase font-bold text-slate-500 tracking-wider">
                Approved Quantity
              </CardDescription>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-evenvibe-primary dark:text-emerald-400" />
              </div>
            </div>
            <CardTitle className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-2">
              {totalApprovedQuantity}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 border-t border-slate-50 dark:border-slate-800/50 pt-3 mt-1">
              QC Passed physical units
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Items */}
        <Card className="border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 transition-all hover:shadow-md hover:border-slate-300">
          <CardHeader className="p-5 pb-3">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs uppercase font-bold text-slate-500 tracking-wider">
                Items
              </CardDescription>
              <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <Package className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              </div>
            </div>
            <CardTitle className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-2">
              {deliveryItems.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 border-t border-slate-50 dark:border-slate-800/50 pt-3 mt-1">
              Approved style/size rows
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Delivered */}
        <Card className="border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 transition-all hover:shadow-md hover:border-emerald-200">
          <CardHeader className="p-5 pb-3">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs uppercase font-bold text-slate-500 tracking-wider">
                Delivered
              </CardDescription>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg">
                <Truck className="w-4 h-4 text-evenvibe-primary dark:text-emerald-400" />
              </div>
            </div>
            <CardTitle className="text-2xl font-black text-evenvibe-primary dark:text-emerald-400 mt-2">
              {deliveredQuantity}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 border-t border-slate-50 dark:border-slate-800/50 pt-3 mt-1">
              {isDelivered ? "100% completed" : "Pending arrival"}
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Pending Delivery */}
        <Card className="border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 transition-all hover:shadow-md hover:border-amber-200">
          <CardHeader className="p-5 pb-3">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs uppercase font-bold text-slate-500 tracking-wider">
                Pending Delivery
              </CardDescription>
              <div className="p-2 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                <AlertCircle className="w-4 h-4 text-status-warning dark:text-amber-400" />
              </div>
            </div>
            <CardTitle className="text-2xl font-black text-status-warning dark:text-amber-400 mt-2">
              {pendingQuantity}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 border-t border-slate-50 dark:border-slate-800/50 pt-3 mt-1">
              Units in delivery pipeline
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Delivery Progress Bar */}
      {totalApprovedQuantity > 0 && (
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900 p-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-slate-600 dark:text-slate-300">
                Delivery Progress: <strong>{deliveredQuantity}</strong> / {totalApprovedQuantity} units
              </span>
              <span className="text-evenvibe-primary font-bold">{deliveryProgressPercent}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-evenvibe-primary transition-all duration-300"
                style={{ width: `${deliveryProgressPercent}%` }}
              />
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Delivery Items Table */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
            <CardHeader className="p-5 md:p-6 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Package className="w-5 h-5 text-evenvibe-primary" />
                    Delivery Items
                  </CardTitle>
                  <CardDescription className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    Approved quantities ready for delivery.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="border-slate-200 text-slate-600 text-xs py-1">
                  {deliveryItems.length} {deliveryItems.length === 1 ? "Row" : "Rows"}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {deliveryItems.length === 0 ? (
                <div className="p-12 text-center space-y-3">
                  <Package className="w-12 h-12 text-slate-400 mx-auto" />
                  <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
                    No approved pieces are available for delivery.
                  </h3>
                  <p className="text-sm text-slate-500 max-w-md mx-auto">
                    Approved delivery items come strictly from QC Passed physical quantities.
                    Please ensure Quality Check has been completed with passed items.
                  </p>
                </div>
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider bg-slate-50/60 dark:bg-slate-900/60">
                          <th className="py-3 px-4">Style</th>
                          <th className="py-3 px-4">Item</th>
                          <th className="py-3 px-4">Color</th>
                          <th className="py-3 px-4 text-center">Size</th>
                          <th className="py-3 px-4 text-center">Quantity</th>
                          <th className="py-3 px-4 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {deliveryItems.map((item) => (
                          <tr
                            key={item.id}
                            className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                          >
                            <td className="py-3.5 px-4 font-semibold text-slate-800 dark:text-slate-200">
                              {item.styleName}
                            </td>
                            <td className="py-3.5 px-4 font-medium text-slate-700 dark:text-slate-300">
                              {item.itemName}
                            </td>
                            <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                              {item.color}
                            </td>
                            <td className="py-3.5 px-4 text-center font-bold text-slate-800 dark:text-slate-200">
                              Size {item.size}
                            </td>
                            <td className="py-3.5 px-4 text-center font-bold text-evenvibe-deep dark:text-emerald-400">
                              <span className="bg-evenvibe-light dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800 px-3 py-1 rounded-md">
                                {item.quantity}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              {item.status === "delivered" ? (
                                <Badge className="bg-evenvibe-primary text-white font-medium border-0 px-2.5 py-0.5 text-xs">
                                  Delivered
                                </Badge>
                              ) : item.status === "dispatched" ? (
                                <Badge className="bg-evenvibe-primary text-white font-medium border-0 px-2.5 py-0.5 text-xs">
                                  Dispatched
                                </Badge>
                              ) : item.status === "in_progress" ? (
                                <Badge className="bg-evenvibe-primary text-white font-medium border-0 px-2.5 py-0.5 text-xs">
                                  In Progress
                                </Badge>
                              ) : (
                                <Badge className="bg-slate-100 text-slate-700 font-medium px-2.5 py-0.5 text-xs">
                                  Ready
                                </Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="md:hidden space-y-3">
                    {deliveryItems.map((item) => (
                      <MobileCard key={item.id}>
                        <MobileCardField label="Style">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{item.styleName}</span>
                        </MobileCardField>
                        <MobileCardField label="Item">
                          <span className="font-medium text-slate-700 dark:text-slate-300">{item.itemName}</span>
                        </MobileCardField>
                        <MobileCardField label="Color">
                          <span className="text-slate-600 dark:text-slate-400">{item.color}</span>
                        </MobileCardField>
                        <MobileCardField label="Size">
                          <span className="font-bold text-slate-800 dark:text-slate-200">Size {item.size}</span>
                        </MobileCardField>
                        <MobileCardField label="Quantity">
                          <span className="inline-block bg-evenvibe-light dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800 px-2.5 py-0.5 rounded-md font-bold text-evenvibe-deep dark:text-emerald-400">
                            {item.quantity}
                          </span>
                        </MobileCardField>
                        <MobileCardField label="Status">
                          {item.status === "delivered" ? (
                            <Badge className="bg-evenvibe-primary text-white font-medium border-0 px-2.5 py-0.5 text-xs">
                              Delivered
                            </Badge>
                          ) : item.status === "dispatched" ? (
                            <Badge className="bg-evenvibe-primary text-white font-medium border-0 px-2.5 py-0.5 text-xs">
                              Dispatched
                            </Badge>
                          ) : item.status === "in_progress" ? (
                            <Badge className="bg-evenvibe-primary text-white font-medium border-0 px-2.5 py-0.5 text-xs">
                              In Progress
                            </Badge>
                          ) : (
                            <Badge className="bg-slate-100 text-slate-700 font-medium px-2.5 py-0.5 text-xs">
                              Ready
                            </Badge>
                          )}
                        </MobileCardField>
                      </MobileCard>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
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
    </div>
  );
}
