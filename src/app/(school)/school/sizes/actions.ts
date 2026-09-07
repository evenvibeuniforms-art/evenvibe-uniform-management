"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSchoolAdmin } from "@/lib/auth/server";
import { sizeCollectionSchema, SizeCollectionFormValues, StudentWithSize } from "./schema";
import { UNIFORM_TYPES } from "@/lib/constants/uniformSizes";
import { revalidatePath } from "next/cache";

export async function getStudentSizes(): Promise<{ students: StudentWithSize[] }> {
  const adminProfile = await requireSchoolAdmin();
  const supabase = await createClient();

  const { data: students, error } = await supabase
    .from("students")
    .select(`
      id,
      student_name,
      class_name,
      section,
      roll_number,
      student_uniform_sizes (
        id,
        student_id,
        school_id,
        uniform_type,
        shirt_size,
        tshirt_size,
        pant_size,
        short_size,
        is_complete,
        created_at,
        updated_at
      )
    `)
    .eq("school_id", adminProfile.school_id)
    .order("class_name")
    .order("section")
    .order("roll_number");

  if (error) {
    console.error("Error fetching student sizes:", JSON.stringify(error));
    throw new Error("Failed to fetch student sizes");
  }

  const mappedStudents = students.map((s) => ({
    id: s.id,
    student_name: s.student_name,
    class_name: s.class_name,
    section: s.section,
    roll_number: s.roll_number,
    size_record: Array.isArray(s.student_uniform_sizes) 
      ? (s.student_uniform_sizes.length > 0 ? s.student_uniform_sizes[0] : null) 
      : (s.student_uniform_sizes || null)
  }));

  return { students: mappedStudents };
}

export async function saveStudentSizes(data: SizeCollectionFormValues): Promise<{ error?: string }> {
  try {
    const adminProfile = await requireSchoolAdmin();
    const supabase = await createClient();

    const validatedData = sizeCollectionSchema.parse(data);

    // Verify student belongs to this school
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("school_id")
      .eq("id", validatedData.student_id)
      .single();

    if (studentError || !student) {
      return { error: "Student not found" };
    }

    if (student.school_id !== adminProfile.school_id) {
      return { error: "Unauthorized access to student" };
    }

    let shirt_size = validatedData.shirt_size || null;
    let tshirt_size = validatedData.tshirt_size || null;
    const pant_size = validatedData.pant_size || null;
    const short_size = validatedData.short_size || null;

    // Normalize and clear irrelevant fields based on uniform type
    if (validatedData.uniform_type === UNIFORM_TYPES.REGULAR) {
      tshirt_size = null;
    } else if (validatedData.uniform_type === UNIFORM_TYPES.TSHIRT) {
      shirt_size = null;
    }

    // Calculate completion
    let is_complete = false;
    if (validatedData.uniform_type === UNIFORM_TYPES.REGULAR) {
      is_complete = !!(shirt_size && (pant_size || short_size));
    } else if (validatedData.uniform_type === UNIFORM_TYPES.TSHIRT) {
      is_complete = !!(tshirt_size && (pant_size || short_size));
    }

    // Upsert using the unique student_id constraint
    const { error: upsertError } = await supabase
      .from("student_uniform_sizes")
      .upsert({
        student_id: validatedData.student_id,
        school_id: adminProfile.school_id,
        uniform_type: validatedData.uniform_type,
        shirt_size,
        tshirt_size,
        pant_size,
        short_size,
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
