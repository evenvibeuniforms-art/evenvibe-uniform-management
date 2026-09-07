"use server";

import { requireSchoolAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { SchoolLogo } from "@/types/database";
import { revalidatePath } from "next/cache";
import { v4 as uuidv4 } from "uuid";

export type SchoolLogoResult = {
  logo: SchoolLogo | null;
  signedUrl: string | null;
  error?: string;
};

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

/**
 * Fetch the active school logo for the authenticated school
 */
export async function getSchoolLogo(): Promise<SchoolLogoResult> {
  try {
    const profile = await requireSchoolAdmin();

    if (!profile.school_id) {
      return { logo: null, signedUrl: null, error: "School account not associated with a school." };
    }

    const supabase = await createClient();

    const { data: logo, error: dbError } = await supabase
      .from("school_logos")
      .select("*")
      .eq("school_id", profile.school_id)
      .maybeSingle();

    if (dbError) {
      console.error("[getSchoolLogo] Database error:", dbError.message);
      return { logo: null, signedUrl: null, error: "Failed to fetch school logo." };
    }

    if (!logo) {
      return { logo: null, signedUrl: null };
    }

    // Generate short-lived presigned URL (10 minutes expiry)
    let signedUrl: string | null = null;
    try {
      const { data, error: storageError } = await supabase.storage
        .from("school-logos")
        .createSignedUrl(logo.storage_path, 600);
        
      if (storageError) throw storageError;
      signedUrl = data.signedUrl;
    } catch (storageErr) {
      console.error("[getSchoolLogo] Supabase Storage Signed URL error:", storageErr);
    }

    return {
      logo: logo as SchoolLogo,
      signedUrl,
    };
  } catch (err) {
    console.error("[getSchoolLogo] Error:", err);
    return { logo: null, signedUrl: null, error: "An unexpected error occurred." };
  }
}

/**
 * Upload or replace the school logo
 */
export async function uploadSchoolLogo(formData: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    const profile = await requireSchoolAdmin();
    const schoolId = profile.school_id;

    if (!schoolId) {
      return { success: false, error: "School account not associated with a school." };
    }

    const file = formData.get("file") as File | null;
    if (!file) {
      return { success: false, error: "No file provided." };
    }

    // Server-side validation
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return { success: false, error: "Invalid file type. Only JPEG, PNG, and WebP are allowed." };
    }

    if (file.size > MAX_FILE_SIZE) {
      return { success: false, error: "File exceeds the 2MB size limit." };
    }

    const supabase = await createClient();

    // 1. Determine safe filename and storage path
    const safeFilename = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "").toLowerCase();
    const uniqueId = uuidv4().split('-')[0]; // Use first segment of uuid
    const storagePath = `schools/${schoolId}/logo/${uniqueId}-${safeFilename}`;

    // 2. Upload to Supabase Storage
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from("school-logos")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("[uploadSchoolLogo] Storage upload error:", uploadError);
      return { success: false, error: "Failed to upload file to storage." };
    }

    // 3. Check for existing logo to clean up later
    const { data: existingLogo } = await supabase
      .from("school_logos")
      .select("storage_path")
      .eq("school_id", schoolId)
      .maybeSingle();

    // 4. Upsert metadata
    const { error: dbError } = await supabase
      .from("school_logos")
      .upsert({
        school_id: schoolId,
        storage_path: storagePath,
        original_filename: file.name,
        mime_type: file.type,
        file_size: file.size,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "school_id"
      });

    if (dbError) {
      console.error("[uploadSchoolLogo] Database upsert error:", dbError.message);
      // Attempt cleanup of the newly uploaded file since metadata failed
      await supabase.storage.from("school-logos").remove([storagePath]);
      return { success: false, error: "Failed to save logo metadata." };
    }

    // 5. Cleanup old storage object if it exists
    if (existingLogo && existingLogo.storage_path && existingLogo.storage_path !== storagePath) {
      const { error: cleanupError } = await supabase.storage
        .from("school-logos")
        .remove([existingLogo.storage_path]);
        
      if (cleanupError) {
        console.error("[uploadSchoolLogo] Warning: failed to cleanup old logo storage object:", cleanupError);
      }
    }

    revalidatePath("/school");
    return { success: true };
  } catch (err) {
    console.error("[uploadSchoolLogo] Error:", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}

/**
 * Delete the active school logo
 */
export async function deleteSchoolLogo(): Promise<{ success: boolean; error?: string }> {
  try {
    const profile = await requireSchoolAdmin();
    const schoolId = profile.school_id;

    if (!schoolId) {
      return { success: false, error: "School account not associated with a school." };
    }

    const supabase = await createClient();

    // 1. Get existing logo path
    const { data: existingLogo, error: fetchError } = await supabase
      .from("school_logos")
      .select("storage_path")
      .eq("school_id", schoolId)
      .maybeSingle();

    if (fetchError) {
      return { success: false, error: "Failed to fetch logo details." };
    }

    if (!existingLogo) {
      return { success: true }; // Nothing to delete
    }

    // 2. Delete from storage
    const { error: storageError } = await supabase.storage
      .from("school-logos")
      .remove([existingLogo.storage_path]);

    if (storageError) {
      console.error("[deleteSchoolLogo] Storage remove error:", storageError);
      return { success: false, error: "Failed to delete file from storage." };
    }

    // 3. Delete metadata
    const { error: dbError } = await supabase
      .from("school_logos")
      .delete()
      .eq("school_id", schoolId);

    if (dbError) {
      console.error("[deleteSchoolLogo] Database delete error:", dbError.message);
      return { success: false, error: "Failed to remove logo metadata." };
    }

    revalidatePath("/school");
    return { success: true };
  } catch (err) {
    console.error("[deleteSchoolLogo] Error:", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}
