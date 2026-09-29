import { requireSchoolAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Building2,
  Users,
  ClipboardList,
  Ruler,
  BarChart3,
  ArrowRight,
  UserPlus,
  FileSpreadsheet,
  Truck,
  FileText,
  Send,
  PackageSearch,
  PackageCheck,
  Scissors
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";

import { ClassSectionProgress, ClassProgressData } from "@/components/school/ClassSectionProgress";
import { SchoolDashboardRealtime } from "@/components/school/SchoolDashboardRealtime";

function getWorkflowBadgeStyle(badge: string) {
  switch (badge.toLowerCase()) {
    case "completed":
      return "bg-evenvibe-light text-evenvibe-deep border-emerald-200";
    case "in progress":
    case "ready":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "submitted":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "available":
      return "bg-sky-50 text-sky-700 border-sky-200";
    default:
      return "bg-slate-50 text-slate-500 border-slate-200";
  }
}

function getWorkflowMetricStyle(badge: string) {
  switch (badge.toLowerCase()) {
    case "completed":
      return "text-evenvibe-primary";
    case "in progress":
    case "ready":
      return "text-status-warning";
    case "submitted":
      return "text-blue-600";
    case "available":
      return "text-status-info";
    default:
      return "text-slate-500";
  }
}

export default async function SchoolDashboard() {
  const profile = await requireSchoolAdmin();
  
  const supabase = await createClient();
  
  // Fetch all dashboard data dependencies in parallel
  const [
    schoolRes,
    studentsRes,
    requirementRes,
    orderRes,
    alterationsRes,
    deliveredOrdersRes,
  ] = await Promise.all([
    supabase
      .from("schools")
      .select("name, school_code")
      .eq("id", profile.school_id)
      .single(),
    supabase
      .from("students")
      .select(`
        id,
        class_name,
        section,
        is_active,
        student_uniform_sizes (is_complete, uniform_type)
      `)
      .eq("school_id", profile.school_id),
    supabase
      .from("requirements")
      .select("status, requirement_number, total_students, regular_uniform_students, tshirt_uniform_students, submitted_at")
      .eq("school_id", profile.school_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("orders")
      .select("id, order_number, status, tracking_number, courier_name, delivered_at, shipped_at, created_at")
      .eq("school_id", profile.school_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("alteration_requests")
      .select("id, status")
      .eq("school_id", profile.school_id),
    supabase
      .from("orders")
      .select("id, status")
      .eq("school_id", profile.school_id)
      .in("status", ["delivered", "dispatched", "in_transit", "packed"]),
  ]);

  const school = schoolRes.data;
  if (schoolRes.error || !school) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Building2 className="h-12 w-12 text-slate-300 mb-4" />
        <h2 className="text-xl font-semibold text-slate-900">School information not available</h2>
        <p className="mt-2 text-slate-500">Please contact EvenVibe support to resolve this issue.</p>
      </div>
    );
  }

  const students = studentsRes.data || [];
  const totalStudents = students.length;
  const activeStudents = students.filter(s => s.is_active).length;
  
  let completedSizes = 0;
  let regularCompleted = 0;
  let tshirtCompleted = 0;
  
  const classProgressMap = new Map<string, ClassProgressData>();

  students.forEach((student) => {
    const sizeRecord = Array.isArray(student.student_uniform_sizes) 
      ? student.student_uniform_sizes[0] 
      : student.student_uniform_sizes;
      
    const isComplete = sizeRecord?.is_complete || false;
    if (isComplete) {
      completedSizes++;
      if (sizeRecord?.uniform_type === 'regular') regularCompleted++;
      else if (sizeRecord?.uniform_type === 'tshirt') tshirtCompleted++;
    }

    const className = student.class_name || "Unassigned";
    const section = student.section || "N/A";
    const key = `${className}-${section}`;

    if (!classProgressMap.has(key)) {
      classProgressMap.set(key, {
        className,
        section,
        total: 0,
        completed: 0,
        pending: 0,
        progressPercentage: 0
      });
    }

    const classData = classProgressMap.get(key)!;
    classData.total++;
    if (isComplete) {
      classData.completed++;
    } else {
      classData.pending++;
    }
  });

  const pendingSizesCount = totalStudents - completedSizes;

  // Calculate percentages for class data and sort
  const classProgressData = Array.from(classProgressMap.values()).map(data => {
    data.progressPercentage = data.total ? Math.round((data.completed / data.total) * 100) : 0;
    return data;
  }).sort((a, b) => {
    const classComp = a.className.localeCompare(b.className, undefined, { numeric: true });
    if (classComp !== 0) return classComp;
    return a.section.localeCompare(b.section);
  });

  const requirementData = requirementRes.data;
  const requirementStatus = requirementData?.status || "Pending Sizes";
  const orderData = orderRes.data;
  const orderStatus = orderData?.status || "Not Created";

  // Data computations for 9-step workflow
  const isAllSizesCollected = totalStudents > 0 && completedSizes === totalStudents;
  const isRequirementSubmitted = Boolean(
    requirementData?.submitted_at || 
    ['submitted', 'approved', 'converted_to_order'].includes(requirementData?.status || '')
  );

  const isDelivered = orderData?.status === "delivered";
  const isShipping = orderData?.status === "dispatched" || orderData?.status === "in_transit";
  const isPacked = orderData?.status === "packed";

  // Delivered and received students calculation
  const deliveredOrderIds = (deliveredOrdersRes.data || []).map((o) => o.id);
  let receivedStudentsCount = 0;
  if (deliveredOrderIds.length > 0) {
    const { data: delItems } = await supabase
      .from("order_delivery_student_items")
      .select("student_id")
      .in("order_id", deliveredOrderIds);

    if (delItems && delItems.length > 0) {
      const uniqueStudents = new Set((delItems as Array<{ student_id: string }>).map((item) => item.student_id));
      receivedStudentsCount = uniqueStudents.size;
    }
  }

  // Alterations calculation
  const alterations = alterationsRes.data || [];
  const totalAlterations = alterations.length;
  const pendingAlterations = alterations.filter((a) =>
    ["requested", "under_review", "approved_rework"].includes(a.status)
  ).length;

  const workflowSteps = [
    {
      number: 1,
      title: "Students",
      subtitle: "Add / Import & Manage",
      route: "/school/students",
      icon: Users,
      description: `${totalStudents} Student${totalStudents === 1 ? "" : "s"}`,
      badge: totalStudents > 0 ? "Completed" : "Pending",
    },
    {
      number: 2,
      title: "Size Collection",
      subtitle: "Collect Student Sizes",
      route: "/school/sizes",
      icon: Ruler,
      description: `${completedSizes} / ${totalStudents}`,
      badge: isAllSizesCollected ? "Completed" : completedSizes > 0 ? "In Progress" : "Pending",
    },
    {
      number: 3,
      title: "Uniform Requirement",
      subtitle: "Prepare & Review Requirement",
      route: "/school/requirements",
      icon: ClipboardList,
      description: requirementData
        ? requirementData.status.replace(/_/g, " ")
        : isAllSizesCollected
          ? "Ready to Prepare"
          : "Pending Sizes",
      badge: requirementData ? "Completed" : isAllSizesCollected ? "Ready" : "Pending",
    },
    {
      number: 4,
      title: "Submit Order",
      subtitle: "Submit Uniform Order",
      route: "/school/requirements",
      icon: Send,
      description: isRequirementSubmitted
        ? "Submitted"
        : requirementData
          ? "Ready to Submit"
          : "Pending Requirement",
      badge: isRequirementSubmitted ? "Completed" : requirementData ? "Ready" : "Pending",
    },
    {
      number: 5,
      title: "Order Tracking",
      subtitle: "Track Order Progress",
      route: "/school/orders",
      icon: PackageSearch,
      description: orderData ? orderData.status.replace(/_/g, " ") : "Not Created",
      badge: orderData
        ? ["delivered", "in_transit", "dispatched", "packed", "quality_check", "production", "confirmed"].includes(orderData.status)
          ? "In Progress"
          : "Submitted"
        : "Pending",
    },
    {
      number: 6,
      title: "Delivery",
      subtitle: "View Delivery Details",
      route: "/school/orders",
      icon: Truck,
      description: isDelivered
        ? "Delivered"
        : isShipping
          ? "In Transit"
          : isPacked
            ? "Packed"
            : orderData
              ? "Awaiting Dispatch"
              : "No Active Order",
      badge: isDelivered ? "Completed" : isShipping || isPacked ? "In Progress" : "Pending",
    },
    {
      number: 7,
      title: "Received Students",
      subtitle: "Mark Dress Received",
      route: "/school/received-students",
      icon: PackageCheck,
      description: receivedStudentsCount > 0
        ? `${receivedStudentsCount} Received`
        : isDelivered || deliveredOrderIds.length > 0
          ? "Ready to Mark"
          : "Awaiting Delivery",
      badge: receivedStudentsCount > 0
        ? "Completed"
        : isDelivered || deliveredOrderIds.length > 0
          ? "Available"
          : "Pending",
    },
    {
      number: 8,
      title: "Alterations",
      subtitle: "Request & Track Alterations",
      route: "/school/alterations",
      icon: Scissors,
      description: totalAlterations > 0
        ? `${totalAlterations} Request${totalAlterations === 1 ? "" : "s"}`
        : isDelivered || receivedStudentsCount > 0
          ? "Available"
          : "Awaiting Delivery",
      badge: totalAlterations > 0
        ? pendingAlterations > 0
          ? "In Progress"
          : "Completed"
        : isDelivered || receivedStudentsCount > 0
          ? "Available"
          : "Pending",
    },
    {
      number: 9,
      title: "Reports",
      subtitle: "View School Reports",
      route: "/school/reports",
      icon: BarChart3,
      description: "Analytics & Insights",
      badge: "Available",
    },
  ];

  return (
    <div className="space-y-8 pb-10">
      <SchoolDashboardRealtime schoolId={profile.school_id} />
      {/* Welcome Section & School Information */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">School Dashboard</h2>
          <div className="flex items-center gap-3 mt-1 text-slate-600">
            <Building2 className="h-5 w-5" />
            <span className="text-lg font-medium">{school.name}</span>
          </div>
        </div>
        <div className="flex flex-col sm:items-end">
          <span className="text-sm font-medium text-slate-500 uppercase tracking-wider">School Code</span>
          <span className="text-lg font-bold text-evenvibe-primary bg-evenvibe-light px-3 py-1 rounded-md mt-1 border border-emerald-100">
            {school.school_code}
          </span>
        </div>
      </div>

      {/* TOP METRICS */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-4 flex flex-col justify-center items-center text-center">
            <span className="text-xs font-medium text-slate-500 uppercase">Total Students</span>
            <span className="text-2xl font-bold text-slate-900 mt-1">{totalStudents}</span>
          </CardContent>
        </Card>
        
        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-4 flex flex-col justify-center items-center text-center">
            <span className="text-xs font-medium text-slate-500 uppercase">Active Students</span>
            <span className="text-2xl font-bold text-evenvibe-primary mt-1">{activeStudents}</span>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-4 flex flex-col justify-center items-center text-center">
            <span className="text-xs font-medium text-slate-500 uppercase">Sizes Collected</span>
            <span className="text-2xl font-bold text-evenvibe-primary mt-1">{completedSizes}</span>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-4 flex flex-col justify-center items-center text-center">
            <span className="text-xs font-medium text-slate-500 uppercase">Sizes Pending</span>
            <span className="text-2xl font-bold text-status-warning mt-1">{pendingSizesCount}</span>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-4 flex flex-col justify-center items-center text-center">
            <span className="text-xs font-medium text-slate-500 uppercase">Requirement</span>
            <span className="text-lg font-bold text-slate-900 mt-1 capitalize truncate w-full">{requirementStatus.replace("_", " ")}</span>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-4 flex flex-col justify-center items-center text-center">
            <span className="text-xs font-medium text-slate-500 uppercase">Order Status</span>
            <span className="text-lg font-bold text-slate-900 mt-1 capitalize truncate w-full">{orderStatus.replace("_", " ")}</span>
          </CardContent>
        </Card>
      </div>

      {/* QUICK ACTIONS */}
      <Card className="shadow-sm border-slate-200">
        <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50 rounded-t-xl">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-slate-600">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <Link href="/school/students/new" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <UserPlus className="h-4 w-4 mr-2" /> Add Student
            </Link>
            <Link href="/school/import" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <FileSpreadsheet className="h-4 w-4 mr-2" /> Import Excel
            </Link>
            <Link href="/school/sizes" className={buttonVariants({ variant: "default", size: "sm", className: "bg-evenvibe-primary hover:bg-evenvibe-deep" })}>
              <Ruler className="h-4 w-4 mr-2" /> Collect Sizes
            </Link>
            <Link href="/school/requirements" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <ClipboardList className="h-4 w-4 mr-2" /> Submit Requirement
            </Link>
            <Link href="/school/orders" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Truck className="h-4 w-4 mr-2" /> Track Order
            </Link>
            <Link href="/school/reports" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <BarChart3 className="h-4 w-4 mr-2" /> View Reports
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* WORKFLOW PROGRESS */}
      <Card className="shadow-sm border-slate-200 bg-slate-50/50">
        <CardHeader className="pb-3 border-b border-slate-100 bg-white rounded-t-xl">
          <CardTitle className="text-lg">Uniform Management Workflow</CardTitle>
          <CardDescription>Follow these steps to complete your school&apos;s uniform order</CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {workflowSteps.map((step) => {
              const StepIcon = step.icon;
              return (
                <Link
                  key={step.number}
                  href={step.route}
                  className="bg-evenvibe-surface rounded-2xl p-4 sm:p-5 border border-evenvibe-border shadow-sm relative flex flex-col h-full hover:border-evenvibe-primary hover:shadow-md transition-all group focus:outline-none focus:ring-2 focus:ring-evenvibe-primary focus:ring-offset-2"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="bg-evenvibe-light text-evenvibe-deep w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 group-hover:bg-evenvibe-primary group-hover:text-white transition-colors">
                        {String(step.number).padStart(2, '0')}
                      </div>
                      <h3 className="font-bold text-xs text-evenvibe-text uppercase tracking-wider">
                        {step.title}
                      </h3>
                    </div>
                    <ArrowRight className="w-4 h-4 text-evenvibe-muted group-hover:text-evenvibe-primary group-hover:translate-x-0.5 transition-all" />
                  </div>

                  <p className="text-[13px] font-medium text-evenvibe-muted mb-4 group-hover:text-evenvibe-deep transition-colors">
                    {step.subtitle}
                  </p>

                  <div className="mt-auto pt-3 border-t border-evenvibe-border flex items-center justify-between gap-2">
                    <span className={`text-xs font-medium flex items-center capitalize truncate ${getWorkflowMetricStyle(step.badge)}`}>
                      <StepIcon className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                      <span className="truncate">{step.description}</span>
                    </span>
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${getWorkflowBadgeStyle(step.badge)}`}>
                      {step.badge}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-7">
        {/* Left Column (Wider) */}
        <div className="lg:col-span-4 space-y-6">
          {/* CLASS & SECTION PROGRESS */}
          <ClassSectionProgress data={classProgressData} />

          {/* REQUIREMENT & SIZE SUMMARY */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Size Collection Summary */}
            <Card className="shadow-sm border-slate-200">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-base font-semibold">Size Collection Summary</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <span className="text-sm text-slate-600">Total Completed</span>
                    <span className="text-sm font-bold text-evenvibe-primary">{completedSizes}</span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <span className="text-sm text-slate-600">Total Pending</span>
                    <span className="text-sm font-bold text-status-warning">{pendingSizesCount}</span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <span className="text-sm text-slate-600">Regular Uniform</span>
                    <span className="text-sm font-semibold text-slate-900">{regularCompleted} <span className="text-xs font-normal text-slate-500 ml-1">students</span></span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">T-Shirt Uniform</span>
                    <span className="text-sm font-semibold text-slate-900">{tshirtCompleted} <span className="text-xs font-normal text-slate-500 ml-1">students</span></span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Requirement Summary */}
            <Card className="shadow-sm border-slate-200">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-base font-semibold">Requirement Summary</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {requirementData ? (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                      <span className="text-sm text-slate-600">Status</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 capitalize">{requirementData.status.replace("_", " ")}</span>
                    </div>
                    <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                      <span className="text-sm text-slate-600">Req Number</span>
                      <span className="text-sm font-mono font-medium">{requirementData.requirement_number}</span>
                    </div>
                    <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                      <span className="text-sm text-slate-600">Total Students</span>
                      <span className="text-sm font-semibold text-slate-900">{requirementData.total_students}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600">Submitted</span>
                      <span className="text-sm font-semibold text-slate-900">{new Date(requirementData.submitted_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 flex flex-col items-center justify-center text-center">
                    <FileText className="h-8 w-8 text-slate-200 mb-3" />
                    <p className="text-sm text-slate-500 font-medium">No requirement submitted</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-[200px]">Complete size collection for all students first.</p>
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </div>

        {/* Right Column (Narrower) */}
        <div className="lg:col-span-3 space-y-6">
          {/* ORDER SUMMARY */}
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-base font-semibold">Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {orderData ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <span className="text-sm text-slate-600">Order Number</span>
                    <span className="text-sm font-mono font-medium">{orderData.order_number}</span>
                  </div>
                  <div className="flex justify-between items-center pb-4 mb-2">
                    <span className="text-sm text-slate-600">Current Status</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 capitalize">{orderData.status.replace("_", " ")}</span>
                  </div>
                  
                  <Link 
                    href="/school/orders"
                    className="flex w-full items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-evenvibe-primary bg-evenvibe-light border border-emerald-100 rounded-md hover:bg-emerald-100 transition-colors"
                  >
                    Track Order Progress <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              ) : (
                <div className="py-8 flex flex-col items-center justify-center text-center">
                  <Truck className="h-8 w-8 text-slate-200 mb-3" />
                  <p className="text-sm text-slate-500 font-medium">No active order</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-[200px]">EvenVibe will create an order once your requirement is approved.</p>
                </div>
              )}
            </CardContent>
          </Card>


        </div>
      </div>
    </div>
  );
}
