"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSchoolAdmin } from "@/lib/auth/server";
import { sizeCollectionSchema, SizeCollectionFormValues, StudentWithSize } from "./schema";
import { UNIFORM_TYPES } from "@/lib/constants/uniformSizes";
import { revalidatePath } from "next/cache";

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

export async function getStudentSizes(): Promise<{ students: StudentWithSize[], allConfigs: AllConfigItem[] }> {
  const adminProfile = await requireSchoolAdmin();
  const supabase = await createClient();

  const [studentsRes, configsRes] = await Promise.all([
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
          uniform_type,
          shirt_size,
          tshirt_size,
          pant_size,
          short_size,
          dynamic_sizes,
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
      .from("school_uniform_configurations")
      .select(`
        id,
        gender,
        items:school_uniform_configuration_items (
          id,
          item_name,
          available_sizes,
          is_required,
          sort_order,
          is_active
        ),
        classes:school_uniform_configuration_classes (
          class_name
        )
      `)
      .eq("school_id", adminProfile.school_id)
      .eq("is_active", true),
  ]);

  if (studentsRes.error) {
    console.error("Error fetching student sizes:", JSON.stringify(studentsRes.error));
    throw new Error("Failed to fetch student sizes");
  }

  const students = studentsRes.data || [];
  const configs = configsRes.data || [];

  const mappedStudents = students.map((s) => ({
    id: s.id,
    student_name: s.student_name,
    class_name: s.class_name?.trim() || "",
    section: s.section,
    admission_number: s.admission_number,
    gender: s.gender,
    size_record: Array.isArray(s.student_uniform_sizes) 
      ? (s.student_uniform_sizes.length > 0 ? s.student_uniform_sizes[0] : null) 
      : (s.student_uniform_sizes || null)
  }));

  // We need to provide the configurations dynamically based on gender AND class.
  // We'll return an array of configurations with their target classes, so the UI can resolve per student.
  const allConfigs = (configs || []).map(config => ({
    id: config.id, // keeping id temporarily for logging
    gender: config.gender,
    classes: (config.classes as { class_name: string }[]).map(c => c.class_name),
    items: ((config.items as ConfigItem[]) || [])
      .filter(item => item.is_active !== false)
      .sort((a, b) => a.sort_order - b.sort_order)
  }));



  // Remove the `id` from allConfigs before returning to match expected type
  const cleanConfigs = allConfigs.map(c => ({
    gender: c.gender,
    classes: c.classes,
    items: c.items
  }));

  return { students: mappedStudents, allConfigs: cleanConfigs };
}

export async function saveStudentSizes(data: SizeCollectionFormValues): Promise<{ error?: string }> {
  try {
    const adminProfile = await requireSchoolAdmin();
    const supabase = await createClient();

    const validatedData = sizeCollectionSchema.parse(data);

    // Verify student belongs to this school
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("school_id, gender, class_name")
      .eq("id", validatedData.student_id)
      .single();

    if (studentError || !student) {
      return { error: "Student not found" };
    }

    if (student.school_id !== adminProfile.school_id) {
      return { error: "Unauthorized access to student" };
    }

    // Fetch the specific active configuration for this student's gender and class
    const { data: configRows } = await supabase
      .from("school_uniform_configurations")
      .select(`
        id,
        items:school_uniform_configuration_items (
          id,
          item_name,
          available_sizes,
          is_required,
          is_active,
          sort_order
        ),
        classes:school_uniform_configuration_classes!inner (
          class_name
        )
      `)
      .eq("school_id", adminProfile.school_id)
      .eq("gender", student.gender || "Male")
      .eq("is_active", true)
      .eq("school_uniform_configuration_classes.class_name", student.class_name || "");

    const config = (configRows && configRows.length > 0) ? configRows[0] : null;

    if (!config?.items || config.items.length === 0) {
      return { error: "No uniform configuration is available for this class." };
    }

    let is_complete = false;
    const dynamic_sizes = validatedData.dynamic_sizes || {};

    let allRequiredFilled = true;
    const activeItems = (config.items as ConfigItem[]).filter(i => i.is_active !== false);
    
    for (const item of activeItems) {
      const itemVal = dynamic_sizes[item.id];
      
      // Validation check for available sizes
      if (itemVal && item.available_sizes.length > 0 && !item.available_sizes.includes(itemVal as string)) {
        return { error: `Invalid size '${itemVal}' for item '${item.item_name}'` };
      }

      if (item.is_required && !itemVal) {
        allRequiredFilled = false;
      }
    }
    is_complete = allRequiredFilled;

    // Use default 'regular' type if it wasn't provided, to satisfy DB constraint if any
    const uniform_type = validatedData.uniform_type || UNIFORM_TYPES.REGULAR;
    const shirt_size = validatedData.shirt_size || null;
    const tshirt_size = validatedData.tshirt_size || null;
    const pant_size = validatedData.pant_size || null;
    const short_size = validatedData.short_size || null;

    // Upsert using the unique student_id constraint
    const { error: upsertError } = await supabase
      .from("student_uniform_sizes")
      .upsert({
        student_id: validatedData.student_id,
        school_id: adminProfile.school_id,
        uniform_type,
        shirt_size,
        tshirt_size,
        pant_size,
        short_size,
        dynamic_sizes,
        is_complete
      }, {
        onConflict: "student_id"
      });

    if (upsertError) {
      console.error("Error saving size:", upsertError);
      return { error: "Failed to save student size" };
    }

    revalidatePath("/school/sizes");
    revalidatePath("/school");
    
    return {};
  } catch (err) {
    console.error("Error in saveStudentSizes:", err);
    return { error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}

