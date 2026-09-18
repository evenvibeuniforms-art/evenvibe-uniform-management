import { requireSchoolAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, ClipboardList, Ruler, Package, BarChart3, ArrowRight, UserPlus, FileSpreadsheet, Truck, FileText } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { getActiveUniformDesign } from "@/lib/actions/uniform-designs";
import { getSchoolLogo } from "@/lib/actions/school-logo";
import { UniformDesignCard } from "@/components/dashboard/uniform-design-card";
import { SchoolLogoCard } from "@/components/dashboard/school-logo-card";
import { ClassSectionProgress, ClassProgressData } from "@/components/school/ClassSectionProgress";
import { SchoolDashboardRealtime } from "@/components/school/SchoolDashboardRealtime";

export default async function SchoolDashboard() {
  const profile = await requireSchoolAdmin();
  
  const supabase = await createClient();
  
  // Fetch all dashboard data dependencies in parallel
  const [
    schoolRes,
    studentsRes,
    requirementRes,
    orderRes,
    designRes,
    logoRes,
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
      .select("order_number, status")
      .eq("school_id", profile.school_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getActiveUniformDesign(),
    getSchoolLogo(),
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
  const progressPercentage = totalStudents ? Math.round((completedSizes / totalStudents) * 100) : 0;

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
  const { design: activeDesign, signedUrl: activeDesignSignedUrl } = designRes;
  const { logo: schoolLogo, signedUrl: schoolLogoSignedUrl } = logoRes;

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
          <span className="text-lg font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-md mt-1 border border-emerald-100">
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
            <span className="text-2xl font-bold text-emerald-600 mt-1">{activeStudents}</span>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-4 flex flex-col justify-center items-center text-center">
            <span className="text-xs font-medium text-slate-500 uppercase">Sizes Collected</span>
            <span className="text-2xl font-bold text-emerald-600 mt-1">{completedSizes}</span>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-4 flex flex-col justify-center items-center text-center">
            <span className="text-xs font-medium text-slate-500 uppercase">Sizes Pending</span>
            <span className="text-2xl font-bold text-amber-500 mt-1">{pendingSizesCount}</span>
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
            <Link href="/school/sizes" className={buttonVariants({ variant: "default", size: "sm", className: "bg-emerald-600 hover:bg-emerald-700" })}>
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
        <CardContent className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 relative">
            
            {/* Step 1: Students */}
            <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm relative flex flex-col h-full">
              <div className="flex items-center gap-2 mb-2">
                <div className="bg-emerald-100 text-emerald-700 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">1</div>
                <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider">Students</h3>
              </div>
              <p className="text-sm font-semibold text-slate-800 mb-1">Add / Import</p>
              <div className="mt-auto pt-2 border-t border-slate-100">
                <span className="text-xs font-medium text-emerald-600 flex items-center">
                  <Users className="w-3.5 h-3.5 mr-1" /> {totalStudents} Students
                </span>
              </div>
            </div>

            {/* Step 2: Class & Section */}
            <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm relative flex flex-col h-full">
              <div className="flex items-center gap-2 mb-2">
                <div className="bg-emerald-100 text-emerald-700 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">2</div>
                <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider">Classes</h3>
              </div>
              <p className="text-sm font-semibold text-slate-800 mb-1">Select & Manage</p>
              <div className="mt-auto pt-2 border-t border-slate-100">
                <span className="text-xs font-medium text-slate-600 flex items-center">
                  <Building2 className="w-3.5 h-3.5 mr-1" /> {classProgressData.length} Classes
                </span>
              </div>
            </div>

            {/* Step 3: Size Collection */}
            <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm relative flex flex-col h-full">
              <div className="flex items-center gap-2 mb-2">
                <div className="bg-emerald-100 text-emerald-700 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">3</div>
                <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider">Sizes</h3>
              </div>
              <p className="text-sm font-semibold text-slate-800 mb-1">Collect Sizes</p>
              <div className="mt-auto pt-2 border-t border-slate-100">
                <span className={`text-xs font-medium flex items-center ${progressPercentage === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  <Ruler className="w-3.5 h-3.5 mr-1" /> {completedSizes} / {totalStudents}
                </span>
              </div>
            </div>

            {/* Step 4: Requirement */}
            <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm relative flex flex-col h-full">
              <div className="flex items-center gap-2 mb-2">
                <div className="bg-emerald-100 text-emerald-700 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">4</div>
                <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider">Requirement</h3>
              </div>
              <p className="text-sm font-semibold text-slate-800 mb-1">Review & Submit</p>
              <div className="mt-auto pt-2 border-t border-slate-100">
                <span className={`text-xs font-medium flex items-center capitalize ${requirementData ? 'text-emerald-600' : 'text-slate-500'}`}>
                  <ClipboardList className="w-3.5 h-3.5 mr-1" /> {requirementStatus.replace("_", " ")}
                </span>
              </div>
            </div>

            {/* Step 5: Order */}
            <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm relative flex flex-col h-full">
              <div className="flex items-center gap-2 mb-2">
                <div className="bg-emerald-100 text-emerald-700 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">5</div>
                <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider">Order</h3>
              </div>
              <p className="text-sm font-semibold text-slate-800 mb-1">Track Status</p>
              <div className="mt-auto pt-2 border-t border-slate-100">
                <span className={`text-xs font-medium flex items-center capitalize ${orderData ? 'text-emerald-600' : 'text-slate-500'}`}>
                  <Package className="w-3.5 h-3.5 mr-1" /> {orderStatus.replace("_", " ")}
                </span>
              </div>
            </div>

            {/* Step 6: Reports */}
            <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm relative flex flex-col h-full">
              <div className="flex items-center gap-2 mb-2">
                <div className="bg-emerald-100 text-emerald-700 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">6</div>
                <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider">Reports</h3>
              </div>
              <p className="text-sm font-semibold text-slate-800 mb-1">View Insights</p>
              <div className="mt-auto pt-2 border-t border-slate-100">
                <span className="text-xs font-medium text-slate-600 flex items-center">
                  <BarChart3 className="w-3.5 h-3.5 mr-1" /> Analytics
                </span>
              </div>
            </div>
            
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
                    <span className="text-sm font-bold text-emerald-600">{completedSizes}</span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <span className="text-sm text-slate-600">Total Pending</span>
                    <span className="text-sm font-bold text-amber-500">{pendingSizesCount}</span>
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
                    className="flex w-full items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-md hover:bg-emerald-100 transition-colors"
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

          {/* SCHOOL UNIFORM LOGO CARD */}
          <SchoolLogoCard
            schoolName={school.name}
            logo={schoolLogo}
            signedUrl={schoolLogoSignedUrl}
          />

          {/* UNIFORM DESIGN CARD */}
          <UniformDesignCard 
            schoolName={school.name} 
            design={activeDesign} 
            signedUrl={activeDesignSignedUrl} 
          />
        </div>
      </div>
    </div>
  );
}
