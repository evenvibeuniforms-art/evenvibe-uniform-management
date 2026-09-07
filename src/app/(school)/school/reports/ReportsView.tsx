"use client";

import { useState } from "react";
import { 
  ReportFilters, exportReportToExcel,
  OverviewReport, ClassSectionItem, SizeSummary,
  PendingSizeStudent, RequirementReportItem, OrderReportItem, AlterationReportItem
} from "./actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Download, Search, Filter, RotateCcw, Shirt
} from "lucide-react";
import { toast } from "sonner";

type ReportsViewProps = {
  filterOptions: {
    classes: string[];
    sections: string[];
  };
  initialOverview: OverviewReport;
  initialClassSection: ClassSectionItem[];
  initialSizeSummary: SizeSummary;
  initialPendingSizes: PendingSizeStudent[];
  initialRequirements: RequirementReportItem[];
  initialOrders: OrderReportItem[];
  initialAlterations: AlterationReportItem[];
};

export function ReportsView({
  filterOptions,
  initialOverview,
  initialClassSection,
  initialSizeSummary,
  initialPendingSizes,
  initialRequirements,
  initialOrders,
  initialAlterations,
}: ReportsViewProps) {
  const [activeTab, setActiveTab] = useState("overview");

  // Filter state
  const [selectedClass, setSelectedClass] = useState<string>("all");
  const [selectedSection, setSelectedSection] = useState<string>("all");
  const [selectedUniformType, setSelectedUniformType] = useState<string>("all");
  const [selectedOrderStatus, setSelectedOrderStatus] = useState<string>("all");
  const [selectedAlterationStatus, setSelectedAlterationStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Apply Client-Side Filtered Data safely
  const filteredClassSection = initialClassSection.filter(item => {
    if (selectedClass !== "all" && item.className !== selectedClass) return false;
    if (selectedSection !== "all" && item.section !== selectedSection) return false;
    return true;
  });

  const filteredPendingSizes = initialPendingSizes.filter(item => {
    if (selectedClass !== "all" && item.class_name !== selectedClass) return false;
    if (selectedSection !== "all" && item.section !== selectedSection) return false;
    if (selectedUniformType !== "all" && item.uniform_type !== selectedUniformType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const nameMatch = item.name.toLowerCase().includes(q);
      const rollMatch = item.roll_number.toString().toLowerCase().includes(q);
      if (!nameMatch && !rollMatch) return false;
    }
    return true;
  });

  const filteredRequirements = initialRequirements.filter(item => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return item.requirement_number.toLowerCase().includes(q);
    }
    return true;
  });

  const filteredOrders = initialOrders.filter(item => {
    if (selectedOrderStatus !== "all" && item.status !== selectedOrderStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return item.order_number.toLowerCase().includes(q) || item.requirement_number.toLowerCase().includes(q);
    }
    return true;
  });

  const filteredAlterations = initialAlterations.filter(item => {
    if (selectedAlterationStatus !== "all" && item.status !== selectedAlterationStatus) return false;
    if (selectedUniformType !== "all" && item.uniform_type !== selectedUniformType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return (
        item.request_number.toLowerCase().includes(q) ||
        item.student_name.toLowerCase().includes(q) ||
        item.roll_number.toString().toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleResetFilters = () => {
    setSelectedClass("all");
    setSelectedSection("all");
    setSelectedUniformType("all");
    setSelectedOrderStatus("all");
    setSelectedAlterationStatus("all");
    setSearchQuery("");
  };

  const handleExport = async (type: 'students' | 'sizes' | 'requirements' | 'orders' | 'alterations') => {
    try {
      setIsExporting(true);
      const filters: ReportFilters = {
        className: selectedClass !== "all" ? selectedClass : undefined,
        section: selectedSection !== "all" ? selectedSection : undefined,
        uniformType: selectedUniformType !== "all" ? selectedUniformType : undefined,
        orderStatus: selectedOrderStatus !== "all" ? selectedOrderStatus : undefined,
        alterationStatus: selectedAlterationStatus !== "all" ? selectedAlterationStatus : undefined,
        searchQuery: searchQuery || undefined,
      };

      const res = await exportReportToExcel(type, filters);
      if (res.success && res.base64) {
        const link = document.createElement("a");
        link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${res.base64}`;
        link.download = res.filename;
        link.click();
        toast.success("Report Exported", { description: res.filename });
      }
    } catch (err) {
      console.error("Export error:", err);
      toast.error("Export Failed", { description: "Unable to generate Excel report." });
    } finally {
      setIsExporting(false);
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'requested': return <Badge className="bg-blue-100 text-blue-800 uppercase">Requested</Badge>;
      case 'under_review': return <Badge className="bg-amber-100 text-amber-800 uppercase">Under Review</Badge>;
      case 'approved': return <Badge className="bg-emerald-100 text-emerald-800 uppercase">Approved</Badge>;
      case 'rejected': return <Badge className="bg-red-100 text-red-800 uppercase">Rejected</Badge>;
      case 'rework': return <Badge className="bg-purple-100 text-purple-800 uppercase">Rework</Badge>;
      case 'completed':
      case 'delivered': return <Badge className="bg-slate-100 text-slate-800 uppercase">{status}</Badge>;
      default: return <Badge variant="outline" className="uppercase">{status.replace('_', ' ')}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Title & Top Export Toolbar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">School Admin Reports</h1>
          <p className="text-slate-500 mt-1">Real-time overview of students, size collection, requirements, orders, and alterations.</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const exportTab = activeTab === 'overview' ? 'students' : activeTab;
              if (['students', 'sizes', 'requirements', 'orders', 'alterations'].includes(exportTab)) {
                handleExport(exportTab as 'students' | 'sizes' | 'requirements' | 'orders' | 'alterations');
              }
            }}
            disabled={isExporting}
            className="border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4 mr-2 text-emerald-600" />
            {isExporting ? "Exporting..." : `Export ${activeTab.toUpperCase()} (.xlsx)`}
          </Button>
        </div>
      </div>

      {/* FILTER BAR */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="py-3 px-4 bg-slate-50/50 border-b border-slate-100 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2 text-slate-700 font-medium text-sm">
            <Filter className="h-4 w-4 text-emerald-600" />
            <span>Report Filters</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleResetFilters} className="h-8 text-xs text-slate-500 hover:text-slate-900">
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
          </Button>
        </CardHeader>
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Class Filter */}
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Class</label>
            <Select value={selectedClass} onValueChange={(val) => setSelectedClass(val || "all")}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All Classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {filterOptions.classes.map(c => (
                  <SelectItem key={c} value={c}>Class {c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Section Filter */}
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Section</label>
            <Select value={selectedSection} onValueChange={(val) => setSelectedSection(val || "all")}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All Sections" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sections</SelectItem>
                {filterOptions.sections.map(s => (
                  <SelectItem key={s} value={s}>Section {s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Uniform Type */}
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Uniform Type</label>
            <Select value={selectedUniformType} onValueChange={(val) => setSelectedUniformType(val || "all")}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All Uniforms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="regular">Regular</SelectItem>
                <SelectItem value="tshirt">T-Shirt</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Order Status */}
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Order Status</label>
            <Select value={selectedOrderStatus} onValueChange={(val) => setSelectedOrderStatus(val || "all")}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="production">Production</SelectItem>
                <SelectItem value="quality_check">Quality Check</SelectItem>
                <SelectItem value="packed">Packed</SelectItem>
                <SelectItem value="dispatched">Dispatched</SelectItem>
                <SelectItem value="in_transit">In Transit</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Alteration Status */}
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Alteration Status</label>
            <Select value={selectedAlterationStatus} onValueChange={(val) => setSelectedAlterationStatus(val || "all")}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All Alterations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Alterations</SelectItem>
                <SelectItem value="requested">Requested</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="rework">Rework</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Search Query */}
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Name / Roll / Number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9 text-xs"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* OVERVIEW SUMMARY CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="border-slate-200">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-slate-500">Total Students</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-slate-900">{initialOverview.totalStudents}</div>
            <p className="text-[11px] text-slate-500 mt-0.5">{initialOverview.activeStudents} Active</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-slate-500">Size Completion</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-slate-900">{initialOverview.completionPercentage}%</div>
            <p className="text-[11px] text-emerald-600 mt-0.5 font-medium">{initialOverview.completedSizes} Completed</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-slate-500">Pending Sizes</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-slate-900">{initialOverview.pendingSizes}</div>
            <p className="text-[11px] text-amber-600 mt-0.5 font-medium">Students remaining</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-slate-500">Requirement</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-sm font-bold text-slate-900 capitalize truncate">
              {initialOverview.currentRequirement?.status?.replace('_', ' ') || "None"}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              {initialOverview.currentRequirement?.requirement_number || "Not submitted"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-slate-500">Current Order</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-sm font-bold text-slate-900 capitalize truncate">
              {initialOverview.currentOrder?.status?.replace('_', ' ') || "No Order"}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              {initialOverview.currentOrder?.order_number || "None"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-medium text-slate-500">Alteration Requests</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-slate-900">{initialOverview.totalAlterations}</div>
            <p className="text-[11px] text-slate-500 mt-0.5">Total logs</p>
          </CardContent>
        </Card>
      </div>

      {/* REPORT SECTIONS TABS */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-slate-100 p-1 flex overflow-x-auto justify-start border border-slate-200 rounded-lg">
          <TabsTrigger value="overview" className="text-xs font-medium px-3 py-1.5">Overview</TabsTrigger>
          <TabsTrigger value="students" className="text-xs font-medium px-3 py-1.5">Students & Classes</TabsTrigger>
          <TabsTrigger value="sizes" className="text-xs font-medium px-3 py-1.5">Uniform Sizes</TabsTrigger>
          <TabsTrigger value="requirements" className="text-xs font-medium px-3 py-1.5">Requirements</TabsTrigger>
          <TabsTrigger value="orders" className="text-xs font-medium px-3 py-1.5">Orders</TabsTrigger>
          <TabsTrigger value="alterations" className="text-xs font-medium px-3 py-1.5">Alterations</TabsTrigger>
        </TabsList>

        {/* 1. OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Class Breakdown Visual Bar */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Class Distribution</CardTitle>
                <CardDescription>Real student counts per class</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {filteredClassSection.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">No student data available.</p>
                ) : (
                  filteredClassSection.map(item => {
                    const pct = initialOverview.totalStudents > 0 ? (item.totalCount / initialOverview.totalStudents) * 100 : 0;
                    return (
                      <div key={`${item.className}-${item.section}`} className="space-y-1">
                        <div className="flex justify-between text-xs font-medium text-slate-700">
                          <span>Class {item.className} (Sec {item.section})</span>
                          <span>{item.totalCount} students ({Math.round(pct)}%)</span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* Size Completion Indicator */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Size Collection Progress</CardTitle>
                <CardDescription>Measurement collection completeness</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-6">
                <div className="relative flex items-center justify-center w-36 h-36 rounded-full bg-emerald-50 border-4 border-emerald-500 mb-4">
                  <div className="text-center">
                    <span className="text-3xl font-bold text-slate-900">{initialOverview.completionPercentage}%</span>
                    <span className="block text-[10px] text-slate-500 uppercase font-medium">Completed</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 w-full text-center text-xs mt-2 border-t pt-4">
                  <div>
                    <span className="text-slate-500 block">Completed Sizes</span>
                    <span className="text-emerald-700 font-bold text-sm">{initialOverview.completedSizes}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Pending Sizes</span>
                    <span className="text-amber-600 font-bold text-sm">{initialOverview.pendingSizes}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 2. STUDENTS & CLASSES TAB */}
        <TabsContent value="students">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Class & Section Breakdown</CardTitle>
                <CardDescription>Detailed statistics per class and section</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => handleExport('students')}>
                <Download className="h-4 w-4 mr-2 text-emerald-600" /> Export List
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-medium border-y">
                    <tr>
                      <th className="px-4 py-3">Class</th>
                      <th className="px-4 py-3">Section</th>
                      <th className="px-4 py-3">Total Students</th>
                      <th className="px-4 py-3">Completed Sizes</th>
                      <th className="px-4 py-3">Pending Sizes</th>
                      <th className="px-4 py-3">Regular Uniform</th>
                      <th className="px-4 py-3">T-Shirt Uniform</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredClassSection.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-8 text-slate-500">No data matching active filters.</td>
                      </tr>
                    ) : (
                      filteredClassSection.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-semibold text-slate-900">Class {row.className}</td>
                          <td className="px-4 py-3 text-slate-600">Sec {row.section}</td>
                          <td className="px-4 py-3 font-medium text-slate-900">{row.totalCount}</td>
                          <td className="px-4 py-3 text-emerald-600 font-medium">{row.completedSizes}</td>
                          <td className="px-4 py-3 text-amber-600 font-medium">{row.pendingSizes}</td>
                          <td className="px-4 py-3 text-slate-600">{row.regularCount}</td>
                          <td className="px-4 py-3 text-slate-600">{row.tshirtCount}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3. UNIFORM SIZES TAB */}
        <TabsContent value="sizes" className="space-y-6">
          {/* Size Quantities Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Regular Uniform Sizes */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shirt className="h-4 w-4 text-emerald-600" /> Regular Uniform Size Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-xs">
                <div>
                  <h4 className="font-semibold text-slate-700 mb-2">Shirt Sizes</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(initialSizeSummary.regular.shirt || {}).map(([sz, qty]) => (
                      <span key={sz} className="px-2.5 py-1 bg-slate-100 rounded border text-slate-800 font-medium">
                        Size {sz}: <strong className="text-emerald-700">{qty as number}</strong>
                      </span>
                    ))}
                    {Object.keys(initialSizeSummary.regular.shirt || {}).length === 0 && <span className="text-slate-400">None collected</span>}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-slate-700 mb-2">Pant Sizes</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(initialSizeSummary.regular.pant || {}).map(([sz, qty]) => (
                      <span key={sz} className="px-2.5 py-1 bg-slate-100 rounded border text-slate-800 font-medium">
                        Size {sz}: <strong className="text-emerald-700">{qty as number}</strong>
                      </span>
                    ))}
                    {Object.keys(initialSizeSummary.regular.pant || {}).length === 0 && <span className="text-slate-400">None collected</span>}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-slate-700 mb-2">Short Sizes</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(initialSizeSummary.regular.short || {}).map(([sz, qty]) => (
                      <span key={sz} className="px-2.5 py-1 bg-slate-100 rounded border text-slate-800 font-medium">
                        Size {sz}: <strong className="text-emerald-700">{qty as number}</strong>
                      </span>
                    ))}
                    {Object.keys(initialSizeSummary.regular.short || {}).length === 0 && <span className="text-slate-400">None collected</span>}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* T-Shirt Uniform Sizes */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shirt className="h-4 w-4 text-emerald-600" /> T-Shirt Uniform Size Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-xs">
                <div>
                  <h4 className="font-semibold text-slate-700 mb-2">T-Shirt Sizes</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(initialSizeSummary.tshirt.tshirt || {}).map(([sz, qty]) => (
                      <span key={sz} className="px-2.5 py-1 bg-slate-100 rounded border text-slate-800 font-medium">
                        Size {sz}: <strong className="text-emerald-700">{qty as number}</strong>
                      </span>
                    ))}
                    {Object.keys(initialSizeSummary.tshirt.tshirt || {}).length === 0 && <span className="text-slate-400">None collected</span>}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-slate-700 mb-2">Pant Sizes</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(initialSizeSummary.tshirt.pant || {}).map(([sz, qty]) => (
                      <span key={sz} className="px-2.5 py-1 bg-slate-100 rounded border text-slate-800 font-medium">
                        Size {sz}: <strong className="text-emerald-700">{qty as number}</strong>
                      </span>
                    ))}
                    {Object.keys(initialSizeSummary.tshirt.pant || {}).length === 0 && <span className="text-slate-400">None collected</span>}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-slate-700 mb-2">Short Sizes</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(initialSizeSummary.tshirt.short || {}).map(([sz, qty]) => (
                      <span key={sz} className="px-2.5 py-1 bg-slate-100 rounded border text-slate-800 font-medium">
                        Size {sz}: <strong className="text-emerald-700">{qty as number}</strong>
                      </span>
                    ))}
                    {Object.keys(initialSizeSummary.tshirt.short || {}).length === 0 && <span className="text-slate-400">None collected</span>}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Pending Students Table */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base text-amber-900">Pending Measurement List</CardTitle>
                <CardDescription>Students with missing uniform measurements</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => handleExport('sizes')}>
                <Download className="h-4 w-4 mr-2 text-emerald-600" /> Export Pending List
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-medium border-y">
                    <tr>
                      <th className="px-4 py-3">Student Name</th>
                      <th className="px-4 py-3">Class</th>
                      <th className="px-4 py-3">Section</th>
                      <th className="px-4 py-3">Roll Number</th>
                      <th className="px-4 py-3">Uniform Type</th>
                      <th className="px-4 py-3">Missing Items</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredPendingSizes.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-slate-500 bg-white">
                          🎉 All sizes collected! No pending students.
                        </td>
                      </tr>
                    ) : (
                      filteredPendingSizes.map(student => (
                        <tr key={student.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-medium text-slate-900">{student.name}</td>
                          <td className="px-4 py-3 text-slate-600">Class {student.class_name}</td>
                          <td className="px-4 py-3 text-slate-600">Sec {student.section}</td>
                          <td className="px-4 py-3 text-slate-600">{student.roll_number}</td>
                          <td className="px-4 py-3 capitalize text-slate-700 font-medium">{student.uniform_type}</td>
                          <td className="px-4 py-3 text-amber-700 font-medium">{student.missingItems}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 4. REQUIREMENTS TAB */}
        <TabsContent value="requirements">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Requirement Snapshots</CardTitle>
                <CardDescription>Submitted uniform requirement history</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => handleExport('requirements')}>
                <Download className="h-4 w-4 mr-2 text-emerald-600" /> Export Requirements
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-medium border-y">
                    <tr>
                      <th className="px-4 py-3">Requirement No</th>
                      <th className="px-4 py-3">Submitted At</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Total Students</th>
                      <th className="px-4 py-3">Regular Count</th>
                      <th className="px-4 py-3">T-Shirt Count</th>
                      <th className="px-4 py-3">Item Breakdown</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRequirements.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-8 text-slate-500">No requirements submitted yet.</td>
                      </tr>
                    ) : (
                      filteredRequirements.map(req => (
                        <tr key={req.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-bold text-slate-900">{req.requirement_number}</td>
                          <td className="px-4 py-3 text-slate-500">
                            {req.submitted_at ? new Date(req.submitted_at).toLocaleDateString() : "Draft"}
                          </td>
                          <td className="px-4 py-3">{renderStatusBadge(req.status)}</td>
                          <td className="px-4 py-3 font-medium">{req.total_students}</td>
                          <td className="px-4 py-3 text-slate-600">{req.regular_uniform_students}</td>
                          <td className="px-4 py-3 text-slate-600">{req.tshirt_uniform_students}</td>
                          <td className="px-4 py-3 text-slate-600">
                            <div className="max-w-xs space-y-1">
                              {req.requirement_items?.map((item) => (
                                <div key={item.id} className="text-[11px]">
                                  <span className="capitalize text-slate-800 font-medium">{item.uniform_type}</span> {item.item_type} ({item.size}): <strong className="text-emerald-700">{item.quantity}</strong>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 5. ORDERS TAB */}
        <TabsContent value="orders">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Orders & Tracking</CardTitle>
                <CardDescription>Submitted orders and current fulfillment statuses</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => handleExport('orders')}>
                <Download className="h-4 w-4 mr-2 text-emerald-600" /> Export Orders
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-medium border-y">
                    <tr>
                      <th className="px-4 py-3">Order Number</th>
                      <th className="px-4 py-3">Req Number</th>
                      <th className="px-4 py-3">Current Status</th>
                      <th className="px-4 py-3">Courier Info</th>
                      <th className="px-4 py-3">Created Date</th>
                      <th className="px-4 py-3">Status Timeline</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-slate-500">No orders recorded yet.</td>
                      </tr>
                    ) : (
                      filteredOrders.map(order => (
                        <tr key={order.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-bold text-slate-900">{order.order_number}</td>
                          <td className="px-4 py-3 text-slate-600">{order.requirement_number}</td>
                          <td className="px-4 py-3">{renderStatusBadge(order.status)}</td>
                          <td className="px-4 py-3 text-slate-600">
                            {order.courier_name ? (
                              <div>
                                <span className="font-medium text-slate-800">{order.courier_name}</span>
                                <span className="block text-[11px] text-slate-500">Tracking: {order.tracking_number}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400">N/A</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-500">
                            {new Date(order.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="space-y-1">
                              {order.history?.map((h) => (
                                <div key={h.id} className="text-[11px] flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block shrink-0" />
                                  <span className="font-medium text-slate-700 capitalize">{h.status.replace('_', ' ')}</span>
                                  <span className="text-[10px] text-slate-400">({new Date(h.created_at).toLocaleDateString()})</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 6. ALTERATIONS TAB */}
        <TabsContent value="alterations">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Alteration & Rework Logs</CardTitle>
                <CardDescription>Read-only record of reported uniform issues</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => handleExport('alterations')}>
                <Download className="h-4 w-4 mr-2 text-emerald-600" /> Export Alterations
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-medium border-y">
                    <tr>
                      <th className="px-4 py-3">Request No</th>
                      <th className="px-4 py-3">Student</th>
                      <th className="px-4 py-3">Class & Sec / Roll</th>
                      <th className="px-4 py-3">Order Number</th>
                      <th className="px-4 py-3">Item & Issue</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Created Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAlterations.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-8 text-slate-500">No alteration requests recorded yet.</td>
                      </tr>
                    ) : (
                      filteredAlterations.map(alt => (
                        <tr key={alt.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-bold text-slate-900">{alt.request_number}</td>
                          <td className="px-4 py-3 font-medium text-slate-800">{alt.student_name}</td>
                          <td className="px-4 py-3 text-slate-600">
                            Class {alt.class_name}-{alt.section} <span className="text-[11px] text-slate-400">(Roll {alt.roll_number})</span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{alt.order_number}</td>
                          <td className="px-4 py-3">
                            <span className="capitalize font-medium text-slate-800">{alt.uniform_type} {alt.item_type}</span>
                            <span className="block text-[11px] text-slate-500 capitalize">{alt.issue_type.replace('_', ' ')}</span>
                          </td>
                          <td className="px-4 py-3">{renderStatusBadge(alt.status)}</td>
                          <td className="px-4 py-3 text-slate-500">
                            {new Date(alt.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
