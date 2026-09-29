"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/server";
import { compareAcademicYears } from "@/lib/constants/academicYear";
import {
  HistoryFilters,
  AcademicSizeHistoryResponse,
  DetailedHistoryRecord,
  SchoolOption,
  StudentHistorySummaryRow,
} from "./types";

/**
 * Returns schools for the filter dropdown.
 */
export async function getHistorySchoolOptions(): Promise<SchoolOption[]> {
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("schools")
    .select("id, name, school_code")
    .order("name", { ascending: true });

  if (error) {
    console.error(
      "Error fetching school options for size history:",
      error.message || JSON.stringify(error)
    );
    return [];
  }

  return (data || []).map((s) => ({
    id: s.id,
    name: s.name,
    code: s.school_code || "",
  }));
}

/**
 * Fetches filtered size history data, summary statistics, academic year overview, and grouped students.
 */
export async function getAcademicSizeHistoryData(
  filters: HistoryFilters = {}
): Promise<AcademicSizeHistoryResponse> {
  await requireAdmin();
  const supabase = await createClient();

  // 1. Fetch schools for filter
  const schools = await getHistorySchoolOptions();

  // 2. Fetch overall academic year overview (counts per year in history)
  const { data: allYearsData, error: yearsError } = await supabase
    .from("student_uniform_size_history")
    .select("academic_year");

  if (yearsError) {
    console.error(
      "Error fetching academic years overview:",
      yearsError.message || JSON.stringify(yearsError)
    );
  }

  const yearCountsMap: Record<string, number> = {};
  (allYearsData || []).forEach((row) => {
    if (row.academic_year) {
      yearCountsMap[row.academic_year] = (yearCountsMap[row.academic_year] || 0) + 1;
    }
  });

  const yearOverview = Object.entries(yearCountsMap)
    .map(([academic_year, count]) => ({ academic_year, count }))
    .sort((a, b) => compareAcademicYears(a.academic_year, b.academic_year));

  // 3. Build main query for history records
  let query = supabase
    .from("student_uniform_size_history")
    .select(`
      id,
      student_id,
      school_id,
      academic_year,
      style_id,
      style_name,
      item_name,
      gender,
      size,
      color,
      class_name,
      section,
      source_type,
      created_at,
      updated_at,
      students (
        id,
        student_name,
        admission_number,
        class_name,
        section,
        gender
      ),
      schools (
        id,
        name,
        school_code
      )
    `);

  if (filters.school_id && filters.school_id !== "all") {
    query = query.eq("school_id", filters.school_id);
  }
  if (filters.academic_year && filters.academic_year !== "all") {
    query = query.eq("academic_year", filters.academic_year);
  }
  if (filters.class_name && filters.class_name !== "all") {
    query = query.eq("class_name", filters.class_name);
  }
  if (filters.section && filters.section !== "all") {
    query = query.eq("section", filters.section);
  }
  if (filters.gender && filters.gender !== "all") {
    query = query.eq("gender", filters.gender);
  }

  // If search query is provided, find matching student IDs
  if (filters.search && filters.search.trim()) {
    const term = `%${filters.search.trim()}%`;
    const { data: matchedStudents } = await supabase
      .from("students")
      .select("id")
      .or(`student_name.ilike.${term},admission_number.ilike.${term}`);

    const matchedIds = (matchedStudents || []).map((s) => s.id);
    if (matchedIds.length === 0) {
      return {
        students: [],
        totalStudentsCount: 0,
        stats: {
          totalStudents: 0,
          academicYearsCount: 0,
          sizeRecordsCount: 0,
          schoolsCount: 0,
        },
        yearOverview,
        schools,
      };
    }
    query = query.in("student_id", matchedIds);
  }

  const { data: recordsData, error: recordsError } = await query;

  if (recordsError) {
    console.error("Error fetching academic size history records:", recordsError);
    throw new Error("Unable to load academic size history.");
  }

  const rows = recordsData || [];

  // 4. Calculate Summary Statistics
  const distinctStudentsSet = new Set<string>();
  const distinctYearsSet = new Set<string>();
  const distinctSchoolsSet = new Set<string>();

  rows.forEach((r) => {
    if (r.student_id) distinctStudentsSet.add(r.student_id);
    if (r.academic_year) distinctYearsSet.add(r.academic_year);
    if (r.school_id) distinctSchoolsSet.add(r.school_id);
  });

  const stats = {
    totalStudents: distinctStudentsSet.size,
    academicYearsCount: distinctYearsSet.size,
    sizeRecordsCount: rows.length,
    schoolsCount: distinctSchoolsSet.size,
  };

  // 5. Group records by student
  const studentMap = new Map<string, StudentHistorySummaryRow>();

  rows.forEach((row) => {
    const stId = row.student_id;
    const studentObj = Array.isArray(row.students) ? row.students[0] : row.students;
    const schoolObj = Array.isArray(row.schools) ? row.schools[0] : row.schools;

    if (!studentMap.has(stId)) {
      studentMap.set(stId, {
        student_id: stId,
        student_name: studentObj?.student_name || "Unknown Student",
        admission_number: studentObj?.admission_number || "N/A",
        school_id: row.school_id,
        school_name: schoolObj?.name || "Unknown School",
        class_name: row.class_name || studentObj?.class_name || "N/A",
        section: row.section || studentObj?.section || null,
        gender: row.gender || studentObj?.gender || null,
        years_count: 0,
        years_list: [],
      });
    }

    const entry = studentMap.get(stId)!;
    if (row.academic_year && !entry.years_list.includes(row.academic_year)) {
      entry.years_list.push(row.academic_year);
    }
  });

  const allGroupedStudents = Array.from(studentMap.values())
    .map((s) => ({
      ...s,
      years_list: s.years_list.sort(compareAcademicYears),
      years_count: s.years_list.length,
    }))
    .sort((a, b) => a.student_name.localeCompare(b.student_name));

  // 6. Paginate grouped students
  const page = Math.max(1, filters.page || 1);
  const pageSize = filters.pageSize || 20;
  const startIndex = (page - 1) * pageSize;
  const pagedStudents = allGroupedStudents.slice(startIndex, startIndex + pageSize);

  return {
    students: pagedStudents,
    totalStudentsCount: allGroupedStudents.length,
    stats,
    yearOverview,
    schools,
  };
}

/**
 * Fetches all historical size records for a specific student across all years.
 */
export async function getStudentDetailedHistory(
  studentId: string
): Promise<DetailedHistoryRecord[]> {
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("student_uniform_size_history")
    .select(`
      id,
      student_id,
      school_id,
      academic_year,
      style_id,
      style_name,
      item_name,
      gender,
      size,
      color,
      class_name,
      section,
      source_type,
      created_at,
      updated_at,
      students (
        id,
        student_name,
        admission_number,
        class_name,
        section,
        gender
      ),
      schools (
        id,
        name,
        school_code
      )
    `)
    .eq("student_id", studentId)
    .order("academic_year", { ascending: true })
    .order("item_name", { ascending: true });

  if (error) {
    console.error(
      "Error fetching detailed history for student:",
      error.message || JSON.stringify(error)
    );
    throw new Error("Unable to load student history details.");
  }

  const rows = data || [];

  return rows
    .map((r) => {
      const studentObj = Array.isArray(r.students) ? r.students[0] : r.students;
      const schoolObj = Array.isArray(r.schools) ? r.schools[0] : r.schools;

      return {
        id: r.id,
        student_id: r.student_id,
        school_id: r.school_id,
        school_name: schoolObj?.name || "Unknown School",
        student_name: studentObj?.student_name || "Unknown Student",
        admission_number: studentObj?.admission_number || "N/A",
        academic_year: r.academic_year,
        style_id: r.style_id,
        style_name: r.style_name,
        item_name: r.item_name,
        gender: r.gender,
        size: r.size,
        color: r.color,
        class_name: r.class_name || studentObj?.class_name || null,
        section: r.section || studentObj?.section || null,
        source_type: (r.source_type as "historical_record" | "manual_baseline") || "historical_record",
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    })
    .sort((a, b) => compareAcademicYears(a.academic_year, b.academic_year));
}

/**
 * Fetches all matching history records formatted for Excel export.
 */
export async function exportAcademicSizeHistoryData(
  filters: HistoryFilters = {}
): Promise<Record<string, unknown>[]> {
  await requireAdmin();
  const supabase = await createClient();

  let query = supabase
    .from("student_uniform_size_history")
    .select(`
      id,
      student_id,
      school_id,
      academic_year,
      style_id,
      style_name,
      item_name,
      gender,
      size,
      color,
      class_name,
      section,
      source_type,
      created_at,
      students (
        id,
        student_name,
        admission_number,
        class_name,
        section,
        gender
      ),
      schools (
        id,
        name,
        school_code
      )
    `)
    .order("academic_year", { ascending: true })
    .order("item_name", { ascending: true });

  if (filters.school_id && filters.school_id !== "all") {
    query = query.eq("school_id", filters.school_id);
  }
  if (filters.academic_year && filters.academic_year !== "all") {
    query = query.eq("academic_year", filters.academic_year);
  }
  if (filters.class_name && filters.class_name !== "all") {
    query = query.eq("class_name", filters.class_name);
  }
  if (filters.section && filters.section !== "all") {
    query = query.eq("section", filters.section);
  }
  if (filters.gender && filters.gender !== "all") {
    query = query.eq("gender", filters.gender);
  }

  if (filters.search && filters.search.trim()) {
    const term = `%${filters.search.trim()}%`;
    const { data: matchedStudents } = await supabase
      .from("students")
      .select("id")
      .or(`student_name.ilike.${term},admission_number.ilike.${term}`);

    const matchedIds = (matchedStudents || []).map((s) => s.id);
    if (matchedIds.length === 0) {
      return [];
    }
    query = query.in("student_id", matchedIds);
  }

  // Cap at 10,000 records to prevent memory exhaustion on export
  query = query.limit(10000);

  const { data, error } = await query;

  if (error) {
    console.error(
      "Error exporting academic size history:",
      error.message || JSON.stringify(error)
    );
    throw new Error("Failed to export size history data.");
  }

  const rows = data || [];

  return rows.map((r) => {
    const studentObj = Array.isArray(r.students) ? r.students[0] : r.students;
    const schoolObj = Array.isArray(r.schools) ? r.schools[0] : r.schools;

    return {
      "School": schoolObj?.name || "N/A",
      "Student Name": studentObj?.student_name || "N/A",
      "Admission Number": studentObj?.admission_number || "N/A",
      "Class": r.class_name || studentObj?.class_name || "N/A",
      "Section": r.section || studentObj?.section || "N/A",
      "Gender": r.gender || studentObj?.gender || "N/A",
      "Academic Year": r.academic_year,
      "Item": r.item_name,
      "Style": r.style_name || "Style not available",
      "Color": r.color || "Not specified",
      "Size": r.size,
      "Source": r.source_type === "manual_baseline" ? "Baseline" : "Historical",
      "Recorded Date": r.created_at
        ? new Date(r.created_at).toLocaleDateString("en-IN", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        : "N/A",
    };
  });
}
