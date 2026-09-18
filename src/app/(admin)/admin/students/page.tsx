import { getAdminStudents, getAdminSchoolsWithStats, getAdminClassesWithStats } from "./actions";
import { AdminSchoolsView } from "./views/AdminSchoolsView";
import { AdminClassesView } from "./views/AdminClassesView";
import { AdminStudentsView } from "./views/AdminStudentsView";

export const metadata = {
  title: "Manage Students | EvenVive Admin",
};

export default async function AdminStudentsPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | undefined }> }) {
  const params = await searchParams;
  const school_id = params.school_id || "";
  const class_name = params.class_name || "";

  // STATE 1: Schools List
  if (!school_id) {
    const schools = await getAdminSchoolsWithStats();
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Manage Students</h1>
            <p className="text-slate-500">Select a school to view its classes.</p>
          </div>
        </div>
        <AdminSchoolsView schools={schools} />
      </div>
    );
  }

  // STATE 2: Classes List
  if (school_id && !class_name) {
    const { schoolName, classes } = await getAdminClassesWithStats(school_id);
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <AdminClassesView 
          schoolId={school_id} 
          schoolName={schoolName} 
          classes={classes} 
        />
      </div>
    );
  }

  // STATE 3: Students List
  const page = params.page ? parseInt(params.page) : 1;
  const search = params.search || "";
  const section = params.section || "all";
  const gender = params.gender || "all";
  const size_status = params.size_status || "all";
  const sortBy = params.sortBy || "student_name";
  const sortOrder = (params.sortOrder as 'asc' | 'desc') || "asc";

  const filters: Record<string, string | number> = { search, school_id, class_name, section, gender, size_status, page, limit: 50, sortBy, sortOrder };
  
  const { students, count } = await getAdminStudents(filters);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <AdminStudentsView 
        initialStudents={students} 
        schoolId={school_id}
        schoolName={students[0]?.school_name || "School"}
        className={class_name}
        filters={filters}
        totalCount={count}
      />
    </div>
  );
}
