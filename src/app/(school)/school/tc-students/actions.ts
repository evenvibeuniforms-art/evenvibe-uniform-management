"use server";

import { requireSchoolAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  createTcStudentSchema,
  updateTcStudentSchema,
  CreateTcStudentInput,
  UpdateTcStudentInput,
  TcStudentItem,
  EligibleStudent,
} from "./schema";

export interface TcStudentsSummaryData {
  totalTcStudents: number;
}

export interface GetTcStudentsListParams {
  search?: string;
  className?: string;
  page?: number;
  pageSize?: number;
}

export interface GetTcStudentsListResult {
  success: boolean;
  tcStudents: TcStudentItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  error?: string;
}

/**
 * Get summary metric for TC students of the authenticated school.
 */
export async function getTcStudentsSummary(): Promise<{
  success: boolean;
  summary: TcStudentsSummaryData;
  error?: string;
}> {
  try {
    const profile = await requireSchoolAdmin();
    const supabase = await createClient();

    const { count, error } = await supabase
      .from("tc_students")
      .select("id", { count: "exact", head: true })
      .eq("school_id", profile.school_id);

    if (error) {
      console.error("Error fetching TC students count:", error);
      return {
        success: false,
        summary: { totalTcStudents: 0 },
        error: "Failed to load summary statistics.",
      };
    }

    return {
      success: true,
      summary: {
        totalTcStudents: count || 0,
      },
    };
  } catch (err: unknown) {
    console.error("Exception in getTcStudentsSummary:", err);
    return {
      success: false,
      summary: { totalTcStudents: 0 },
      error: "An unexpected error occurred.",
    };
  }
}

/**
 * Get paginated list of TC students with search and class filters.
 */
export async function getTcStudentsList(
  params: GetTcStudentsListParams = {}
): Promise<GetTcStudentsListResult> {
  try {
    const profile = await requireSchoolAdmin();
    const supabase = await createClient();

    const page = Math.max(1, params.page || 1);
    const pageSize = Math.max(1, Math.min(100, params.pageSize || 15));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let matchingStudentIds: string[] | null = null;

    // Handle search by student name or admission number
    if (params.search && params.search.trim()) {
      const s = params.search.trim();
      const { data: matchedStudents } = await supabase
        .from("students")
        .select("id")
        .eq("school_id", profile.school_id)
        .or(`student_name.ilike.%${s}%,admission_number.ilike.%${s}%`);

      matchingStudentIds = (matchedStudents || []).map((st) => st.id);
    }

    // Handle class filter
    let classFilteredStudentIds: string[] | null = null;
    if (params.className && params.className !== "all") {
      const { data: classStudents } = await supabase
        .from("students")
        .select("id")
        .eq("school_id", profile.school_id)
        .eq("class_name", params.className);

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

    // Base query
    let query = supabase
      .from("tc_students")
      .select(
        `
        id,
        school_id,
        student_id,
        tc_number,
        created_at,
        updated_at,
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
      )
      .eq("school_id", profile.school_id);

    // Apply class filter condition
    if (classFilteredStudentIds !== null) {
      query = query.in("student_id", classFilteredStudentIds);
    }

    // Apply search condition
    if (params.search && params.search.trim()) {
      const s = params.search.trim();
      if (matchingStudentIds && matchingStudentIds.length > 0) {
        query = query.or(
          `tc_number.ilike.%${s}%,student_id.in.(${matchingStudentIds.join(",")})`
        );
      } else {
        query = query.ilike("tc_number", `%${s}%`);
      }
    }

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("Error fetching TC students list:", error);
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

    const tcStudents: TcStudentItem[] = (data || []).map((row) => {
      const student = Array.isArray(row.students)
        ? row.students[0]
        : row.students;

      return {
        id: row.id,
        school_id: row.school_id,
        student_id: row.student_id,
        tc_number: row.tc_number,
        created_at: row.created_at,
        updated_at: row.updated_at,
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
    console.error("Exception in getTcStudentsList:", err);
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

/**
 * Fetch eligible students for TC creation.
 * Excludes students from this school who already have a record in tc_students.
 */
export async function getEligibleStudentsForTc(
  search?: string
): Promise<{
  success: boolean;
  students: EligibleStudent[];
  error?: string;
}> {
  try {
    const profile = await requireSchoolAdmin();
    const supabase = await createClient();

    // 1. Fetch all student_ids from tc_students for this school
    const { data: existingTc, error: tcError } = await supabase
      .from("tc_students")
      .select("student_id")
      .eq("school_id", profile.school_id);

    if (tcError) {
      console.error("Error fetching existing TC student IDs:", tcError);
      return { success: false, students: [], error: "Failed to load eligible students." };
    }

    const existingIds = (existingTc || []).map((r) => r.student_id);

    // 2. Query students belonging to this school
    let query = supabase
      .from("students")
      .select("id, student_name, admission_number, class_name, section, gender")
      .eq("school_id", profile.school_id)
      .order("student_name", { ascending: true })
      .limit(100);

    if (existingIds.length > 0) {
      query = query.not("id", "in", `(${existingIds.join(",")})`);
    }

    if (search && search.trim()) {
      const s = search.trim();
      query = query.or(`student_name.ilike.%${s}%,admission_number.ilike.%${s}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Error querying eligible students:", error);
      return { success: false, students: [], error: "Failed to load eligible students." };
    }

    const students: EligibleStudent[] = (data || []).map((s) => ({
      id: s.id,
      student_name: s.student_name,
      admission_number: s.admission_number || "—",
      class_name: s.class_name || "—",
      section: s.section || "—",
      gender: s.gender || "—",
    }));

    return { success: true, students };
  } catch (err: unknown) {
    console.error("Exception in getEligibleStudentsForTc:", err);
    return { success: false, students: [], error: "Failed to load eligible students." };
  }
}

/**
 * Fetch a single TC student record by ID.
 */
export async function getTcStudentById(
  id: string
): Promise<{
  success: boolean;
  tcStudent: TcStudentItem | null;
  error?: string;
}> {
  try {
    const profile = await requireSchoolAdmin();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("tc_students")
      .select(
        `
        id,
        school_id,
        student_id,
        tc_number,
        created_at,
        updated_at,
        students (
          id,
          student_name,
          admission_number,
          class_name,
          section,
          gender
        )
      `
      )
      .eq("id", id)
      .eq("school_id", profile.school_id)
      .maybeSingle();

    if (error || !data) {
      console.error("Error fetching TC student by ID:", error);
      return { success: false, tcStudent: null, error: "TC Student record not found." };
    }

    const student = Array.isArray(data.students)
      ? data.students[0]
      : data.students;

    return {
      success: true,
      tcStudent: {
        id: data.id,
        school_id: data.school_id,
        student_id: data.student_id,
        tc_number: data.tc_number,
        created_at: data.created_at,
        updated_at: data.updated_at,
        student: {
          id: student?.id || "",
          student_name: student?.student_name || "Unknown",
          admission_number: student?.admission_number || "—",
          class_name: student?.class_name || "—",
          section: student?.section || "—",
          gender: student?.gender || "—",
        },
      },
    };
  } catch (err: unknown) {
    console.error("Exception in getTcStudentById:", err);
    return { success: false, tcStudent: null, error: "An unexpected error occurred." };
  }
}

/**
 * Create a new TC student record.
 */
export async function createTcStudent(
  data: CreateTcStudentInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const profile = await requireSchoolAdmin();
    const validated = createTcStudentSchema.parse(data);
    const tc_number = validated.tc_number.trim();
    const student_id = validated.student_id;

    const supabase = await createClient();

    // 1. Verify student belongs to this school
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id, student_name, admission_number, class_name, section, gender, school_id")
      .eq("id", student_id)
      .eq("school_id", profile.school_id)
      .maybeSingle();

    if (studentError || !student) {
      return {
        success: false,
        error: "Selected student does not exist or does not belong to your school.",
      };
    }

    // 2. Check duplicate: student already has a TC record
    const { data: existingStudentTc } = await supabase
      .from("tc_students")
      .select("id")
      .eq("school_id", profile.school_id)
      .eq("student_id", student_id)
      .maybeSingle();

    if (existingStudentTc) {
      return {
        success: false,
        error: "TC record already exists for this student.",
      };
    }

    // 3. Check duplicate: TC number already exists in this school
    const { data: existingTcNum } = await supabase
      .from("tc_students")
      .select("id")
      .eq("school_id", profile.school_id)
      .eq("tc_number", tc_number)
      .maybeSingle();

    if (existingTcNum) {
      return {
        success: false,
        error: "TC number already exists in this school.",
      };
    }

    // 4. Insert into tc_students
    const { error: insertError } = await supabase.from("tc_students").insert({
      school_id: profile.school_id,
      student_id: student_id,
      tc_number: tc_number,
    });

    if (insertError) {
      console.error("Error creating TC student record:", insertError);
      if (insertError.code === "23505") {
        if (
          insertError.message?.includes("tc_students_school_student_unique") ||
          insertError.details?.includes("student_id")
        ) {
          return {
            success: false,
            error: "TC record already exists for this student.",
          };
        }
        if (
          insertError.message?.includes("tc_students_school_tc_number_unique") ||
          insertError.details?.includes("tc_number")
        ) {
          return {
            success: false,
            error: "TC number already exists in this school.",
          };
        }
      }
      return {
        success: false,
        error: "Failed to create TC student record. Please try again.",
      };
    }

    revalidatePath("/school/tc-students");
    return { success: true };
  } catch (err: unknown) {
    console.error("Exception in createTcStudent:", err);
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return {
      success: false,
      error: "An unexpected error occurred while creating TC student.",
    };
  }
}

/**
 * Update TC student record (e.g. modify TC number).
 */
export async function updateTcStudent(
  id: string,
  data: UpdateTcStudentInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const profile = await requireSchoolAdmin();
    const validated = updateTcStudentSchema.parse(data);
    const tc_number = validated.tc_number.trim();

    const supabase = await createClient();

    // Verify record exists and belongs to school
    const { data: currentRecord } = await supabase
      .from("tc_students")
      .select("id")
      .eq("id", id)
      .eq("school_id", profile.school_id)
      .maybeSingle();

    if (!currentRecord) {
      return {
        success: false,
        error: "TC student record not found or does not belong to your school.",
      };
    }

    // Check duplicate: another record in this school has this TC number
    const { data: existingTcNum } = await supabase
      .from("tc_students")
      .select("id")
      .eq("school_id", profile.school_id)
      .eq("tc_number", tc_number)
      .neq("id", id)
      .maybeSingle();

    if (existingTcNum) {
      return {
        success: false,
        error: "TC number already exists in this school.",
      };
    }

    const { error: updateError } = await supabase
      .from("tc_students")
      .update({
        tc_number: tc_number,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("school_id", profile.school_id);

    if (updateError) {
      console.error("Error updating TC student record:", updateError);
      if (updateError.code === "23505") {
        return {
          success: false,
          error: "TC number already exists in this school.",
        };
      }
      return {
        success: false,
        error: "Failed to update TC student record. Please try again.",
      };
    }

    revalidatePath("/school/tc-students");
    return { success: true };
  } catch (err: unknown) {
    console.error("Exception in updateTcStudent:", err);
    if (err instanceof Error) {
      return { success: false, error: err.message };
    }
    return {
      success: false,
      error: "An unexpected error occurred while updating TC student.",
    };
  }
}

/**
 * Delete a TC student record.
 * Important: ONLY deletes the TC record. Does NOT delete the student from the students table!
 */
export async function deleteTcStudent(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const profile = await requireSchoolAdmin();
    const supabase = await createClient();

    const { error } = await supabase
      .from("tc_students")
      .delete()
      .eq("id", id)
      .eq("school_id", profile.school_id);

    if (error) {
      console.error("Error deleting TC student record:", error);
      return {
        success: false,
        error: "Failed to remove TC student record. Please try again.",
      };
    }

    revalidatePath("/school/tc-students");
    return { success: true };
  } catch (err: unknown) {
    console.error("Exception in deleteTcStudent:", err);
    return {
      success: false,
      error: "An unexpected error occurred while deleting TC student record.",
    };
  }
}
