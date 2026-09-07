import { requireSchoolAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, ClipboardList, Ruler, FileSpreadsheet, Package, Shirt, UserPlus, BarChart3 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { getActiveUniformDesign } from "@/lib/actions/uniform-designs";
import { getSchoolLogo } from "@/lib/actions/school-logo";
import { UniformDesignCard } from "@/components/dashboard/uniform-design-card";
import { SchoolLogoCard } from "@/components/dashboard/school-logo-card";

export default async function SchoolDashboard() {
  const profile = await requireSchoolAdmin();
  
  const supabase = await createClient();
  
  // 1. Fetch School Info
  const { data: school, error: schoolError } = await supabase
    .from("schools")
    .select("name, school_code")
    .eq("id", profile.school_id)
    .single();

  if (schoolError || !school) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Building2 className="h-12 w-12 text-slate-300 mb-4" />
        <h2 className="text-xl font-semibold text-slate-900">School information not available</h2>
        <p className="mt-2 text-slate-500">Please contact EvenVibe support to resolve this issue.</p>
      </div>
    );
  }

  // 2. Fetch Total Students Count (Efficiently)
  const { count: totalStudents } = await supabase
    .from("students")
    .select("*", { count: "exact", head: true })
    .eq("school_id", profile.school_id);

  // 3. Fetch Class Data for Distribution
  const { data: classData } = await supabase
    .from("students")
    .select("class_name")
    .eq("school_id", profile.school_id);

  // Group class data
  const classCounts = classData?.reduce((acc: Record<string, number>, curr) => {
    const className = curr.class_name || "Unassigned";
    acc[className] = (acc[className] || 0) + 1;
    return acc;
  }, {});

  // 4. Fetch Size Data
  const { data: sizes } = await supabase
    .from("student_uniform_sizes")
    .select("is_complete, uniform_type, shirt_size, tshirt_size, pant_size, short_size")
    .eq("school_id", profile.school_id);

  const completedSizes = sizes?.filter(s => s.is_complete).length || 0;
  const pendingSizesCount = (totalStudents || 0) - completedSizes;
  const progressPercentage = totalStudents ? Math.round((completedSizes / totalStudents) * 100) : 0;

  let shirtCount = 0;
  let tshirtCount = 0;
  let pantCount = 0;
  let shortCount = 0;

  sizes?.forEach(s => {
    if (s.shirt_size) shirtCount++;
    if (s.tshirt_size) tshirtCount++;
    if (s.pant_size) pantCount++;
    if (s.short_size) shortCount++;
  });

  // 5. Fetch Pending Students
  const { data: pendingStudentsData } = await supabase
    .from("students")
    .select(`
      id, student_name, class_name, section, roll_number,
      student_uniform_sizes (is_complete, uniform_type, shirt_size, tshirt_size, pant_size, short_size)
    `)
    .eq("school_id", profile.school_id)
    .order("class_name")
    .order("section")
    .order("roll_number");

  const pendingStudentsList = pendingStudentsData?.filter(s => {
    const record = Array.isArray(s.student_uniform_sizes) ? s.student_uniform_sizes[0] : s.student_uniform_sizes;
    return !record?.is_complete;
  }).slice(0, 5) || [];

  // 6. Fetch Requirement Status
  const { data: requirementData } = await supabase
    .from("requirements")
    .select("status, requirement_number")
    .eq("school_id", profile.school_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const requirementStatus = requirementData?.status || "ready";

  // 7. Fetch Current Order
  const { data: orderData } = await supabase
    .from("orders")
    .select("order_number, status")
    .eq("school_id", profile.school_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { design: activeDesign, signedUrl: activeDesignSignedUrl } = await getActiveUniformDesign();
  const { logo: schoolLogo, signedUrl: schoolLogoSignedUrl } = await getSchoolLogo();

  const classDistribution = Object.entries(classCounts || {})
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => {
      // Basic sorting logic for class names if possible, else rely on count or alphabetical
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });


  return (
    <div className="space-y-8">
      {/* Welcome Section & School Information */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back</h2>
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

      {/* 1. TOP STATISTICS */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Students</CardTitle>
            <Users className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{totalStudents || 0}</div>
            <p className="text-xs text-slate-500 mt-1">Currently enrolled</p>
          </CardContent>
        </Card>
        
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Sizes Collected</CardTitle>
            <Ruler className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{completedSizes}</div>
            <p className="text-xs text-slate-500 mt-1">{progressPercentage}% completion</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Pending Sizes</CardTitle>
            <ClipboardList className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{pendingSizesCount}</div>
            <p className="text-xs text-slate-500 mt-1">Students remaining</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Requirement Status</CardTitle>
            <Package className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-slate-900 capitalize">
              {requirementStatus === "ready" ? "Ready to Submit" : requirementStatus.replace("_", " ")}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {requirementData ? requirementData.requirement_number : "No active requirement"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-7">
        
        {/* Left Column (Wider) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* 6. CLASS-WISE STUDENT COUNT */}
          <Card className="shadow-sm border-slate-200">
            <CardHeader>
              <CardTitle className="text-lg">Class-wise Students</CardTitle>
              <CardDescription>Distribution of students across classes</CardDescription>
            </CardHeader>
            <CardContent>
              {classDistribution.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Users className="mx-auto h-8 w-8 text-slate-300 mb-3" />
                  <p>No students added yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {classDistribution.map((item) => {
                    const percentage = totalStudents ? (item.count / totalStudents) * 100 : 0;
                    return (
                      <div key={item.name} className="flex items-center gap-4">
                        <div className="w-24 text-sm font-medium text-slate-700 truncate" title={item.name}>
                          {item.name}
                        </div>
                        <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                          <div 
                            className="bg-emerald-500 h-2.5 rounded-full" 
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <div className="w-12 text-sm text-right font-medium text-slate-600">
                          {item.count}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 2. UNIFORM SIZE COLLECTION PROGRESS */}
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-lg">Uniform Size Collection</CardTitle>
                  <CardDescription>Track overall size collection progress</CardDescription>
                </div>
                <Link href="/school/sizes" className="text-sm font-medium text-emerald-600 hover:text-emerald-700">
                  View Details &rarr;
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mt-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-medium text-slate-700">Overall Progress</span>
                  <span className="font-bold text-slate-900">{progressPercentage}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                  <div 
                    className="bg-emerald-500 h-3 rounded-full transition-all duration-500" 
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-slate-500 mt-3">
                  <span>{completedSizes} completed</span>
                  <span>{pendingSizesCount} pending</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 5. PENDING SIZE COLLECTION */}
          <Card className="shadow-sm border-slate-200">
            <CardHeader>
              <CardTitle className="text-lg">Pending Size Collection</CardTitle>
              <CardDescription>Students who need size measurements</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Student</th>
                      <th className="px-4 py-3">Class & Sec</th>
                      <th className="px-4 py-3">Pending Items</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingStudentsList.length > 0 ? (
                      pendingStudentsList.map(student => {
                        const record = Array.isArray(student.student_uniform_sizes) ? student.student_uniform_sizes[0] : student.student_uniform_sizes;
                        const missing: string[] = [];
                        if (!record) {
                          missing.push("All");
                        } else {
                          if (record.uniform_type === "regular" && !record.shirt_size) missing.push("Shirt");
                          if (record.uniform_type === "tshirt" && !record.tshirt_size) missing.push("T-Shirt");
                          if (!record.pant_size && !record.short_size) missing.push("Pant / Short");
                        }
                        
                        return (
                          <tr key={student.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-medium text-slate-900">{student.student_name}</td>
                            <td className="px-4 py-3 text-slate-600">{student.class_name}-{student.section}</td>
                            <td className="px-4 py-3">
                              <span className="text-amber-600 font-medium">{missing.join(", ")}</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Link href="/school/sizes" className="text-emerald-600 hover:text-emerald-700 font-medium">
                                Collect
                              </Link>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-slate-500 bg-white">
                          No pending students!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {pendingSizesCount > 5 && (
                  <div className="bg-slate-50 border-t border-slate-200 p-2 text-center">
                    <Link href="/school/sizes" className="text-sm font-medium text-emerald-600 hover:text-emerald-700">
                      View all {pendingSizesCount} pending students
                    </Link>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 3. UNIFORM CATEGORY PROGRESS */}
          <Card className="shadow-sm border-slate-200">
            <CardHeader>
              <CardTitle className="text-lg">Uniform Categories</CardTitle>
              <CardDescription>Size collection status by item type</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-lg border border-slate-200 p-4 text-center bg-emerald-50/30">
                  <Shirt className="mx-auto h-5 w-5 text-emerald-600 mb-2" />
                  <div className="text-sm font-medium text-slate-900">Shirt</div>
                  <div className="text-lg font-bold text-emerald-600 mt-1">{shirtCount}</div>
                </div>
                <div className="rounded-lg border border-slate-200 p-4 text-center bg-emerald-50/30">
                  <Shirt className="mx-auto h-5 w-5 text-emerald-600 mb-2" />
                  <div className="text-sm font-medium text-slate-900">T-Shirt</div>
                  <div className="text-lg font-bold text-emerald-600 mt-1">{tshirtCount}</div>
                </div>
                <div className="rounded-lg border border-slate-200 p-4 text-center bg-emerald-50/30">
                  <div className="mx-auto h-5 w-5 text-emerald-600 mb-2 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h14l-2 16h-3.5L12 12l-1.5 8H7L5 4z"/></svg>
                  </div>
                  <div className="text-sm font-medium text-slate-900">Pant</div>
                  <div className="text-lg font-bold text-emerald-600 mt-1">{pantCount}</div>
                </div>
                <div className="rounded-lg border border-slate-200 p-4 text-center bg-emerald-50/30">
                  <div className="mx-auto h-5 w-5 text-emerald-600 mb-2 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h14l-1 9h-4L12 9l-2 4H6l-1-9z"/></svg>
                  </div>
                  <div className="text-sm font-medium text-slate-900">Short</div>
                  <div className="text-lg font-bold text-emerald-600 mt-1">{shortCount}</div>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Right Column (Narrower) */}
        <div className="lg:col-span-3 space-y-6">
          
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

          {/* 8. QUICK ACTIONS */}
          <Card className="shadow-sm border-slate-200">

            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link 
                href="/school/students" 
                className={buttonVariants({ className: "w-full justify-start h-12 bg-emerald-600 hover:bg-emerald-700 text-white" })}
              >
                <UserPlus className="h-5 w-5 mr-3" />
                Add Student
              </Link>
              <Link 
                href="/school/students" 
                className={buttonVariants({ variant: "outline", className: "w-full justify-start h-12 border-slate-200" })}
              >
                <Users className="h-5 w-5 mr-3 text-slate-500" />
                Manage Students
              </Link>
              
              <Link href="/school/reports" className={buttonVariants({ variant: "outline", className: "w-full justify-start h-12 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200" })}>
                <BarChart3 className="h-5 w-5 mr-3" />
                View Reports
              </Link>

              <div className="pt-4 pb-2">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Coming Soon</div>
                <div className="space-y-2">
                  <Link href="/school/import" className={buttonVariants({ variant: "outline", className: "w-full justify-start h-12 bg-slate-50 border-dashed hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700" })}>
                    <FileSpreadsheet className="h-5 w-5 mr-3 text-emerald-600" />
                    <span className="text-slate-600 font-medium">Import Excel</span>
                  </Link>
                  <Link href="/school/sizes" className={buttonVariants({ variant: "outline", className: "w-full justify-start h-12 bg-slate-50 border-dashed hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700" })}>
                    <Ruler className="h-5 w-5 mr-3 text-emerald-600" />
                    <span className="text-slate-600 font-medium">Collect Sizes</span>
                  </Link>
                  <Link href="/school/requirements" className={buttonVariants({ variant: "outline", className: "w-full justify-start h-12 bg-slate-50 border-dashed hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700" })}>
                    <ClipboardList className="h-5 w-5 mr-3 text-emerald-600" />
                    <span className="text-slate-600 font-medium">Requirements</span>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 7. CURRENT ORDER */}
          <Card className="shadow-sm border-slate-200 bg-emerald-50/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Current Order</CardTitle>
            </CardHeader>
            <CardContent>
              {orderData ? (
                <div className="space-y-4">
                  <div>
                    <div className="text-sm font-medium text-slate-500 mb-1">Order Number</div>
                    <div className="text-lg font-bold text-slate-900">{orderData.order_number}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-500 mb-1">Status</div>
                    <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-emerald-100 text-emerald-800 capitalize">
                      {orderData.status.replace("_", " ")}
                    </div>
                  </div>
                  <Link 
                    href="/school/orders"
                    className="inline-flex w-full items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-emerald-600 bg-white border border-emerald-200 rounded-md hover:bg-emerald-50 transition-colors"
                  >
                    Track Order &rarr;
                  </Link>
                </div>
              ) : (
                <div className="py-6 text-center text-slate-500 flex flex-col items-center">
                  <Package className="h-8 w-8 text-slate-300 mb-3" />
                  <p className="text-sm">No active order yet.</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-[200px]">Submit your requirement to automatically generate an order.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
