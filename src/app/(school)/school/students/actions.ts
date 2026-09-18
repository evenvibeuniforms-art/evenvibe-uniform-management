"use server";

import { requireSchoolAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { studentSchema, StudentFormValues } from "./schema";

export async function createStudent(data: StudentFormValues) {
  try {
    // 1. Verify authenticated user and role, and retrieve secure school_id
    const profile = await requireSchoolAdmin();
    
    // 2. Strict server-side validation using studentSchema
    const validatedData = studentSchema.parse(data);
    
    const student_name = validatedData.student_name.trim();
    const admission_number = validatedData.admission_number.trim();
    const class_name = validatedData.class_name;
    const section = validatedData.section.trim();
    const gender = validatedData.gender;

    const supabase = await createClient();

    // 3. Check for duplicate admission number within the same school
    const { data: existingAdm } = await supabase
      .from("students")
      .select("id")
      .eq("school_id", profile.school_id)
      .eq("admission_number", admission_number)
      .maybeSingle();

    if (existingAdm) {
      return { success: false, error: `Admission Number ${admission_number} already exists in this school.` };
    }

    // 4. Insert student using secure server-side school_id
    const { error } = await supabase
      .from("students")
      .insert({
        student_name: student_name,
        admission_number: admission_number,
        class_name: class_name,
        section: section,
        gender: gender,
        is_active: validatedData.is_active,
        school_id: profile.school_id, // CRITICAL: strictly derived from secure profile
      });

    if (error) {
      console.error("Error creating student:", error);
      if (error.code === "23505") {
        return { success: false, error: `A duplicate record was detected during insertion.` };
      }
      return { success: false, error: "Failed to create student. Please try again." };
    }

    revalidatePath("/school/students");
    revalidatePath("/school");
    return { success: true };
  } catch (err) {
    console.error("Error in createStudent:", err);
    if (err instanceof z.ZodError) {
      const firstIssue = err.issues[0];
      return { success: false, error: firstIssue?.message || "Validation failed." };
    }
    return { success: false, error: "An unexpected error occurred." };
  }
}

export async function updateStudent(id: string, data: StudentFormValues) {
  try {
    // 1. Verify authenticated user and role
    const profile = await requireSchoolAdmin();
    
    // 2. Strict server-side validation using studentSchema
    const validatedData = studentSchema.parse(data);
    
    const student_name = validatedData.student_name.trim();
    const admission_number = validatedData.admission_number.trim();
    const class_name = validatedData.class_name;
    const section = validatedData.section.trim();
    const gender = validatedData.gender;

    const supabase = await createClient();

    // 3. Check for duplicates (excluding current student) within the same school
    const { data: existingAdm } = await supabase
      .from("students")
      .select("id")
      .eq("school_id", profile.school_id)
      .eq("admission_number", admission_number)
      .neq("id", id)
      .maybeSingle();

    if (existingAdm) {
      return { success: false, error: `Admission Number ${admission_number} already exists in this school.` };
    }

    // 4. Update student (RLS strictly limits to school_id match)
    const { error } = await supabase
      .from("students")
      .update({
        student_name: student_name,
        admission_number: admission_number,
        class_name: class_name,
        section: section,
        gender: gender,
        is_active: validatedData.is_active,
      })
      .eq("id", id)
      .eq("school_id", profile.school_id); // Double protection with query scoping

    if (error) {
      console.error("Error updating student:", error);
      if (error.code === "23505") {
        return { success: false, error: `A duplicate record was detected during update.` };
      }
      return { success: false, error: "Failed to update student. Please try again." };
    }

    revalidatePath("/school/students");
    return { success: true };
  } catch (err) {
    console.error("Error in updateStudent:", err);
    if (err instanceof z.ZodError) {
      const firstIssue = err.issues[0];
      return { success: false, error: firstIssue?.message || "Validation failed." };
    }
    return { success: false, error: "An unexpected error occurred." };
  }
}

export async function deleteStudent(id: string) {
  try {
    // 1. Verify authenticated user and role
    const profile = await requireSchoolAdmin();
    
    // 2. Delete student (RLS protects cross-school deletes)
    const supabase = await createClient();
    const { error } = await supabase
      .from("students")
      .delete()
      .eq("id", id)
      .eq("school_id", profile.school_id); // Double protection with query scoping

    if (error) {
      console.error("Error deleting student:", error);
      return { success: false, error: "Failed to delete student. Please try again." };
    }

    revalidatePath("/school/students");
    revalidatePath("/school");
    return { success: true };
  } catch (err) {
    console.error("Error in deleteStudent:", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}
