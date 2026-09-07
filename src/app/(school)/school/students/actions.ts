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
    
    // 2. Validate input
    const validatedData = studentSchema.parse(data);
    
    // Normalize fields
    const class_name = (validatedData.class_name || "").replace(/\s+/g, ' ').trim();
    const section = (validatedData.section || "").replace(/\s+/g, ' ').trim().toUpperCase();
    const roll_number = (validatedData.roll_number || "").trim();

    const supabase = await createClient();

    // 3. Check for duplicates
    const { data: existing } = await supabase
      .from("students")
      .select("id")
      .eq("school_id", profile.school_id)
      .eq("class_name", class_name)
      .eq("section", section)
      .eq("roll_number", roll_number)
      .single();

    if (existing) {
      return { success: false, error: `Roll number ${roll_number} already exists in Class ${class_name} - Section ${section}.` };
    }
    
    // 4. Insert student using secure server-side school_id
    const { error } = await supabase
      .from("students")
      .insert({
        ...validatedData,
        class_name,
        section,
        roll_number,
        school_id: profile.school_id, // CRITICAL: strictly derived from secure profile
        date_of_birth: validatedData.date_of_birth || null,
      });

    if (error) {
      console.error("Error creating student:", error);
      if (error.code === '23505') {
         return { success: false, error: `Roll number ${roll_number} already exists in Class ${class_name} - Section ${section}.` };
      }
      return { success: false, error: "Failed to create student. Please try again." };
    }

    revalidatePath("/school/students");
    revalidatePath("/school");
    return { success: true };
  } catch (err) {
    console.error("Error in createStudent:", err);
    if (err instanceof z.ZodError) {
      return { success: false, error: "Validation failed." };
    }
    return { success: false, error: "An unexpected error occurred." };
  }
}

export async function updateStudent(id: string, data: StudentFormValues) {
  try {
    // 1. Verify authenticated user and role
    const profile = await requireSchoolAdmin();
    
    // 2. Validate input
    const validatedData = studentSchema.parse(data);
    
    // Normalize fields
    const class_name = (validatedData.class_name || "").replace(/\s+/g, ' ').trim();
    const section = (validatedData.section || "").replace(/\s+/g, ' ').trim().toUpperCase();
    const roll_number = (validatedData.roll_number || "").trim();

    const supabase = await createClient();

    // 3. Check for duplicates (excluding current student)
    const { data: existing } = await supabase
      .from("students")
      .select("id")
      .eq("school_id", profile.school_id)
      .eq("class_name", class_name)
      .eq("section", section)
      .eq("roll_number", roll_number)
      .neq("id", id)
      .maybeSingle();

    if (existing) {
      return { success: false, error: `Roll number ${roll_number} already exists in Class ${class_name} - Section ${section}.` };
    }
    
    // 4. Update student (RLS strictly limits to school_id match)
    const { error } = await supabase
      .from("students")
      .update({
        ...validatedData,
        class_name,
        section,
        roll_number,
        date_of_birth: validatedData.date_of_birth || null,
      })
      .eq("id", id)
      .eq("school_id", profile.school_id); // Double protection with query scoping

    if (error) {
      console.error("Error updating student:", error);
      if (error.code === '23505') {
         return { success: false, error: `Roll number ${roll_number} already exists in Class ${class_name} - Section ${section}.` };
      }
      return { success: false, error: "Failed to update student. Please try again." };
    }

    revalidatePath("/school/students");
    return { success: true };
  } catch (err) {
    console.error("Error in updateStudent:", err);
    if (err instanceof z.ZodError) {
      return { success: false, error: "Validation failed." };
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
