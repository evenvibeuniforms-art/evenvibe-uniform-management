"use client";

import React, { useState, useEffect } from "react";
import { useRealtimeSubscription } from "@/lib/supabase/useRealtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Scissors,
  Clock,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Search,
  Eye,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Download,
  Lock,
  User,
  Package,
} from "lucide-react";
import { NewAlterationDialog } from "./NewAlterationDialog";
import { AlterationDetailsDialog } from "./AlterationDetailsDialog";
import { MobileCard, MobileCardField, MobileCardActions } from "@/components/ui/mobile-card";
import {
  getSchoolAlterationsSummary,
  getSchoolAlterationsList,
  getDeliveredOrdersForSchool,
  getDeliveredStudentsForOrder,
  getDeliveredStudentItems,
  exportSchoolAlterationsToExcel,
  AlterationsSummaryData,
  AlterationListItem,
  DeliveredStudent,
  DeliveredStudentItem,
} from "./actions";
import { ALTERATION_REASONS } from "./schema";
import { toast } from "sonner";

interface DeliveredOrder {
  id: string;
  order_number: string;
  created_at: string;
  delivered_at: string | null;
  requirement_id: string | null;
  status: string;
}

export default function AlterationsPage() {
  const [summary, setSummary] = useState<AlterationsSummaryData>({
    total: 0,
    requested: 0,
    under_review: 0,
    approved_rework: 0,
    completed: 0,
    rejected: 0,
  });
  const [loadingSummary, setLoadingSummary] = useState(true);

  // Delivered Orders for interactive workflow
  const [deliveredOrders, setDeliveredOrders] = useState<DeliveredOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");

  // Delivered Students Workflow
  const [classes, setClasses] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>("all");
  const [deliveredStudents, setDeliveredStudents] = useState<DeliveredStudent[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<DeliveredStudent | null>(null);

  // Delivered Items for selected student
  const [studentItems, setStudentItems] = useState<DeliveredStudentItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // List state
  const [alterations, setAlterations] = useState<AlterationListItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Filter & Search states
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<
    "all" | "today" | "last_7_days" | "last_30_days" | "this_month"
  >("all");

  // Details dialog
  const [selectedAlterationId, setSelectedAlterationId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Load summary
  const loadSummary = () => {
    setLoadingSummary(true);
    getSchoolAlterationsSummary().then((res) => {
      if (res.success) {
        setSummary(res.summary);
      }
      setLoadingSummary(false);
    });
  };

  // Load list
  const loadList = () => {
    setLoadingList(true);
    getSchoolAlterationsList({
      page,
      pageSize: 10,
      search: debouncedSearch,
      status: statusFilter,
      reason: reasonFilter,
      dateRange: dateFilter,
    }).then((res) => {
      if (res.success) {
        setAlterations(res.alterations);
        setTotalPages(res.totalPages);
        setTotalCount(res.totalCount);
      }
      setLoadingList(false);
    });
  };

  // Load Delivered Orders
  const loadDeliveredOrders = () => {
    setLoadingOrders(true);
    getDeliveredOrdersForSchool().then((res) => {
      setLoadingOrders(false);
      if (res.success) {
        setDeliveredOrders(res.orders);
      }
    });
  };

  useEffect(() => {
    let ignore = false;
    Promise.resolve().then(() => {
      if (!ignore) {
        setLoadingSummary(true);
        setLoadingOrders(true);
      }
      return Promise.all([
        getSchoolAlterationsSummary(),
        getDeliveredOrdersForSchool(),
      ]);
    }).then(([summaryRes, ordersRes]) => {
      if (!ignore) {
        if (summaryRes.success) {
          setSummary(summaryRes.summary);
        }
        if (ordersRes.success) {
          setDeliveredOrders(ordersRes.orders);
        }
        setLoadingSummary(false);
        setLoadingOrders(false);
      }
    });

    return () => {
      ignore = true;
    };
  }, []);

  useRealtimeSubscription({
    table: "alteration_requests",
    onEvent: () => {
      loadSummary();
      loadList();
      if (selectedOrderId && selectedStudent) {
        handleStudentSelect(selectedStudent);
      }
    },
  });

  useEffect(() => {
    let ignore = false;
    Promise.resolve().then(() => {
      if (!ignore) setLoadingList(true);
      return getSchoolAlterationsList({
        page,
        pageSize: 10,
        search: debouncedSearch,
        status: statusFilter,
        reason: reasonFilter,
        dateRange: dateFilter,
      });
    }).then((res) => {
      if (!ignore) {
        if (res.success) {
          setAlterations(res.alterations);
          setTotalPages(res.totalPages);
          setTotalCount(res.totalCount);
        }
        setLoadingList(false);
      }
    });
    return () => {
      ignore = true;
    };
  }, [page, debouncedSearch, statusFilter, reasonFilter, dateFilter]);

  const handleOrderChange = (orderId: string) => {
    setSelectedOrderId(orderId);
    setSelectedClass("all");
    setSelectedStudent(null);
    setStudentItems([]);

    if (!orderId) {
      setDeliveredStudents([]);
      setClasses([]);
      return;
    }

    setLoadingStudents(true);
    getDeliveredStudentsForOrder(orderId).then((res) => {
      setLoadingStudents(false);
      if (res.success) {
        setDeliveredStudents(res.deliveredStudents);
        setClasses(res.classes);
      } else {
        toast.error(res.error || "Unable to load delivered students.");
      }
    });
  };

  const handleStudentSelect = (student: DeliveredStudent) => {
    setSelectedStudent(student);
    setLoadingItems(true);
    getDeliveredStudentItems(selectedOrderId, student.id).then((res) => {
      setLoadingItems(false);
      if (res.success) {
        setStudentItems(res.items);
      } else {
        toast.error(res.error || "No delivered uniform items are available for alteration.");
      }
    });
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const res = await exportSchoolAlterationsToExcel();
      if (res.success && res.base64) {
        const byteCharacters = atob(res.base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.filename || "Alteration_Requests.xlsx";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        toast.success("Alteration requests exported to Excel successfully.");
      } else {
        toast.error(res.error || "Failed to export alteration requests.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to export Excel file.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleRefresh = () => {
    loadSummary();
    loadList();
    loadDeliveredOrders();
    if (selectedOrderId) {
      handleOrderChange(selectedOrderId);
    }
  };

  const handleViewDetails = (id: string) => {
    setSelectedAlterationId(id);
    setDetailsOpen(true);
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "requested":
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200 uppercase text-xs font-semibold">Requested</Badge>;
      case "under_review":
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200 uppercase text-xs font-semibold">Under Review</Badge>;
      case "approved":
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 uppercase text-xs font-semibold">Approved</Badge>;
      case "rejected":
        return <Badge className="bg-red-100 text-red-800 border-red-200 uppercase text-xs font-semibold">Rejected</Badge>;
      case "rework":
        return <Badge className="bg-evenvibe-light text-evenvibe-deep border-evenvibe-light uppercase text-xs font-semibold">Rework</Badge>;
      case "completed":
        return <Badge className="bg-slate-100 text-slate-800 border-slate-200 uppercase text-xs font-semibold">Completed</Badge>;
      default:
        return <Badge variant="outline" className="uppercase text-xs">{status}</Badge>;
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(dateStr));
  };

  const filteredStudents = deliveredStudents.filter((s) => {
    if (selectedClass === "all") return true;
    return s.class_name === selectedClass;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Alterations & Rework</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Request size corrections for students who received final delivery (Max 2 attempts per student & item).
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            disabled={isExporting || totalCount === 0}
            className="text-xs flex items-center gap-1.5"
          >
            {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5 text-slate-600" />}
            Export to Excel
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            title="Refresh"
            disabled={loadingList || loadingSummary}
          >
            <RefreshCw className={`h-4 w-4 ${loadingList ? "animate-spin" : ""}`} />
          </Button>
          <NewAlterationDialog onSuccess={handleRefresh} initialOrderId={selectedOrderId} />
        </div>
      </div>

      {/* Top Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Requests
            </CardTitle>
            <Scissors className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {loadingSummary ? "..." : summary.total}
            </div>
            <p className="text-xs text-slate-400 mt-1">Across all delivered orders</p>
          </CardContent>
        </Card>

        <Card className="border-blue-100 shadow-sm bg-blue-50/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-blue-700">
              Requested
            </CardTitle>
            <Clock className="h-4 w-4 text-status-info" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-900">
              {loadingSummary ? "..." : summary.requested}
            </div>
            <p className="text-xs text-blue-600 mt-1">Awaiting review</p>
          </CardContent>
        </Card>

        <Card className="border-amber-100 shadow-sm bg-amber-50/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-amber-700">
              Under Review
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-status-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-900">
              {loadingSummary ? "..." : summary.under_review}
            </div>
            <p className="text-xs text-status-warning mt-1">Evaluation in progress</p>
          </CardContent>
        </Card>

        <Card className="border-evenvibe-light shadow-sm bg-evenvibe-light/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-evenvibe-deep">
              In Alteration
            </CardTitle>
            <RotateCcw className="h-4 w-4 text-evenvibe-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-evenvibe-deep">
              {loadingSummary ? "..." : summary.approved_rework}
            </div>
            <p className="text-xs text-evenvibe-primary mt-1">Under correction</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm bg-slate-50/30">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Completed
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-evenvibe-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {loadingSummary ? "..." : summary.completed}
            </div>
            <p className="text-xs text-slate-500 mt-1">Alteration resolved</p>
          </CardContent>
        </Card>
      </div>

      {/* ---------------------------------------------------- */}
      {/* SECTION 24: DELIVERY RECEIVED STUDENTS WORKSPACE     */}
      {/* ---------------------------------------------------- */}
      <Card className="border-evenvibe-light shadow-sm bg-gradient-to-r from-slate-50/80 to-indigo-50/30">
        <CardHeader className="pb-3 border-b border-evenvibe-light/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Scissors className="h-5 w-5 text-evenvibe-primary" />
                Delivery Received Students & Items
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Select an order to view students who actually received final delivery.
              </p>
            </div>

            {/* Select Order */}
            <div className="w-full sm:w-72">
              <Select value={selectedOrderId} onValueChange={(val) => handleOrderChange(val || "")}>
                <SelectTrigger className="bg-white text-xs h-9">
                  <SelectValue placeholder={loadingOrders ? "Loading orders..." : "Select Delivered Order..."} />
                </SelectTrigger>
                <SelectContent>
                  {deliveredOrders.length === 0 && !loadingOrders ? (
                    <div className="p-3 text-center text-xs text-slate-500">
                      No delivered orders are available for alteration.
                    </div>
                  ) : (
                    deliveredOrders.map((o) => (
                      <SelectItem key={o.id} value={o.id} className="text-xs">
                        {o.order_number} {o.delivered_at ? `(Delivered: ${new Date(o.delivered_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })})` : `(${o.status})`}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 space-y-4">
          {!selectedOrderId ? (
            <div className="py-8 text-center text-sm text-slate-500 flex flex-col items-center justify-center">
              <Package className="h-8 w-8 text-slate-300 mb-2" />
              <span>Please select a delivered order above to inspect alteration-eligible students.</span>
            </div>
          ) : loadingStudents ? (
            <div className="py-8 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-evenvibe-primary" />
              <span>Loading delivery-received students...</span>
            </div>
          ) : deliveredStudents.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500 bg-white/60 rounded-lg border border-dashed border-slate-200">
              No delivered students are available for alteration in this order.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left Column: Delivered Students List */}
              <div className="lg:col-span-6 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Delivered Students ({filteredStudents.length})
                  </span>
                  {classes.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500">Class:</span>
                      <Select value={selectedClass} onValueChange={(val) => setSelectedClass(val || "all")}>
                        <SelectTrigger className="h-7 text-xs w-[110px] bg-white">
                          <SelectValue />
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

                <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-80 overflow-y-auto shadow-sm">
                  {filteredStudents.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500">
                      No delivered students are available in this class.
                    </div>
                  ) : (
                    filteredStudents.map((stu) => {
                      const isSelected = selectedStudent?.id === stu.id;
                      return (
                        <div
                          key={stu.id}
                          onClick={() => handleStudentSelect(stu)}
                          className={`p-3 flex items-center justify-between cursor-pointer transition-all ${
                            isSelected ? "bg-evenvibe-light border-l-4 border-evenvibe-primary" : "hover:bg-slate-50/70"
                          }`}
                        >
                          <div>
                            <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                              {stu.student_name}
                              <span className="text-xs font-normal text-slate-500">({stu.admission_number})</span>
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {stu.class_name} - {stu.section} • {stu.delivered_items_count} delivered items
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={
                                stu.alteration_status === "Locked"
                                  ? "bg-red-50 text-red-700 border-red-200 text-[11px]"
                                  : stu.alteration_status === "In Progress"
                                  ? "bg-amber-50 text-amber-700 border-amber-200 text-[11px]"
                                  : "bg-evenvibe-light text-evenvibe-deep border-emerald-200 text-[11px]"
                              }
                            >
                              {stu.alteration_status} ({stu.attempts_summary})
                            </Badge>
                            <Button size="sm" variant={isSelected ? "default" : "outline"} className="h-7 text-xs">
                              {isSelected ? "Active" : "Inspect"}
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Column: Delivered Uniform Items for Selected Student */}
              <div className="lg:col-span-6 space-y-3">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  Delivered Uniform Items {selectedStudent ? `• ${selectedStudent.student_name}` : ""}
                </span>

                {!selectedStudent ? (
                  <div className="h-80 bg-white/60 rounded-lg border border-dashed border-slate-200 flex flex-col items-center justify-center text-center p-6 text-slate-500 text-sm">
                    <User className="h-8 w-8 text-slate-300 mb-2" />
                    <span>Select a student on the left to view their delivered uniform items and alteration attempt history.</span>
                  </div>
                ) : loadingItems ? (
                  <div className="h-80 bg-white rounded-lg border border-slate-200 flex items-center justify-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin text-evenvibe-primary" />
                    <span>Loading student items...</span>
                  </div>
                ) : studentItems.length === 0 ? (
                  <div className="h-80 bg-white rounded-lg border border-slate-200 flex items-center justify-center p-6 text-sm text-slate-500">
                    No delivered uniform items are available for alteration.
                  </div>
                ) : (
                  <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-80 overflow-y-auto shadow-sm">
                    {studentItems.map((item) => (
                      <div key={item.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50/60 transition-colors">
                        <div className="space-y-0.5">
                          <div className="font-semibold text-sm text-slate-900 flex items-center gap-1.5">
                            {item.itemName}
                            <span className="text-xs text-slate-500 font-normal">
                              ({item.styleName} • {item.color})
                            </span>
                          </div>
                          <div className="text-xs text-slate-600 flex items-center gap-3">
                            <span className="font-medium text-slate-700">
                              Given Size: <span className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-900">{item.currentGivenSize}</span> 🔒
                            </span>
                            <span>•</span>
                            <span className="text-slate-500">
                              Attempts: <span className="font-bold text-slate-800">{item.attemptsLabel}</span>
                            </span>
                          </div>
                          {item.history.length > 0 && (
                            <div className="text-[11px] text-evenvibe-primary mt-1">
                              Previous: Attempt {item.history[item.history.length - 1].attempt_number} changed to {item.history[item.history.length - 1].change_size} ({item.history[item.history.length - 1].status})
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
                            <NewAlterationDialog onSuccess={handleRefresh} initialOrderId={selectedOrderId} />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Search & Filters */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {/* Search Input */}
            <div className="relative md:col-span-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search ID, order, student, adm..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>

            {/* Status Filter */}
            <div>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v || "all");
                  setPage(1);
                }}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Status: All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Status: All</SelectItem>
                  <SelectItem value="requested">Requested</SelectItem>
                  <SelectItem value="under_review">Under Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="rework">Rework</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Reason Filter */}
            <div>
              <Select
                value={reasonFilter}
                onValueChange={(v) => {
                  setReasonFilter(v || "all");
                  setPage(1);
                }}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Reason: All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Reason: All</SelectItem>
                  {ALTERATION_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Filter */}
            <div>
              <Select
                value={dateFilter}
                onValueChange={(v) => {
                  setDateFilter((v as "all" | "today" | "last_7_days" | "last_30_days" | "this_month") || "all");
                  setPage(1);
                }}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Date: All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Date: All</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                  <SelectItem value="last_30_days">Last 30 Days</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Request Table */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="py-3 px-4 border-b bg-slate-50/50 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-800">
            Alteration Requests ({totalCount})
          </CardTitle>
          <span className="text-xs text-slate-500">Sorted by Newest First</span>
        </CardHeader>
        <CardContent className="p-0">
          {loadingList ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-500 gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-evenvibe-primary" />
              <span className="text-sm">Loading alteration requests...</span>
            </div>
          ) : alterations.length === 0 ? (
            <div className="py-16 text-center flex flex-col items-center justify-center">
              <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                <Scissors className="h-7 w-7 text-slate-300" />
              </div>
              <h3 className="text-base font-semibold text-slate-900 mb-1">No requests found</h3>
              <p className="text-slate-500 text-sm max-w-sm">
                {debouncedSearch || statusFilter !== "all" || reasonFilter !== "all" || dateFilter !== "all"
                  ? "No alteration requests match your search or filter criteria."
                  : "No alteration requests have been submitted yet. Click [+ New Alteration Request] to create one."}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Request ID</th>
                      <th className="px-4 py-3 font-semibold">Order</th>
                      <th className="px-4 py-3 font-semibold">Student</th>
                      <th className="px-4 py-3 font-semibold">Class</th>
                      <th className="px-4 py-3 font-semibold">Item & Style</th>
                      <th className="px-4 py-3 font-semibold">Attempt</th>
                      <th className="px-4 py-3 font-semibold">Given Size</th>
                      <th className="px-4 py-3 font-semibold">Change Size</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Date</th>
                      <th className="px-4 py-3 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {alterations.map((alt) => (
                      <tr key={alt.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">
                          {alt.request_number}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">
                          {alt.order?.order_number || "-"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">
                            {alt.student?.student_name || "Unknown"}
                          </div>
                          <div className="text-xs text-slate-400">
                            {alt.student?.admission_number || "-"}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          {alt.student?.class_name || "-"} {alt.student?.section ? `(${alt.student.section})` : ""}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-medium text-slate-800 capitalize">{alt.item_name}</div>
                          {alt.style_name && (
                            <div className="text-[11px] text-slate-500">{alt.style_name} {alt.color ? `• ${alt.color}` : ""}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge variant="outline" className="bg-evenvibe-light text-evenvibe-deep border-evenvibe-light text-xs">
                            Attempt {alt.attempt_number || 1}/2
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-mono font-medium text-slate-700">
                          {alt.given_size || alt.current_size || "-"} 🔒
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-evenvibe-deep">
                          {alt.change_size || alt.required_size || "-"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{renderStatusBadge(alt.status)}</td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                          {formatDate(alt.created_at)}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewDetails(alt.id)}
                            className="h-8 text-xs text-evenvibe-primary hover:text-evenvibe-deep hover:bg-evenvibe-light"
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" /> View
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden divide-y divide-slate-100">
                {alterations.map((alt) => (
                  <MobileCard key={alt.id} className="space-y-2">
                    <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                      <span className="font-bold text-slate-900">{alt.request_number}</span>
                      {renderStatusBadge(alt.status)}
                    </div>
                    <MobileCardField
                      label="Student"
                      value={`${alt.student?.student_name || "Unknown"} (${alt.student?.admission_number || "-"})`}
                    />
                    <MobileCardField
                      label="Class"
                      value={`${alt.student?.class_name || "-"} (${alt.student?.section || "-"})`}
                    />
                    <MobileCardField
                      label="Item"
                      value={`${alt.item_name} (Attempt ${alt.attempt_number || 1}/2)`}
                    />
                    <MobileCardField
                      label="Given Size -> Change Size"
                      value={`${alt.given_size || alt.current_size || "-"} -> ${alt.change_size || alt.required_size || "-"}`}
                    />
                    <MobileCardField
                      label="Date"
                      value={formatDate(alt.created_at)}
                    />
                    <MobileCardActions>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => handleViewDetails(alt.id)}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1.5" /> View Details
                      </Button>
                    </MobileCardActions>
                  </MobileCard>
                ))}
              </div>
            </>
          )}

          {/* Pagination */}
          {!loadingList && alterations.length > 0 && totalPages > 1 && (
            <div className="py-3 px-4 border-t flex items-center justify-between bg-slate-50/50">
              <span className="text-xs text-slate-500">
                Page {page} of {totalPages} ({totalCount} total items)
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="h-8 text-xs"
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="h-8 text-xs"
                >
                  Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details Dialog Modal */}
      <AlterationDetailsDialog
        alterationId={selectedAlterationId}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />
    </div>
  );
}
