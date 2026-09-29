"use server";

import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

export interface AdminTcStudentItem {
  id: string;
  school_id: string;
  student_id: string;
  tc_date: string | null;
  created_at: string;
  updated_at: string;
  school: {
    id: string;
    name: string;
  };
  student: {
    id: string;
    student_name: string;
    admission_number: string;
    class_name: string;
    section: string;
    gender: string;
  };
}

export interface AdminTcStudentsSummary {
  totalTcStudents: number;
  totalSchoolsWithTc: number;
}

export interface GetAdminTcStudentsListParams {
  search?: string;
  schoolId?: string;
  className?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface GetAdminTcStudentsListResult {
  success: boolean;
  tcStudents: AdminTcStudentItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  error?: string;
}

/**
 * Fetch summary KPI metrics for Admin TC Students view.
 */
export async function getAdminTcStudentsSummary(): Promise<{
  success: boolean;
  summary: AdminTcStudentsSummary;
  error?: string;
}> {
  try {
    await requireAdmin();
    const supabase = await createClient();

    // 1. Total TC students count
    const { count: totalTcStudents, error: countErr } = await supabase
      .from("tc_students")
      .select("id", { count: "exact", head: true });

    if (countErr) {
      console.error("Error fetching admin TC students count:", countErr);
      return {
        success: false,
        summary: { totalTcStudents: 0, totalSchoolsWithTc: 0 },
        error: "Failed to load TC students summary.",
      };
    }

    // 2. Count distinct schools with TC records
    const { data: schoolRows, error: schoolErr } = await supabase
      .from("tc_students")
      .select("school_id");

    let totalSchoolsWithTc = 0;
    if (!schoolErr && schoolRows) {
      const distinctSchools = new Set(schoolRows.map((r) => r.school_id));
      totalSchoolsWithTc = distinctSchools.size;
    }

    return {
      success: true,
      summary: {
        totalTcStudents: totalTcStudents || 0,
        totalSchoolsWithTc,
      },
    };
  } catch (err: unknown) {
    console.error("Exception in getAdminTcStudentsSummary:", err);
    return {
      success: false,
      summary: { totalTcStudents: 0, totalSchoolsWithTc: 0 },
      error: "An unexpected error occurred while loading TC summary.",
    };
  }
}

/**
 * Fetch schools list for filter dropdown.
 */
export async function getAdminSchoolsForTcFilter(): Promise<
  Array<{ id: string; name: string }>
> {
  try {
    await requireAdmin();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("schools")
      .select("id, name")
      .order("name", { ascending: true });

    if (error || !data) {
      console.error("Error fetching schools for TC filter:", error);
      return [];
    }

    return data;
  } catch (err: unknown) {
    console.error("Exception in getAdminSchoolsForTcFilter:", err);
    return [];
  }
}

/**
 * Get paginated list of TC students across schools with filters and search.
 */
export async function getAdminTcStudentsList(
  params: GetAdminTcStudentsListParams = {}
): Promise<GetAdminTcStudentsListResult> {
  try {
    await requireAdmin();
    const supabase = await createClient();

    const page = Math.max(1, params.page || 1);
    const pageSize = Math.max(1, Math.min(100, params.pageSize || 15));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let matchingStudentIds: string[] | null = null;

    // Search by student name or admission number
    if (params.search && params.search.trim()) {
      const s = params.search.trim();
      let studentSearchQuery = supabase
        .from("students")
        .select("id")
        .or(`student_name.ilike.%${s}%,admission_number.ilike.%${s}%`);

      if (params.schoolId && params.schoolId !== "all") {
        studentSearchQuery = studentSearchQuery.eq("school_id", params.schoolId);
      }

      const { data: matchedStudents } = await studentSearchQuery;
      matchingStudentIds = (matchedStudents || []).map((st) => st.id);

      if (matchingStudentIds.length === 0) {
        return {
          success: true,
          tcStudents: [],
          totalCount: 0,
          page,
          pageSize,
          totalPages: 0,
        };
      }
    }

    // Class filter on students table
    let classFilteredStudentIds: string[] | null = null;
    if (params.className && params.className !== "all") {
      let classQuery = supabase
        .from("students")
        .select("id")
        .eq("class_name", params.className);

      if (params.schoolId && params.schoolId !== "all") {
        classQuery = classQuery.eq("school_id", params.schoolId);
      }

      const { data: classStudents } = await classQuery;
      classFilteredStudentIds = (classStudents || []).map((st) => st.id);

      if (classFilteredStudentIds.length === 0) {
        return {
          success: true,
          tcStudents: [],
          totalCount: 0,
          page,
          pageSize,
          totalPages: 0,
        };
      }
    }

    // Base query on tc_students
    let query = supabase
      .from("tc_students")
      .select(
        `
        id,
        school_id,
        student_id,
        tc_date,
        created_at,
        updated_at,
        schools (
          id,
          name
        ),
        students!inner (
          id,
          student_name,
          admission_number,
          class_name,
          section,
          gender
        )
      `,
        { count: "exact" }
      );

    // Apply school filter
    if (params.schoolId && params.schoolId !== "all") {
      query = query.eq("school_id", params.schoolId);
    }

    // Apply date range filters
    if (params.dateFrom) {
      query = query.gte("tc_date", params.dateFrom);
    }
    if (params.dateTo) {
      query = query.lte("tc_date", params.dateTo);
    }

    // Apply class filter
    if (classFilteredStudentIds !== null) {
      query = query.in("student_id", classFilteredStudentIds);
    }

    // Apply search filter
    if (matchingStudentIds !== null) {
      query = query.in("student_id", matchingStudentIds);
    }

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("Error fetching admin TC students list:", error);
      return {
        success: false,
        tcStudents: [],
        totalCount: 0,
        page,
        pageSize,
        totalPages: 0,
        error: "Unable to load TC students.",
      };
    }

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    const tcStudents: AdminTcStudentItem[] = (data || []).map((row) => {
      const student = Array.isArray(row.students)
        ? row.students[0]
        : row.students;

      const school = Array.isArray(row.schools)
        ? row.schools[0]
        : row.schools;

      return {
        id: row.id,
        school_id: row.school_id,
        student_id: row.student_id,
        tc_date: row.tc_date || null,
        created_at: row.created_at,
        updated_at: row.updated_at,
        school: {
          id: school?.id || row.school_id,
          name: school?.name || "Unknown School",
        },
        student: {
          id: student?.id || "",
          student_name: student?.student_name || "Unknown",
          admission_number: student?.admission_number || "—",
          class_name: student?.class_name || "—",
          section: student?.section || "—",
          gender: student?.gender || "—",
        },
      };
    });

    return {
      success: true,
      tcStudents,
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  } catch (err: unknown) {
    console.error("Exception in getAdminTcStudentsList:", err);
    return {
      success: false,
      tcStudents: [],
      totalCount: 0,
      page: 1,
      pageSize: 15,
      totalPages: 0,
      error: "An unexpected error occurred while loading TC students.",
    };
  }
}
