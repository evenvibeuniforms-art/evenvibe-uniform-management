"use server";

import { requireSchoolAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { excelStudentRowSchema, ParsedStudentRow } from "./schema";

export async function checkDuplicateAdmissionNumbers(admissionNumbers: string[]) {
  try {
    const profile = await requireSchoolAdmin();
    
    if (admissionNumbers.length === 0) {
      return { success: true, duplicates: [] };
    }

    const supabase = await createClient();
    // Fetch all students for the school to check duplicates efficiently
    const { data, error } = await supabase
      .from("students")
      .select("admission_number")
      .eq("school_id", profile.school_id);

    if (error) {
      console.error("Error checking duplicates:", error);
      return { success: false, error: "Database error while checking duplicates" };
    }

    const existingAdmSet = new Set(data.filter(d => d.admission_number).map(d => d.admission_number));
    
    const duplicates = admissionNumbers.filter(adm => existingAdmSet.has(adm));
    
    return { success: true, duplicates };
  } catch (err) {
    console.error("Error in checkDuplicateAdmissionNumbers:", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function bulkCreateStudents(students: ParsedStudentRow[]) {
  try {
    const profile = await requireSchoolAdmin();
    
    // Server-side re-validation
    const validRowsToInsert = [];
    const admCombinationsToCheck = new Set<string>();

    for (const row of students) {
      // 1. Zod Validation
      const parseResult = excelStudentRowSchema.safeParse({
        student_name: row.student_name,
        admission_number: row.admission_number,
        class_name: row.class_name,
        section: row.section,
        gender: row.gender,
      });

      if (parseResult.success) {
        const normAdm = parseResult.data.admission_number.trim();
        const normClass = parseResult.data.class_name.replace(/\s+/g, ' ').trim();
        const normSection = parseResult.data.section.replace(/\s+/g, ' ').trim().toUpperCase();
        
        validRowsToInsert.push({
          ...parseResult.data,
          admission_number: normAdm,
          class_name: normClass,
          section: normSection
        });
        admCombinationsToCheck.add(normAdm);
      }
    }

    if (validRowsToInsert.length === 0) {
      return { success: false, error: "No valid rows to insert after server validation" };
    }

    // 2. Database duplicate check
    if (admCombinationsToCheck.size > 0) {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("students")
        .select("admission_number")
        .eq("school_id", profile.school_id);

      if (error) {
        console.error("Error verifying duplicates before insert:", error);
        return { success: false, error: "Database error during final validation" };
      }

      const existingAdmSet = new Set(data.filter(d => d.admission_number).map(d => d.admission_number));
      
      // Filter out those that already exist
      for (let i = validRowsToInsert.length - 1; i >= 0; i--) {
        const row = validRowsToInsert[i];
        if (existingAdmSet.has(row.admission_number)) {
          validRowsToInsert.splice(i, 1);
        }
      }
    }

    if (validRowsToInsert.length === 0) {
      return { success: false, error: "All provided rows were duplicates" };
    }

    // 3. Inject secure school_id
    const finalInsertData = validRowsToInsert.map(row => ({
      ...row,
      school_id: profile.school_id,
      is_active: true
    }));

    // 4. Bulk Insert
    const supabase = await createClient();
    const { error: insertError } = await supabase
      .from("students")
      .insert(finalInsertData);

    if (insertError) {
      console.error("Bulk insert error:", insertError);
      // Try to determine if it's a unique constraint violation on our new constraint
      if (insertError.code === '23505') {
         return { success: false, error: "A concurrent import caused a duplicate admission number conflict. Please review your data." };
      }
      return { success: false, error: "Database error during insertion." };
    }

    revalidatePath("/school/students");
    revalidatePath("/school");
    
    return { 
      success: true, 
      importedCount: finalInsertData.length,
      skippedCount: students.length - finalInsertData.length
    };
  } catch (err) {
    console.error("Error in bulkCreateStudents:", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}
