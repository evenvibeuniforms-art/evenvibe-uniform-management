"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";

import { SizeCollectionFormValues, SizeHistoryEntry, LastYearSizesMap } from "@/app/(school)/school/sizes/schema";
import { STANDARD_CLASSES } from "@/lib/constants/classes";
import { ActiveStyleItem } from "@/app/(school)/school/sizes/actions";
import { saveStudentSizesCore } from "@/lib/actions/saveStudentSizesCore";
import { getActiveAcademicYear, getPreviousAcademicYear, compareAcademicYears } from "@/lib/constants/academicYear";

export type ConfigItem = {
  id: string;
  item_name: string;
  available_sizes: string[];
  is_required: boolean;
  sort_order: number;
  is_active?: boolean;
};

export async function getSchools() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schools")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  if (error) {
    console.error("Supabase error fetching schools:", error);
    throw new Error(`Failed to fetch schools: ${error.message}`);
  }
  return data?.map(s => ({ id: s.id, school_name: s.name })) || [];
}

export async function getAdminSchoolsWithStats() {
  await requireAdmin();
  const supabase = await createClient();

  const [
    { data: schools, error: schoolErr },
    { data: students, error: studentErr }
  ] = await Promise.all([
    supabase
      .from("schools")
      .select("id, name, school_code")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("students")
      .select("school_id, class_name")
      .eq("is_active", true),
  ]);

  if (schoolErr || !schools) {
    console.error("Supabase error fetching schools:", schoolErr);
    throw new Error(`Failed to fetch schools: ${schoolErr?.message}`);
  }

  if (studentErr) {
    console.error("Supabase error fetching students:", studentErr);
    throw new Error("Failed to fetch students for stats");
  }

  return schools.map((school) => {
    const schoolStudents = (students || []).filter(s => s.school_id === school.id);
    const classes = new Set(schoolStudents.map(s => s.class_name).filter(Boolean));
    return {
      id: school.id,
      name: school.name,
      school_code: school.school_code,
      studentCount: schoolStudents.length,
      activeClassesCount: classes.size,
    };
  });
}

export async function getAdminClassesWithStats(schoolId: string) {
  await requireAdmin();
  const supabase = await createClient();

  const [
    { data: school, error: schoolErr },
    { data: students, error: studentErr }
  ] = await Promise.all([
    supabase
      .from("schools")
      .select("name")
      .eq("id", schoolId)
      .eq("is_active", true)
      .single(),
    supabase
      .from("students")
      .select("class_name")
      .eq("school_id", schoolId)
      .eq("is_active", true),
  ]);

  if (schoolErr || !school) throw new Error("School not found or inactive");
  if (studentErr) throw new Error("Failed to fetch students");

  const classCounts: Record<string, number> = {};
  for (const s of students) {
    const cls = s.class_name?.trim();
    if (!cls) continue;
    classCounts[cls] = (classCounts[cls] || 0) + 1;
  }

  const classes = Object.keys(classCounts).map(className => ({
    className,
    studentCount: classCounts[className]
  }));

  classes.sort((a, b) => {
    const idxA = STANDARD_CLASSES.indexOf(a.className);
    const idxB = STANDARD_CLASSES.indexOf(b.className);
    if (idxA === -1 && idxB === -1) return a.className.localeCompare(b.className);
    if (idxA === -1) return 1;
    if (idxB === -1) return -1;
    return idxA - idxB;
  });

  return { schoolName: school.name, classes };
}


export async function getAdminStudents(params: {
  search?: string;
  school_id?: string;
  class_name?: string;
  section?: string;
  gender?: string;
  size_status?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) {
  await requireAdmin();
  const supabase = await createClient();

  const page = params.page || 1;
  const limit = params.limit || 50;
  const offset = (page - 1) * limit;

  let query = supabase
    .from("students")
    .select(`
      id,
      student_name,
      admission_number,
      class_name,
      section,
      gender,
      created_at,
      school_id,
      schools!inner ( id, name ),
      student_uniform_sizes (
        id,
        is_complete
      )
    `, { count: "exact" });

  if (params.search) {
    query = query.or(`student_name.ilike.%${params.search}%,admission_number.ilike.%${params.search}%`);
  }
  if (params.school_id && params.school_id !== "all") {
    query = query.eq("school_id", params.school_id);
  }
  if (params.class_name && params.class_name !== "all") {
    query = query.eq("class_name", params.class_name);
  }
  if (params.section && params.section !== "all") {
    query = query.eq("section", params.section);
  }
  if (params.gender && params.gender !== "all") {
    query = query.eq("gender", params.gender);
  }

  // To support JS sorting/filtering of classes and status accurately for pagination,
  // we might need to fetch more if those filters/sorts are applied, but for now we'll fetch paginated
  // and do JS transforms on the current page unless limit is large.
  query = query.range(offset, offset + limit - 1);

  if (params.sortBy && params.sortOrder) {
    if (params.sortBy !== 'class_name' && params.sortBy !== 'sizeStatus' && params.sortBy !== 'name') {
       query = query.order(params.sortBy, { ascending: params.sortOrder === 'asc' });
    }
  } else {
    query = query.order("student_name", { ascending: true });
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("Error fetching admin students:", error);
    throw new Error("Failed to fetch students");
  }

  let mappedStudents = (data as unknown[]).map((row) => {
    const s = row as {
      id: string;
      student_name: string;
      admission_number: string;
      class_name: string;
      section: string;
      gender: string;
      created_at: string;
      school_id: string;
      schools: { name: string } | { name: string }[] | null;
      student_uniform_sizes: { is_complete?: boolean }[] | { is_complete?: boolean } | null;
    };
    let sizeStatus = "NOT STARTED";
    let isComplete = false;
    
    const sizeRecord = Array.isArray(s.student_uniform_sizes) 
      ? (s.student_uniform_sizes.length > 0 ? s.student_uniform_sizes[0] : null) 
      : (s.student_uniform_sizes || null);

    if (sizeRecord) {
      isComplete = !!sizeRecord.is_complete;
      sizeStatus = isComplete ? "COMPLETE" : "PENDING";
    }

    return {
      id: s.id,
      student_name: s.student_name,
      admission_number: s.admission_number,
      class_name: s.class_name?.trim() || "",
      section: s.section,
      gender: s.gender,
      created_at: s.created_at,
      school_name: Array.isArray(s.schools) ? (s.schools[0]?.name || "Unknown") : (s.schools?.name || "Unknown"),
      school_id: s.school_id,
      sizeStatus,
      isComplete
    };
  });

  if (params.size_status && params.size_status !== "all") {
     const statusUpper = params.size_status.replace("_", " ").toUpperCase();
     mappedStudents = mappedStudents.filter(s => s.sizeStatus === statusUpper);
  }

  if (params.sortBy === 'class_name') {
     mappedStudents.sort((a, b) => {
       const idxA = STANDARD_CLASSES.indexOf(a.class_name);
       const idxB = STANDARD_CLASSES.indexOf(b.class_name);
       const order = params.sortOrder === 'asc' ? 1 : -1;
       if (idxA === -1 && idxB === -1) return a.class_name.localeCompare(b.class_name) * order;
       if (idxA === -1) return 1 * order;
       if (idxB === -1) return -1 * order;
       return (idxA - idxB) * order;
     });
  } else if (params.sortBy === 'sizeStatus') {
     mappedStudents.sort((a, b) => {
       const order = params.sortOrder === 'asc' ? 1 : -1;
       return a.sizeStatus.localeCompare(b.sizeStatus) * order;
     });
  } else if (params.sortBy === 'school_name') {
      mappedStudents.sort((a, b) => {
       const order = params.sortOrder === 'asc' ? 1 : -1;
       return a.school_name.localeCompare(b.school_name) * order;
     });
  }

  return { students: mappedStudents, count: count || 0 };
}

export async function getAdminStudentDetails(studentId: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select(`
      id,
      student_name,
      admission_number,
      class_name,
      section,
      gender,
      created_at,
      school_id,
      schools ( name ),
      student_uniform_sizes (
        id,
        uniform_type,
        shirt_size,
        tshirt_size,
        pant_size,
        short_size,
        dynamic_sizes,
        dynamic_styles,
        is_complete,
        created_at,
        updated_at
      )
    `)
    .eq("id", studentId)
    .single();

  if (studentError || !student) {
    throw new Error("Failed to fetch student details");
  }

  const sizeRecord = Array.isArray(student.student_uniform_sizes) 
      ? (student.student_uniform_sizes.length > 0 ? student.student_uniform_sizes[0] : null) 
      : (student.student_uniform_sizes || null);

  const { data: activeStylesData, error: stylesError } = await supabase
    .from("uniform_styles")
    .select(`
      id,
      style_name,
      item_name,
      gender,
      available_sizes,
      is_required,
      sort_order,
      is_active,
      classes:uniform_style_classes (
        class_name
      ),
      colors:uniform_style_colors (
        class_name,
        color_name,
        is_active
      )
    `)
    .eq("school_id", student.school_id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("item_name", { ascending: true })
    .order("style_name", { ascending: true });

  if (stylesError) {
    console.error("Error fetching styles in getAdminStudentDetails:", stylesError);
  }

  const rawStyles = activeStylesData || [];

  const activeStyles: ActiveStyleItem[] = rawStyles.map((st) => ({
    id: st.id,
    style_name: st.style_name,
    item_name: st.item_name,
    gender: st.gender,
    classes: ((st.classes as { class_name: string }[]) || []).map((c) => c.class_name),
    available_sizes: st.available_sizes || [],
    is_required: st.is_required ?? true,
    sort_order: st.sort_order ?? 0,
    colors: ((st.colors as { class_name: string; color_name: string; is_active?: boolean }[]) || [])
      .filter((c) => c.is_active !== false)
      .map((c) => ({
        class_name: c.class_name,
        color_name: c.color_name,
        is_active: c.is_active,
      })),
  }));

  const applicableStyles = activeStyles.filter((st) => {
    const classMatch = st.classes.includes(student.class_name?.trim() || "");
    const genderMatch =
      !st.gender ||
      st.gender === "All" ||
      st.gender.toLowerCase() === (student.gender || "Male").toLowerCase();
    return classMatch && genderMatch;
  });

  const activeItems: ConfigItem[] = applicableStyles.map((st) => ({
    id: st.id,
    item_name: `${st.item_name} (${st.style_name})`,
    available_sizes: st.available_sizes || [],
    is_required: st.is_required ?? true,
    sort_order: st.sort_order ?? 0,
    is_active: true,
  }));

  // Centralized academic year resolution
  const activeAcademicYear = await getActiveAcademicYear(supabase);
  const previousAcademicYear = getPreviousAcademicYear(activeAcademicYear);

  // Fetch actual historical size records for this student
  const { data: rawHistory, error: historyError } = await supabase
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
      updated_at
    `)
    .eq("student_id", studentId)
    .order("academic_year", { ascending: true });

  if (historyError) {
    console.error("Error fetching size history in getAdminStudentDetails:", historyError);
  }

  const sizeHistory: SizeHistoryEntry[] = (rawHistory || []).sort((a, b) =>
    compareAcademicYears(a.academic_year, b.academic_year)
  );

  // Derive Last Year Size map from the previous academic year's actual collected records
  // Must distinguish exact item + style so different items or styles never mix
  const lastYearSizes: LastYearSizesMap = {};
  sizeHistory
    .filter((h) => h.academic_year === previousAcademicYear)
    .forEach((h) => {
      const itemKey = h.item_name ? h.item_name.trim().toLowerCase() : "";
      if (itemKey && h.style_id) {
        lastYearSizes[`${itemKey}__${h.style_id}`] = h.size;
      }
      if (itemKey && h.style_name) {
        lastYearSizes[`${itemKey}__${h.style_name.trim().toLowerCase()}`] = h.size;
      }
      if (h.style_id) {
        lastYearSizes[h.style_id] = h.size;
      }
    });

  return { 
    student: {
      ...student,
      school_name: (student.schools as { name?: string } | null)?.name || "Unknown",
    }, 
    sizeRecord, 
    activeStyles,
    applicableStyles,
    lastYearSizes,
    sizeHistory,
    activeAcademicYear,
    previousAcademicYear,
    config: activeItems.length > 0 ? { id: "styles-config", items: activeItems } : null 
  };
}

export async function saveAdminStudentSizes(data: SizeCollectionFormValues) {
  try {
    await requireAdmin();
    const supabase = await createClient();

    const result = await saveStudentSizesCore({
      supabase,
      data,
    });

    if (result.error) {
      return { error: result.error };
    }

    revalidatePath("/admin/students");
    
    return { success: true };
  } catch (err) {
    console.error("Error in saveAdminStudentSizes:", err);
    return { error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}
