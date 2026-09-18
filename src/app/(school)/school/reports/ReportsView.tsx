
"use client";

import { useState, useEffect, useTransition } from "react";
import { 
  ReportFilters, exportReportToExcel,
  OverviewReport, SizeSummary,
  PendingSizeStudent, RequirementReportItem, OrderReportItem, AlterationReportItem,
  StudentReportItem,
  getRequirementsReport, getOrdersReport, getAlterationsReport,
  getAggregatedStudentData
} from "./actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Download, Search, Filter, RotateCcw, Shirt, CheckCircle2, AlertCircle, FileText, Package, AlertTriangle, Users, Loader2
} from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";

type ReportsViewProps = {
  filterOptions: {
    classes: string[];
    sections: string[];
    genders: string[];
  };
  initialOverview: OverviewReport;
  initialSizeSummary: SizeSummary;
  initialPendingSizes: PendingSizeStudent[];
  initialRequirements: RequirementReportItem[];
  initialOrders: OrderReportItem[];
  initialAlterations: AlterationReportItem[];
  initialStudents: StudentReportItem[];
};

export function ReportsView({
  filterOptions,
  initialOverview,
  initialSizeSummary,
  initialPendingSizes,
  initialRequirements,
  initialOrders,
  initialAlterations,
  initialStudents,
}: ReportsViewProps) {
  const [activeTab, setActiveTab] = useState("students");

  // Filter state
  const [selectedClass, setSelectedClass] = useState<string>("all");
  const [selectedSection, setSelectedSection] = useState<string>("all");
  const [selectedGender, setSelectedGender] = useState<string>("all");
  const [selectedSizeStatus, setSelectedSizeStatus] = useState<string>("all");
  const [selectedRequirementStatus, setSelectedRequirementStatus] = useState<string>("all");
  const [selectedOrderStatus, setSelectedOrderStatus] = useState<string>("all");
  const [selectedAlterationStatus, setSelectedAlterationStatus] = useState<string>("all");
  
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Report Data State
  const [overview, setOverview] = useState(initialOverview);
  // const [classSection, setClassSection] = useState(initialClassSection);
  const [sizeSummary, setSizeSummary] = useState(initialSizeSummary);
  const [pendingSizes, setPendingSizes] = useState(initialPendingSizes);
  const [requirements, setRequirements] = useState(initialRequirements);
  const [orders, setOrders] = useState(initialOrders);
  const [alterations, setAlterations] = useState(initialAlterations);
  const [students, setStudents] = useState(initialStudents);
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
  const [, startTransition] = useTransition();
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Core Student Data & Overview Effect
  useEffect(() => {
    let ignore = false;
    startTransition(async () => {
      setIsRefreshing(true);
      try {
        const filters: ReportFilters = {
          className: selectedClass !== "all" ? selectedClass : undefined,
          section: selectedSection !== "all" ? selectedSection : undefined,
          gender: selectedGender !== "all" ? selectedGender : undefined,
          sizeStatus: selectedSizeStatus !== "all" ? selectedSizeStatus : undefined,
          searchQuery: debouncedSearch || undefined,
        };

        const aggregated = await getAggregatedStudentData(filters);

        if (!ignore) {
          setOverview(aggregated.overview);
          setSizeSummary(aggregated.sizeSummary);
          setPendingSizes(aggregated.pendingSizes);
          setStudents(aggregated.students);
        }
      } catch (err) {
        console.error("Core Data Fetch Error:", err);
        if (!ignore) {
          toast.error("Unable to load report data. Please try again.");
          setOverview({
            totalStudents: 0,
            activeStudents: 0,
            inactiveStudents: 0,
            completedSizes: 0,
            pendingSizes: 0,
            completionPercentage: 0,
            currentRequirement: null,
            currentOrder: null,
            totalAlterations: 0
          });
          setStudents([]);
          setSizeSummary({});
          setPendingSizes([]);
        }
      } finally {
        if (!ignore) {
          setIsRefreshing(false);
        }
      }
    });

    return () => {
      ignore = true;
    };
  }, [selectedClass, selectedSection, selectedGender, selectedSizeStatus, debouncedSearch]);

  // Lazy Load Secondary Tabs Effect
  useEffect(() => {
    if (activeTab === "students" || activeTab === "size_summary" || activeTab === "pending_sizes") return;

    let ignore = false;
    startTransition(async () => {
      setIsRefreshing(true);
      try {
        const filters: ReportFilters = {
          className: selectedClass !== "all" ? selectedClass : undefined,
          section: selectedSection !== "all" ? selectedSection : undefined,
          gender: selectedGender !== "all" ? selectedGender : undefined,
          requirementStatus: selectedRequirementStatus !== "all" ? selectedRequirementStatus : undefined,
          orderStatus: selectedOrderStatus !== "all" ? selectedOrderStatus : undefined,
          alterationStatus: selectedAlterationStatus !== "all" ? selectedAlterationStatus : undefined,
          searchQuery: debouncedSearch || undefined,
        };

        if (activeTab === "requirements") {
          const newRequirements = await getRequirementsReport(filters);
          if (!ignore) setRequirements(newRequirements);
        } else if (activeTab === "orders") {
          const newOrders = await getOrdersReport(filters);
          if (!ignore) setOrders(newOrders);
        } else if (activeTab === "alterations") {
          const newAlterations = await getAlterationsReport(filters);
          if (!ignore) setAlterations(newAlterations);
        }
      } catch (err) {
        console.error("Secondary Data Fetch Error:", err);
        if (!ignore) {
          toast.error(`Unable to load ${activeTab} data. Please try again.`);
        }
      } finally {
        if (!ignore) {
          setIsRefreshing(false);
        }
      }
    });

    return () => {
      ignore = true;
    };
  }, [activeTab, selectedClass, selectedSection, selectedGender, selectedRequirementStatus, selectedOrderStatus, selectedAlterationStatus, debouncedSearch]);

  const handleResetFilters = () => {
    setSelectedClass("all");
    setSelectedSection("all");
    setSelectedGender("all");
    setSelectedSizeStatus("all");
    setSelectedRequirementStatus("all");
    setSelectedOrderStatus("all");
    setSelectedAlterationStatus("all");
    setSearchQuery("");
  };

  const handleExport = async (type: 'students' | 'size_summary' | 'sizes' | 'requirements' | 'orders' | 'alterations') => {
    try {
      setIsExporting(true);
      const filters: ReportFilters = {
        className: selectedClass !== "all" ? selectedClass : undefined,
        section: selectedSection !== "all" ? selectedSection : undefined,
        gender: selectedGender !== "all" ? selectedGender : undefined,
        sizeStatus: selectedSizeStatus !== "all" ? selectedSizeStatus : undefined,
        requirementStatus: selectedRequirementStatus !== "all" ? selectedRequirementStatus : undefined,
        orderStatus: selectedOrderStatus !== "all" ? selectedOrderStatus : undefined,
        alterationStatus: selectedAlterationStatus !== "all" ? selectedAlterationStatus : undefined,
        searchQuery: debouncedSearch || undefined,
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

  const isSearching = debouncedSearch.trim().length > 0;
  
  // Render search results exactly as requested
  const renderSearchResults = () => {
    if (students.length === 0) {
      return (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <div className="rounded-full bg-slate-100 p-3 mb-4">
              <Search className="h-6 w-6 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">No matching students found.</h3>
            <p className="text-sm text-slate-500 max-w-sm mt-1">
              Try adjusting your search or filters to find the student you&apos;re looking for.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => setSearchQuery("")}>Clear Search</Button>
          </CardContent>
        </Card>
      );
    }

    if (students.length === 1) {
      const student = students[0];
      const hasMissing = !student.is_complete;
      const dynamicKeys = Object.keys(student.dynamic_sizes);
      return (
        <Card className="border-slate-200 shadow-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <CardHeader className="bg-slate-50 border-b py-4 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                {student.student_name}
                <Badge variant="outline" className="text-xs font-mono ml-2">{student.admission_number}</Badge>
              </CardTitle>
              <CardDescription className="flex items-center gap-4 mt-2">
                <span>Class {student.class_name} • Section {student.section}</span>
                <span>•</span>
                <span>{student.gender}</span>
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-2">
              {student.is_complete ? (
                <Badge className="bg-emerald-100 text-emerald-800 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Sizes Complete
                </Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-800 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Sizes Pending
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x border-b">
              {/* Sizes Panel */}
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Shirt className="h-4 w-4 text-indigo-500" />
                    Uniform Sizes
                  </h3>
                </div>
                
                {dynamicKeys.length > 0 ? (
                  <div className="border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead className="h-8">Item</TableHead>
                          <TableHead className="h-8">Size</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dynamicKeys.map(itemId => {
                           // Try to find item name in the global SizeSummary
                           let itemName = "Unknown Item";
                           const genderObj = sizeSummary[student.gender];
                           if (genderObj) {
                             const found = Object.keys(genderObj).find(i => genderObj[i][student.dynamic_sizes[itemId]]);
                             if (found) itemName = found;
                           }
                           return (
                            <TableRow key={itemId}>
                              <TableCell className="font-medium">{itemName}</TableCell>
                              <TableCell>{student.dynamic_sizes[itemId]}</TableCell>
                            </TableRow>
                           );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead className="h-8">Item</TableHead>
                          <TableHead className="h-8">Size</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell className="font-medium">Shirt</TableCell>
                          <TableCell>{student.shirt_size || "-"}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">T-Shirt</TableCell>
                          <TableCell>{student.tshirt_size || "-"}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Pant</TableCell>
                          <TableCell>{student.pant_size || "-"}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-medium">Short</TableCell>
                          <TableCell>{student.short_size || "-"}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
                
                {hasMissing && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-100 text-red-800 rounded-md text-sm flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Missing Items</p>
                      <p>{student.missingItems}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Status Panel */}
              <div className="p-6 space-y-6">
                <div>
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-3">
                    <FileText className="h-4 w-4 text-blue-500" />
                    Requirement Status
                  </h3>
                  {overview.currentRequirement ? (
                     <div className="flex items-center justify-between text-sm p-3 bg-slate-50 rounded-md border">
                       <span className="font-mono">{overview.currentRequirement.requirement_number}</span>
                       {renderStatusBadge(overview.currentRequirement.status)}
                     </div>
                  ) : (
                     <p className="text-sm text-slate-500 italic">No requirement submitted yet.</p>
                  )}
                </div>
                
                <Separator />

                <div>
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-3">
                    <Package className="h-4 w-4 text-amber-500" />
                    Order Status
                  </h3>
                  {overview.currentOrder ? (
                     <div className="flex items-center justify-between text-sm p-3 bg-slate-50 rounded-md border">
                       <span className="font-mono">{overview.currentOrder.order_number}</span>
                       {renderStatusBadge(overview.currentOrder.status)}
                     </div>
                  ) : (
                     <p className="text-sm text-slate-500 italic">No order placed yet.</p>
                  )}
                </div>

                <Separator />
                
                <div>
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-3">
                    <AlertTriangle className="h-4 w-4 text-purple-500" />
                    Alterations
                  </h3>
                  <div className="flex items-center justify-between text-sm p-3 bg-slate-50 rounded-md border">
                    <span className="text-slate-600">Total Requests</span>
                    <span className="font-semibold text-slate-900">{student.alterations_count}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    // Multiple Matches
    return (
      <Card className="animate-in fade-in duration-200">
        <CardHeader className="py-4 border-b">
          <CardTitle className="text-lg flex items-center justify-between">
            Search Results ({students.length})
            <Button variant="outline" size="sm" onClick={() => setSearchQuery("")}>Clear Search</Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead>Student Name</TableHead>
                <TableHead>Admission No</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Gender</TableHead>
                <TableHead>Size Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.student_name}</TableCell>
                  <TableCell className="font-mono text-xs">{s.admission_number}</TableCell>
                  <TableCell>{s.class_name}</TableCell>
                  <TableCell>{s.section}</TableCell>
                  <TableCell>{s.gender}</TableCell>
                  <TableCell>
                    {s.is_complete ? (
                      <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50">Completed</Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50">Pending</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setSearchQuery(s.admission_number)} className="h-8">
                      View Details
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              School Admin Reports
              {isRefreshing && <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />}
            </h1>
            <p className="text-slate-500 mt-1">Complete student, uniform size, requirement, order and alteration reports.</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className={`${showFilters ? 'bg-slate-100' : ''}`}
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>
          <Button
            onClick={() => {
              const exportTab = activeTab === 'size_summary' || activeTab === 'sizes' || activeTab === 'requirements' || activeTab === 'orders' || activeTab === 'alterations' ? activeTab : 'students';
              handleExport(exportTab);
            }}
            disabled={isExporting}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Download className="h-4 w-4 mr-2" />
            {isExporting ? "Exporting..." : "Export Report"}
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
        <Input 
          placeholder="Search student name or admission number..." 
          className="pl-10 h-12 text-base shadow-sm border-slate-300 focus-visible:ring-emerald-500"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {showFilters && (
        <Card className="border-slate-200 bg-slate-50 animate-in slide-in-from-top-2 duration-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">Report Filters</h3>
              <Button variant="ghost" size="sm" onClick={handleResetFilters} className="h-8 text-slate-500 hover:text-slate-900">
                <RotateCcw className="h-3 w-3 mr-2" /> Reset Filters
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <Select value={selectedClass} onValueChange={(v) => setSelectedClass(v || "all")}>
                <SelectTrigger className="h-9 bg-white"><SelectValue placeholder="Class" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {filterOptions.classes.map(c => <SelectItem key={c} value={c}>Class {c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={selectedSection} onValueChange={(v) => setSelectedSection(v || "all")}>
                <SelectTrigger className="h-9 bg-white"><SelectValue placeholder="Section" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sections</SelectItem>
                  {filterOptions.sections.map(s => <SelectItem key={s} value={s}>Section {s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={selectedGender} onValueChange={(v) => setSelectedGender(v || "all")}>
                <SelectTrigger className="h-9 bg-white"><SelectValue placeholder="Gender" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Genders</SelectItem>
                  {filterOptions.genders.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={selectedSizeStatus} onValueChange={(v) => setSelectedSizeStatus(v || "all")}>
                <SelectTrigger className="h-9 bg-white"><SelectValue placeholder="Size Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {isSearching ? (
        renderSearchResults()
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Total Students</p>
                  <h3 className="text-2xl font-bold text-slate-900">{overview.totalStudents}</h3>
                </div>
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Completed Sizes</p>
                  <h3 className="text-2xl font-bold text-emerald-600">{overview.completedSizes}</h3>
                </div>
                <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Pending Sizes</p>
                  <h3 className="text-2xl font-bold text-amber-600">{overview.pendingSizes}</h3>
                </div>
                <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">Completion %</p>
                  <h3 className="text-2xl font-bold text-indigo-600">{overview.completionPercentage}%</h3>
                </div>
                <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-indigo-600" />
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full flex justify-start overflow-x-auto bg-transparent border-b rounded-none h-auto p-0 space-x-6">
              <TabsTrigger value="students" className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:shadow-none px-0 py-3 data-[state=active]:bg-transparent">Students</TabsTrigger>
              <TabsTrigger value="size_summary" className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:shadow-none px-0 py-3 data-[state=active]:bg-transparent">Size Summary</TabsTrigger>
              <TabsTrigger value="sizes" className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:shadow-none px-0 py-3 data-[state=active]:bg-transparent">Pending Sizes</TabsTrigger>
              <TabsTrigger value="requirements" className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:shadow-none px-0 py-3 data-[state=active]:bg-transparent">Requirements</TabsTrigger>
              <TabsTrigger value="orders" className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:shadow-none px-0 py-3 data-[state=active]:bg-transparent">Orders</TabsTrigger>
              <TabsTrigger value="alterations" className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:shadow-none px-0 py-3 data-[state=active]:bg-transparent">Alterations</TabsTrigger>
            </TabsList>

            <div className="mt-6">
              <TabsContent value="students" className="m-0">
                <Card>
                  <CardHeader className="py-4">
                    <CardTitle className="text-lg">Students Report</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Adm No</TableHead>
                          <TableHead>Class</TableHead>
                          <TableHead>Section</TableHead>
                          <TableHead>Gender</TableHead>
                          <TableHead>Size Status</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {students.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="h-24 text-center text-slate-500">No students found.</TableCell>
                          </TableRow>
                        ) : students.map(s => (
                          <TableRow key={s.id}>
                            <TableCell className="font-medium">{s.student_name}</TableCell>
                            <TableCell className="font-mono text-xs">{s.admission_number}</TableCell>
                            <TableCell>{s.class_name}</TableCell>
                            <TableCell>{s.section}</TableCell>
                            <TableCell>{s.gender}</TableCell>
                            <TableCell>
                              {s.is_complete ? (
                                <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50">Completed</Badge>
                              ) : (
                                <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50">Pending</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" onClick={() => setSearchQuery(s.admission_number)}>View Details</Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="size_summary" className="m-0">
                <Card>
                  <CardHeader className="py-4">
                    <CardTitle className="text-lg">Uniform Size Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 overflow-x-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
                      {Object.keys(sizeSummary).length === 0 ? (
                        <div className="col-span-2 p-8 text-center text-slate-500">No size data available.</div>
                      ) : (
                        Object.keys(sizeSummary).map(gender => (
                          <div key={gender} className="p-6">
                            <h3 className="text-sm font-bold text-slate-900 mb-4 tracking-wider uppercase">{gender}</h3>
                            <Table>
                              <TableHeader className="bg-slate-50">
                                <TableRow>
                                  <TableHead>Item</TableHead>
                                  <TableHead>Size</TableHead>
                                  <TableHead className="text-right">Quantity</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {Object.keys(sizeSummary[gender]).map(item => (
                                  Object.keys(sizeSummary[gender][item]).map(size => (
                                    <TableRow key={`${item}-${size}`}>
                                      <TableCell className="font-medium">{item}</TableCell>
                                      <TableCell>{size}</TableCell>
                                      <TableCell className="text-right">{sizeSummary[gender][item][size]}</TableCell>
                                    </TableRow>
                                  ))
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="sizes" className="m-0">
                <Card>
                  <CardHeader className="py-4">
                    <CardTitle className="text-lg">Pending Size Collection</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead>Student Name</TableHead>
                          <TableHead>Adm No</TableHead>
                          <TableHead>Class</TableHead>
                          <TableHead>Section</TableHead>
                          <TableHead>Gender</TableHead>
                          <TableHead>Missing Items</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingSizes.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="h-24 text-center text-slate-500">All sizes collected!</TableCell>
                          </TableRow>
                        ) : pendingSizes.map(s => (
                          <TableRow key={s.id}>
                            <TableCell className="font-medium">{s.student_name}</TableCell>
                            <TableCell className="font-mono text-xs">{s.admission_number}</TableCell>
                            <TableCell>{s.class_name}</TableCell>
                            <TableCell>{s.section}</TableCell>
                            <TableCell>{s.gender}</TableCell>
                            <TableCell className="text-red-600">{s.missingItems}</TableCell>
                            <TableCell><Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50">Pending</Badge></TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="sm" onClick={() => setSearchQuery(s.admission_number)}>View Details</Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="requirements" className="m-0">
                <Card>
                  <CardHeader className="py-4">
                    <CardTitle className="text-lg">Requirement History</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead>Requirement No</TableHead>
                          <TableHead>Submitted Date</TableHead>
                          <TableHead className="text-right">Total Students</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {requirements.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="h-24 text-center text-slate-500">No requirements found.</TableCell>
                          </TableRow>
                        ) : requirements.map(r => (
                          <TableRow key={r.id}>
                            <TableCell className="font-mono font-medium">{r.requirement_number}</TableCell>
                            <TableCell>{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : "N/A"}</TableCell>
                            <TableCell className="text-right">{r.total_students}</TableCell>
                            <TableCell>{renderStatusBadge(r.status)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="orders" className="m-0">
                <Card>
                  <CardHeader className="py-4">
                    <CardTitle className="text-lg">Order History</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead>Order No</TableHead>
                          <TableHead>Requirement No</TableHead>
                          <TableHead>Courier</TableHead>
                          <TableHead>Tracking</TableHead>
                          <TableHead>Est. Delivery</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orders.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="h-24 text-center text-slate-500">No orders found.</TableCell>
                          </TableRow>
                        ) : orders.map(o => (
                          <TableRow key={o.id}>
                            <TableCell className="font-mono font-medium">{o.order_number}</TableCell>
                            <TableCell className="font-mono text-slate-500 text-xs">{o.requirement_number}</TableCell>
                            <TableCell>{o.courier_name || "-"}</TableCell>
                            <TableCell className="font-mono text-xs">{o.tracking_number || "-"}</TableCell>
                            <TableCell>{o.estimated_delivery ? new Date(o.estimated_delivery).toLocaleDateString() : "-"}</TableCell>
                            <TableCell>{renderStatusBadge(o.status)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="alterations" className="m-0">
                <Card>
                  <CardHeader className="py-4">
                    <CardTitle className="text-lg">Alterations & Rework</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead>Request No</TableHead>
                          <TableHead>Student</TableHead>
                          <TableHead>Adm No</TableHead>
                          <TableHead>Class</TableHead>
                          <TableHead>Section</TableHead>
                          <TableHead>Gender</TableHead>
                          <TableHead>Item</TableHead>
                          <TableHead>Issue</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {alterations.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={10} className="h-24 text-center text-slate-500">No alteration records found.</TableCell>
                          </TableRow>
                        ) : alterations.map(a => (
                          <TableRow key={a.id}>
                            <TableCell className="font-mono text-xs font-medium">{a.request_number}</TableCell>
                            <TableCell className="font-medium">{a.student_name}</TableCell>
                            <TableCell className="font-mono text-xs">{a.admission_number}</TableCell>
                            <TableCell>{a.class_name}</TableCell>
                            <TableCell>{a.section}</TableCell>
                            <TableCell>{a.gender}</TableCell>
                            <TableCell>{a.item_type}</TableCell>
                            <TableCell className="max-w-[200px] truncate" title={a.issue_type}>{a.issue_type}</TableCell>
                            <TableCell>{renderStatusBadge(a.status)}</TableCell>
                            <TableCell>{new Date(a.created_at).toLocaleDateString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>
            </div>
          </Tabs>
        </>
      )}
    </div>
  );
}
