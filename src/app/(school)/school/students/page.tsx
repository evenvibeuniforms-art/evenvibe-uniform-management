import { requireSchoolAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { StudentTable } from "@/components/school/StudentTable";
import { StudentFormDialog } from "@/components/school/StudentFormDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Users, UserCheck, UserX } from "lucide-react";

export default async function StudentsPage() {
  const profile = await requireSchoolAdmin();
  const supabase = await createClient();

  // Securely fetch students for the authenticated school admin
  const { data: students, error } = await supabase
    .from("students")
    .select("id, student_name, admission_number, class_name, section, gender, is_active, created_at, student_uniform_sizes (is_complete)")
    .eq("school_id", profile.school_id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching students:", JSON.stringify(error, null, 2));
    return (
      <div className="p-8 text-center bg-red-50 text-red-600 rounded-md">
        Unable to load students. Please try again.
      </div>
    );
  }

  const activeStudentsCount = students?.filter(s => s.is_active).length || 0;
  const inactiveStudentsCount = students?.filter(s => !s.is_active).length || 0;
  const totalStudentsCount = students?.length || 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Students</h2>
          <p className="text-slate-500 mt-1">Manage students for your school</p>
        </div>
        <StudentFormDialog mode="add" />
      </div>

      {/* Metrics Row */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-6 flex items-center space-x-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-full">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total Students</p>
              <h3 className="text-2xl font-bold text-slate-900">{totalStudentsCount}</h3>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-6 flex items-center space-x-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-full">
              <UserCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Active</p>
              <h3 className="text-2xl font-bold text-slate-900">{activeStudentsCount}</h3>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-slate-200">
          <CardContent className="p-6 flex items-center space-x-4">
            <div className="p-3 bg-slate-100 text-slate-600 rounded-full">
              <UserX className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Inactive</p>
              <h3 className="text-2xl font-bold text-slate-900">{inactiveStudentsCount}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Student Table */}
      <StudentTable students={students || []} />
    </div>
  );
}
