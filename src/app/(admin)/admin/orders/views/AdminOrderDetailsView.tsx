"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminOrderQuantityBreakdown, { ReqItem } from "./AdminOrderQuantityBreakdown";
import { toast } from "sonner";
import { ArrowLeft, Clock, History, Truck, PackageCheck, Pencil, AlertCircle, Factory, ClipboardCheck } from "lucide-react";
import { updateOrderStatus, modifyOrderQuantity, cancelOrder } from "../actions";

export interface AdminOrderDetailsData {
  id: string;
  order_number: string;
  status: string;
  requirement_id: string;
  school_id: string;
  created_at: string;
  updated_at: string;
  courier_name?: string | null;
  tracking_number?: string | null;
  shipped_at?: string | null;
  estimated_delivery?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  schools?: {
    id: string;
    name: string;
  } | null;
  requirements?: {
    requirement_number: string;
    total_students: number;
    regular_uniform_students?: number | null;
    tshirt_uniform_students?: number | null;
  } | null;
}

export interface OrderStatusHistoryItem {
  id: string;
  order_id: string;
  status: string;
  note: string | null;
  created_at: string;
}

export interface OrderModificationHistoryItem {
  id: string;
  order_id: string;
  old_quantity: number;
  new_quantity: number;
  reason?: string | null;
  created_at: string;
  requirement_items: {
    gender: string | null;
    item_name: string;
    class_name?: string | null;
    section_name?: string | null;
    size: string;
  };
  changed_by_profile?: {
    id: string;
    role: string;
  } | null;
}

export type OrderTimelineEvent = OrderStatusHistoryItem | OrderModificationHistoryItem;

const formatDate = (dateString: string, includeTime = false) => {
  const d = new Date(dateString);
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  if (includeTime) {
    options.hour = "2-digit";
    options.minute = "2-digit";
  }
  return d.toLocaleDateString("en-US", options);
};

const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  submitted: ["under_review"],
  under_review: ["confirmed"],
  confirmed: ["production"],
  production: ["quality_check"],
  quality_check: ["packed"],
  packed: ["dispatched"],
  dispatched: ["in_transit"],
  in_transit: ["delivered"],
  delivered: [],
};

const formatStatus = (s: string) => s.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

const getStatusColor = (s: string) => {
  switch (s) {
    case "submitted": return "bg-blue-100 text-blue-800 border-blue-200";
    case "under_review": return "bg-amber-100 text-amber-800 border-amber-200";
    case "confirmed": return "bg-indigo-100 text-indigo-800 border-indigo-200";
    case "production": return "bg-purple-100 text-purple-800 border-purple-200";
    case "quality_check": return "bg-pink-100 text-pink-800 border-pink-200";
    case "packed": return "bg-orange-100 text-orange-800 border-orange-200";
    case "dispatched": return "bg-cyan-100 text-cyan-800 border-cyan-200";
    case "in_transit": return "bg-teal-100 text-teal-800 border-teal-200";
    case "delivered": return "bg-emerald-100 text-emerald-800 border-emerald-200";
    default: return "bg-slate-100 text-slate-800";
  }
};

import { useRealtimeSubscription } from "@/lib/supabase/useRealtime";

export default function AdminOrderDetailsView({
  order: initialOrder,
  requirementItems,
  statusHistory: initialStatusHistory,
  modificationHistory,
}: {
  order: AdminOrderDetailsData;
  requirementItems: ReqItem[];
  statusHistory: OrderStatusHistoryItem[];
  modificationHistory: OrderModificationHistoryItem[];
}) {
  const router = useRouter();
  const [order, setOrder] = useState<AdminOrderDetailsData>(initialOrder);
  const [statusHistory, setStatusHistory] = useState<OrderStatusHistoryItem[]>(initialStatusHistory);

  useRealtimeSubscription({
    table: "orders",
    filter: `id=eq.${initialOrder.id}`,
    onEvent: (payload) => {
      if (payload.eventType === "UPDATE" && payload.new) {
        const updated = payload.new as Record<string, unknown>;
        const newStatus = (updated.status as string) || initialOrder.status;
        setOrder((prev) => ({
          ...prev,
          status: newStatus,
          courier_name: (updated.courier_name as string | null) ?? prev.courier_name,
          tracking_number: (updated.tracking_number as string | null) ?? prev.tracking_number,
          estimated_delivery: (updated.estimated_delivery as string | null) ?? prev.estimated_delivery,
          shipped_at: (updated.shipped_at as string | null) ?? prev.shipped_at,
          delivered_at: (updated.delivered_at as string | null) ?? prev.delivered_at,
          cancelled_at: (updated.cancelled_at as string | null) ?? prev.cancelled_at,
          cancel_reason: (updated.cancel_reason as string | null) ?? prev.cancel_reason,
        }));
        toast.info(`Order status updated to ${formatStatus(newStatus)}`);
      }
    },
  });

  useRealtimeSubscription({
    table: "order_status_history",
    filter: `order_id=eq.${initialOrder.id}`,
    event: "INSERT",
    onEvent: (payload) => {
      if (payload.new) {
        const newHist = payload.new as unknown as OrderStatusHistoryItem;
        setStatusHistory((prev) => [newHist, ...prev.filter((h) => h.id !== newHist.id)]);
      }
    },
  });
  
  // Status Update State
  const [nextStatus, setNextStatus] = useState<string>("");
  const [statusNote, setStatusNote] = useState("");
  const [courierName, setCourierName] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [estimatedDelivery, setEstimatedDelivery] = useState("");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Quantity Edit State
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState<number>(0);
  const [isSavingQuantity, setIsSavingQuantity] = useState(false);

  // Cancellation State
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  const allowedTransitions = VALID_STATUS_TRANSITIONS[order.status] || [];
  const canModifyQuantity = order.status === "submitted" || order.status === "under_review";
  const canCancelOrder = ["submitted", "under_review", "confirmed"].includes(order.status);

  const handleCancelOrder = async () => {
    setIsCancelling(true);
    const result = await cancelOrder(order.id, cancelReason);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Order cancelled successfully.");
      setShowCancelForm(false);
      router.refresh();
    }
    setIsCancelling(false);
  };

  const handleUpdateStatus = async () => {
    if (!nextStatus) {
      toast.error("Please select a status");
      return;
    }
    if (nextStatus === "dispatched" && (!courierName || !trackingNumber)) {
      toast.error("Courier name and tracking number are required for dispatching");
      return;
    }

    setIsUpdatingStatus(true);
    const result = await updateOrderStatus(order.id, nextStatus, statusNote, {
      courierName,
      trackingNumber,
      estimatedDelivery,
    });

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Order status updated");
      setNextStatus("");
      setStatusNote("");
      router.refresh();
    }
    setIsUpdatingStatus(false);
  };

  const handleEditClick = (item: ReqItem) => {
    setEditingItemId(item.id);
    setEditQuantity(item.quantity);
  };

  const handleSaveQuantity = async (itemId: string) => {
    if (editQuantity < 0 || !Number.isInteger(editQuantity)) {
      toast.error("Invalid quantity");
      return;
    }
    
    setIsSavingQuantity(true);
    const result = await modifyOrderQuantity(order.id, itemId, editQuantity);
    
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Quantity updated");
      setEditingItemId(null);
      router.refresh();
    }
    setIsSavingQuantity(false);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => router.push("/admin/orders")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Order #{order.order_number}</h1>
            <p className="text-sm text-muted-foreground">
              {order.schools?.name}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {(order.status === "confirmed" || order.status === "production") && (
              <Button 
                variant="outline" 
                className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-1.5"
                onClick={() => router.push(`/admin/production/${order.id}`)}
              >
                <Factory className="h-4 w-4" />
                View Production
              </Button>
            )}
            {["quality_check", "packed", "dispatched", "in_transit", "delivered"].includes(order.status) && (
              <Button 
                variant="outline" 
                className="text-emerald-700 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800 flex items-center gap-1.5"
                onClick={() => router.push(`/admin/quality-check/${order.id}`)}
              >
                <ClipboardCheck className="h-4 w-4" />
                View Quality Check
              </Button>
            )}
            {canCancelOrder && (
              <Button 
                variant="outline" 
                className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                onClick={() => setShowCancelForm(!showCancelForm)}
              >
                Cancel Order
              </Button>
            )}
            <Badge variant="outline" className={`px-3 py-1 text-sm ${getStatusColor(order.status)}`}>
              {formatStatus(order.status)}
            </Badge>
          </div>
        </div>

        {showCancelForm && (
          <Card className="border-red-200 bg-red-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-red-800 text-lg flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Cancel this order?
              </CardTitle>
              <CardDescription className="text-red-700">
                This order will be cancelled and kept in your order history.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="cancelReason" className="text-red-900">Reason</Label>
                  <Textarea 
                    id="cancelReason" 
                    placeholder="Enter reason for cancellation..." 
                    className="bg-white border-red-200"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-end gap-3">
                  <Button variant="outline" onClick={() => setShowCancelForm(false)} disabled={isCancelling}>
                    Keep Order
                  </Button>
                  <Button variant="destructive" onClick={handleCancelOrder} disabled={isCancelling}>
                    {isCancelling ? "Cancelling..." : "Cancel Order"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Main Content: Items and History */}
        <div className="md:col-span-2 space-y-6">
          <Tabs defaultValue="breakdown" className="w-full">
            <TabsList className="w-full justify-start border-b rounded-none px-0 h-auto pb-1 bg-transparent space-x-6">
              <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2 px-1">Overview</TabsTrigger>
              <TabsTrigger value="breakdown" className="rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2 px-1">Quantity Breakdown</TabsTrigger>
              <TabsTrigger value="timeline" className="rounded-none border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none py-2 px-1">Status Timeline</TabsTrigger>
            </TabsList>
            
            <TabsContent value="overview" className="mt-6">
              <Card>
            <CardHeader>
              <CardTitle>Requirement Items</CardTitle>
              <CardDescription>
                Requirement: {order.requirements?.requirement_number}
                {!canModifyQuantity && " (Modifications disabled after confirmation)"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Gender/Uniform</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      {canModifyQuantity && <TableHead className="w-[100px]"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requirementItems.map((item: ReqItem) => (
                      <TableRow key={item.id}>
                        <TableCell className="capitalize">{item.gender || "Unknown"}</TableCell>
                        <TableCell className="capitalize">{item.item_name}</TableCell>
                        <TableCell>{item.size}</TableCell>
                        <TableCell className="text-right font-medium">
                          {editingItemId === item.id ? (
                            <Input 
                              type="number" 
                              min="0"
                              value={editQuantity} 
                              onChange={e => setEditQuantity(parseInt(e.target.value) || 0)}
                              className="w-20 text-right ml-auto h-8"
                            />
                          ) : (
                            item.quantity
                          )}
                        </TableCell>
                        {canModifyQuantity && (
                          <TableCell>
                            {editingItemId === item.id ? (
                              <div className="flex gap-2">
                                <Button size="sm" variant="default" onClick={() => handleSaveQuantity(item.id)} disabled={isSavingQuantity}>
                                  Save
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setEditingItemId(null)} disabled={isSavingQuantity}>
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <Button size="icon" variant="ghost" onClick={() => handleEditClick(item)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                    <TableRow className="bg-slate-50">
                      <TableCell colSpan={3} className="font-semibold text-right">Total Quantity</TableCell>
                      <TableCell className="text-right font-bold text-lg">
                        {requirementItems.reduce((acc: number, item: ReqItem) => acc + item.quantity, 0)}
                      </TableCell>
                      {canModifyQuantity && <TableCell></TableCell>}
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          </TabsContent>

          <TabsContent value="breakdown" className="mt-6">
            <AdminOrderQuantityBreakdown 
              requirementItems={requirementItems}
              orderNumber={order.order_number}
              schoolName={order.schools?.name || 'School'}
            />
          </TabsContent>

          <TabsContent value="timeline" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
                {([...statusHistory, ...modificationHistory] as OrderTimelineEvent[])
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .map((evt, i: number) => {
                    const isStatus = 'status' in evt;
                    return (
                      <div key={i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-200 group-[.is-active]:bg-emerald-500 text-emerald-50 group-[.is-active]:text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                          {isStatus ? <PackageCheck className="h-5 w-5" /> : <Pencil className="h-4 w-4" />}
                        </div>
                        <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-slate-200 shadow-sm bg-white">
                          <div className="flex items-center justify-between space-x-2 mb-1">
                            <div className="font-bold text-slate-900">
                              {isStatus ? formatStatus(evt.status) : "Quantity Modified"}
                            </div>
                            <time className="font-caveat font-medium text-indigo-500">
                              {formatDate(evt.created_at, true)}
                            </time>
                          </div>
                          <div className="text-slate-500 text-sm">
                            {isStatus ? (
                              evt.note || "No notes."
                            ) : (
                              <>
                                Changed <span className="font-semibold capitalize">{evt.requirement_items?.gender || "Unknown"} {evt.requirement_items?.item_name} ({evt.requirement_items?.size})</span> quantity from <span className="line-through">{evt.old_quantity}</span> to <span className="font-bold">{evt.new_quantity}</span>.
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
          </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar: Status Update & Details */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Update Status</CardTitle>
            </CardHeader>
            <CardContent>
              {allowedTransitions.length > 0 ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Next Status</Label>
                    <Select value={nextStatus} onValueChange={(val) => { if(val) setNextStatus(val); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {allowedTransitions.map((status: string) => (
                          <SelectItem key={status} value={status}>
                            {formatStatus(status)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {nextStatus === "dispatched" && (
                    <div className="space-y-4 bg-slate-50 p-4 rounded-md border">
                      <div className="space-y-2">
                        <Label>Courier Name</Label>
                        <Input value={courierName} onChange={e => setCourierName(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Tracking Number</Label>
                        <Input value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Estimated Delivery (YYYY-MM-DD)</Label>
                        <Input type="date" value={estimatedDelivery} onChange={e => setEstimatedDelivery(e.target.value)} />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Note (Optional)</Label>
                    <Textarea 
                      placeholder="Add an internal note..." 
                      value={statusNote}
                      onChange={e => setStatusNote(e.target.value)}
                    />
                  </div>

                  <Button className="w-full" onClick={handleUpdateStatus} disabled={!nextStatus || isUpdatingStatus}>
                    {isUpdatingStatus ? "Updating..." : "Update Status"}
                  </Button>
                </div>
              ) : (
                <div className="text-center p-4 bg-slate-50 rounded-md">
                  <p className="text-sm text-muted-foreground">Order has reached final status.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Order Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground flex items-center gap-2"><Clock className="h-4 w-4" /> Submitted</span>
                <span className="font-medium">{formatDate(order.created_at)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground flex items-center gap-2"><Clock className="h-4 w-4" /> Last Updated</span>
                <span className="font-medium">{formatDate(order.updated_at, true)}</span>
              </div>
              
              {order.courier_name && (
                <div className="space-y-2 pt-2">
                  <h4 className="font-semibold flex items-center gap-2"><Truck className="h-4 w-4" /> Shipping Details</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="text-muted-foreground">Courier</div>
                    <div className="font-medium text-right">{order.courier_name}</div>
                    <div className="text-muted-foreground">Tracking No.</div>
                    <div className="font-medium text-right">{order.tracking_number}</div>
                    <div className="text-muted-foreground">Shipped</div>
                    <div className="font-medium text-right">{order.shipped_at ? formatDate(order.shipped_at) : "-"}</div>
                    <div className="text-muted-foreground">Est. Delivery</div>
                    <div className="font-medium text-right">{order.estimated_delivery ? formatDate(order.estimated_delivery) : "-"}</div>
                    {order.delivered_at && (
                      <>
                        <div className="text-muted-foreground">Delivered</div>
                        <div className="font-medium text-right">{formatDate(order.delivered_at, true)}</div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
