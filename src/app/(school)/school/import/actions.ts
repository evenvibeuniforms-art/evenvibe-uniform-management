"use server";

import { requireSchoolAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { excelStudentRowSchema, ParsedStudentRow } from "./schema";

export async function checkDuplicateRollNumbers(combinations: { class_name: string, section: string, roll_number: string }[]) {
  try {
    const profile = await requireSchoolAdmin();
    
    if (combinations.length === 0) {
      return { success: true, duplicates: [] };
    }

    const supabase = await createClient();
    // Fetch all students for the school to check duplicates efficiently
    const { data, error } = await supabase
      .from("students")
      .select("class_name, section, roll_number")
      .eq("school_id", profile.school_id);

    if (error) {
      console.error("Error checking duplicates:", error);
      return { success: false, error: "Database error while checking duplicates" };
    }

    const existingSet = new Set(data.map(d => `${d.class_name}-${d.section}-${d.roll_number}`));
    
    const duplicates = combinations.filter(c => existingSet.has(`${c.class_name}-${c.section}-${c.roll_number}`));
    
    return { success: true, duplicates };
  } catch (err) {
    console.error("Error in checkDuplicateRollNumbers:", err);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function bulkCreateStudents(students: ParsedStudentRow[]) {
  try {
    const profile = await requireSchoolAdmin();
    
    // Server-side re-validation
    const validRowsToInsert = [];
    const combinationsToCheck = new Set<string>();

    for (const row of students) {
      // 1. Zod Validation
      const parseResult = excelStudentRowSchema.safeParse({
        student_name: row.student_name,
        class_name: row.class_name,
        section: row.section,
        roll_number: row.roll_number,
        gender: row.gender,
        date_of_birth: row.date_of_birth,
      });

      if (parseResult.success) {
        const normClass = parseResult.data.class_name.replace(/\s+/g, ' ').trim();
        const normSection = parseResult.data.section.replace(/\s+/g, ' ').trim().toUpperCase();
        const normRoll = parseResult.data.roll_number.trim();
        
        validRowsToInsert.push({
          ...parseResult.data,
          class_name: normClass,
          section: normSection,
          roll_number: normRoll
        });
        combinationsToCheck.add(`${normClass}-${normSection}-${normRoll}`);
      }
    }

    if (validRowsToInsert.length === 0) {
      return { success: false, error: "No valid rows to insert after server validation" };
    }

    // 2. Database duplicate check
    if (combinationsToCheck.size > 0) {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("students")
        .select("class_name, section, roll_number")
        .eq("school_id", profile.school_id);

      if (error) {
        console.error("Error verifying duplicates before insert:", error);
        return { success: false, error: "Database error during final validation" };
      }

      const existingSet = new Set(data.map(d => `${d.class_name}-${d.section}-${d.roll_number}`));
      
      // Filter out those that already exist
      for (let i = validRowsToInsert.length - 1; i >= 0; i--) {
        const row = validRowsToInsert[i];
        if (existingSet.has(`${row.class_name}-${row.section}-${row.roll_number}`)) {
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
         return { success: false, error: "A concurrent import caused a duplicate roll number conflict. Please review your data." };
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
