"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSchoolAdmin } from "@/lib/auth/server";
import { SizeCollectionFormValues, StudentWithSize, SizeHistoryEntry, LastYearSizesMap } from "./schema";
import { revalidatePath } from "next/cache";
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

export type SchoolConfig = {
  Male: ConfigItem[];
  Female: ConfigItem[];
};

export type AllConfigItem = {
  gender: string;
  classes: string[];
  items: ConfigItem[];
};

export type ActiveStyleItem = {
  id: string;
  style_name: string;
  item_name: string;
  gender: string | null;
  classes: string[];
  available_sizes: string[];
  is_required: boolean;
  sort_order: number;
  colors?: { class_name: string; color_name: string; is_active?: boolean }[];
};

export async function getStudentSizes(): Promise<{
  students: StudentWithSize[];
  allConfigs: AllConfigItem[];
  activeStyles: ActiveStyleItem[];
  activeAcademicYear?: string;
  previousAcademicYear?: string;
}> {
  const adminProfile = await requireSchoolAdmin();
  const supabase = await createClient();

  const activeAcademicYear = await getActiveAcademicYear(supabase);
  const previousAcademicYear = getPreviousAcademicYear(activeAcademicYear);

  const [studentsRes, stylesRes, historyRes] = await Promise.all([
    supabase
      .from("students")
      .select(`
        id,
        student_name,
        class_name,
        section,
        admission_number,
        gender,
        student_uniform_sizes (
          id,
          student_id,
          school_id,
          academic_year,
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
      .eq("school_id", adminProfile.school_id)
      .order("class_name")
      .order("section")
      .order("admission_number"),
    supabase
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
      .eq("school_id", adminProfile.school_id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("item_name", { ascending: true })
      .order("style_name", { ascending: true }),
    supabase
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
      .eq("school_id", adminProfile.school_id)
      .order("academic_year", { ascending: true }),
  ]);

  if (studentsRes.error) {
    console.error("Error fetching student sizes:", JSON.stringify(studentsRes.error));
    throw new Error("Failed to fetch student sizes");
  }

  if (historyRes.error) {
    console.error("Error fetching school size history:", JSON.stringify(historyRes.error));
  }

  const students = studentsRes.data || [];
  const rawStyles = stylesRes.data || [];
  const rawHistory = historyRes.data || [];

  const historyByStudent = new Map<string, SizeHistoryEntry[]>();
  rawHistory.forEach((h) => {
    if (!historyByStudent.has(h.student_id)) {
      historyByStudent.set(h.student_id, []);
    }
    historyByStudent.get(h.student_id)!.push(h);
  });

  const mappedStudents: StudentWithSize[] = students.map((s) => {
    const studentHistory = (historyByStudent.get(s.id) || []).sort((a, b) =>
      compareAcademicYears(a.academic_year, b.academic_year)
    );
    const lastYearSizes: LastYearSizesMap = {};
    studentHistory
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
      id: s.id,
      student_name: s.student_name,
      class_name: s.class_name?.trim() || "",
      section: s.section,
      admission_number: s.admission_number,
      gender: s.gender,
      size_record: Array.isArray(s.student_uniform_sizes) 
        ? (s.student_uniform_sizes.length > 0 ? s.student_uniform_sizes[0] : null) 
        : (s.student_uniform_sizes || null),
      last_year_sizes: lastYearSizes,
      size_history: studentHistory,
    };
  });

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

  // Build cleanConfigs directly from activeStyles (the single source of truth)
  const classGenderMap = new Map<string, { gender: string; classes: string[]; items: ConfigItem[] }>();
  activeStyles.forEach((st) => {
    const genders = (!st.gender || st.gender === "All") ? ["Male", "Female"] : [st.gender];
    genders.forEach((g) => {
      st.classes.forEach((cls) => {
        const key = `${g}__${cls}`;
        if (!classGenderMap.has(key)) {
          classGenderMap.set(key, { gender: g, classes: [cls], items: [] });
        }
        const entry = classGenderMap.get(key)!;
        if (!entry.items.some((i) => i.item_name.toLowerCase() === st.item_name.toLowerCase())) {
          entry.items.push({
            id: st.id,
            item_name: st.item_name,
            available_sizes: st.available_sizes,
            is_required: st.is_required,
            sort_order: st.sort_order,
            is_active: true,
          });
        }
      });
    });
  });
  const cleanConfigs: AllConfigItem[] = Array.from(classGenderMap.values());

  return { students: mappedStudents, allConfigs: cleanConfigs, activeStyles };
}

export async function saveStudentSizes(data: SizeCollectionFormValues): Promise<{ error?: string }> {
  try {
    const adminProfile = await requireSchoolAdmin();
    const supabase = await createClient();

    const result = await saveStudentSizesCore({
      supabase,
      data,
      enforceSchoolId: adminProfile.school_id,
    });

    if (result.error) {
      return { error: result.error };
    }

    revalidatePath("/school/sizes");
    revalidatePath("/school");
    
    return {};
  } catch (err) {
    console.error("Error in saveStudentSizes:", err);
    return { error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}


