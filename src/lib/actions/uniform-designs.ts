"use server";

import { requireAdmin, requireSchoolAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { SchoolUniformDesign } from "@/types/database";
import { revalidatePath } from "next/cache";
import { v4 as uuidv4 } from "uuid";

export type ActiveUniformDesignResult = {
  design: SchoolUniformDesign | null;
  signedUrl: string | null;
  error?: string;
};

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Server action to retrieve the active uniform design for the authenticated school admin.
 */
export async function getActiveUniformDesign(): Promise<ActiveUniformDesignResult> {
  try {
    const profile = await requireSchoolAdmin();

    if (!profile.school_id) {
      return { design: null, signedUrl: null, error: "Unable to load uniform design." };
    }

    const supabase = await createClient();

    const { data: design, error: dbError } = await supabase
      .from("school_uniform_designs")
      .select("*")
      .eq("school_id", profile.school_id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (dbError) {
      console.error("[getActiveUniformDesign] Database error:", dbError.message);
      return { design: null, signedUrl: null, error: "Unable to load uniform design." };
    }

    if (!design) {
      return { design: null, signedUrl: null };
    }

    // Generate short-lived presigned URL (10 minutes expiry)
    let signedUrl: string | null = null;
    try {
      const { data, error: storageError } = await supabase.storage
        .from("uniform-designs")
        .createSignedUrl(design.storage_path, 600);
        
      if (storageError) throw storageError;
      signedUrl = data.signedUrl;
    } catch (storageErr) {
      console.error("[getActiveUniformDesign] Supabase Storage Signed URL error:", storageErr);
      return { design: null, signedUrl: null, error: "Unable to load uniform design." };
    }

    return {
      design: design as SchoolUniformDesign,
      signedUrl,
    };
  } catch (err) {
    console.error("[getActiveUniformDesign] Error:", err);
    return { design: null, signedUrl: null, error: "Unable to load uniform design." };
  }
}

/**
 * Server action to retrieve the uniform design for a specific school (EvenVive Admin view).
 */
export async function getAdminUniformDesign(schoolId: string): Promise<ActiveUniformDesignResult> {
  try {
    await requireAdmin();

    if (!schoolId) {
      return { design: null, signedUrl: null, error: "Unable to load uniform design." };
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(schoolId)) {
      return { design: null, signedUrl: null, error: "Unable to load uniform design." };
    }

    const supabase = await createClient();

    const { data: design, error: dbError } = await supabase
      .from("school_uniform_designs")
      .select("*")
      .eq("school_id", schoolId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (dbError) {
      console.error("[getAdminUniformDesign] Database error:", dbError.message);
      return { design: null, signedUrl: null, error: "Unable to load uniform design." };
    }

    if (!design) {
      return { design: null, signedUrl: null };
    }

    let signedUrl: string | null = null;
    try {
      const { data, error: storageError } = await supabase.storage
        .from("uniform-designs")
        .createSignedUrl(design.storage_path, 600);

      if (storageError) throw storageError;
      signedUrl = data.signedUrl;
    } catch (storageErr) {
      console.error("[getAdminUniformDesign] Supabase Storage Signed URL error:", storageErr);
      return { design: null, signedUrl: null, error: "Unable to load uniform design." };
    }

    return {
      design: design as SchoolUniformDesign,
      signedUrl,
    };
  } catch (err) {
    console.error("[getAdminUniformDesign] Error:", err);
    return { design: null, signedUrl: null, error: "Unable to load uniform design." };
  }
}

/**
 * Server action for EvenVive Admin to upload or replace a school's uniform design.
 */
export async function uploadAdminUniformDesign(formData: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();

    const schoolId = formData.get("schoolId") as string | null;
    if (!schoolId) {
      return { success: false, error: "School identifier is required." };
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(schoolId)) {
      return { success: false, error: "Invalid school identifier." };
    }

    const file = formData.get("file") as File | null;
    if (!file) {
      return { success: false, error: "No file provided." };
    }

    const rawType = (file.type || "").toLowerCase();
    const ext = file.name.split(".").pop()?.toLowerCase();
    const isExtensionAllowed = ext && ["jpg", "jpeg", "png", "webp", "pdf"].includes(ext);

    if (!ALLOWED_MIME_TYPES.includes(rawType) && !isExtensionAllowed) {
      return { success: false, error: "Invalid file type. Only JPEG, PNG, WebP, and PDF are allowed." };
    }

    if (file.size > MAX_FILE_SIZE) {
      return { success: false, error: "File exceeds the 5MB size limit." };
    }

    // Determine normalized contentType
    let normalizedContentType = rawType || "image/jpeg";
    if (rawType === "image/jpg" || rawType === "image/pjpeg" || ext === "jpg" || ext === "jpeg") {
      normalizedContentType = "image/jpeg";
    } else if (rawType === "image/png" || ext === "png") {
      normalizedContentType = "image/png";
    } else if (rawType === "image/webp" || ext === "webp") {
      normalizedContentType = "image/webp";
    } else if (rawType === "application/pdf" || ext === "pdf") {
      normalizedContentType = "application/pdf";
    }

    const designName = (formData.get("designName") as string | null)?.trim() || "Official Uniform Specification";
    const academicYear = (formData.get("academicYear") as string | null)?.trim() || "2026-2027";

    const supabase = await createClient();

    // Verify school exists
    const { data: school, error: schoolCheckError } = await supabase
      .from("schools")
      .select("id")
      .eq("id", schoolId)
      .maybeSingle();

    if (schoolCheckError || !school) {
      return { success: false, error: "School not found." };
    }

    // 1. Fetch existing active designs for this school to clean up later
    const { data: existingDesigns } = await supabase
      .from("school_uniform_designs")
      .select("id, storage_path")
      .eq("school_id", schoolId);

    // 2. Generate unique storage path
    const safeFilename = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "").toLowerCase();
    const uniqueId = uuidv4().split("-")[0];
    const storagePath = `schools/${schoolId}/uniform-design/${uniqueId}-${safeFilename}`;

    // 3. Upload to Supabase Storage
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from("uniform-designs")
      .upload(storagePath, buffer, {
        contentType: normalizedContentType,
        upsert: false,
      });

    if (uploadError) {
      console.error("[uploadAdminUniformDesign] Storage upload error:", uploadError);
      return { success: false, error: "Unable to upload uniform design. Please try again." };
    }

    // 4. Deactivate old designs for this school to avoid unique index violation
    if (existingDesigns && existingDesigns.length > 0) {
      await supabase
        .from("school_uniform_designs")
        .update({ is_active: false })
        .eq("school_id", schoolId);
    }

    // 5. Insert new active design record
    const { error: insertError } = await supabase
      .from("school_uniform_designs")
      .insert({
        school_id: schoolId,
        design_name: designName,
        academic_year: academicYear,
        storage_path: storagePath,
        mime_type: normalizedContentType,
        file_size: file.size,
        original_filename: file.name,
        is_active: true,
      });

    if (insertError) {
      console.error("[uploadAdminUniformDesign] Database insert error:", insertError.message);
      // Clean up newly uploaded file
      await supabase.storage.from("uniform-designs").remove([storagePath]);
      return { success: false, error: "Unable to upload uniform design. Please try again." };
    }

    // 6. Clean up old storage files and inactive records
    if (existingDesigns && existingDesigns.length > 0) {
      const pathsToRemove = existingDesigns
        .map((d) => d.storage_path)
        .filter((p) => p && p !== storagePath);
      if (pathsToRemove.length > 0) {
        await supabase.storage.from("uniform-designs").remove(pathsToRemove);
      }
      await supabase
        .from("school_uniform_designs")
        .delete()
        .eq("school_id", schoolId)
        .eq("is_active", false);
    }

    revalidatePath("/admin/schools");
    revalidatePath(`/admin/schools/${schoolId}`);
    revalidatePath("/school");

    return { success: true };
  } catch (err) {
    console.error("[uploadAdminUniformDesign] Error:", err);
    return { success: false, error: "Unable to upload uniform design. Please try again." };
  }
}

/**
 * Server action for EvenVive Admin to delete a school's uniform design.
 */
export async function deleteAdminUniformDesign(
  schoolId: string,
  designId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();

    if (!schoolId) {
      return { success: false, error: "School identifier is required." };
    }

    const supabase = await createClient();

    // Query design(s) to delete
    let query = supabase.from("school_uniform_designs").select("id, storage_path").eq("school_id", schoolId);
    if (designId) {
      query = query.eq("id", designId);
    }
    const { data: designs, error: fetchError } = await query;

    if (fetchError) {
      console.error("[deleteAdminUniformDesign] Database fetch error:", fetchError.message);
      return { success: false, error: "Unable to delete uniform design." };
    }

    if (!designs || designs.length === 0) {
      return { success: true }; // Nothing to delete
    }

    // Remove from storage
    const storagePaths = designs.map((d) => d.storage_path).filter(Boolean);
    if (storagePaths.length > 0) {
      const { error: storageError } = await supabase.storage.from("uniform-designs").remove(storagePaths);
      if (storageError) {
        console.error("[deleteAdminUniformDesign] Storage remove error:", storageError);
      }
    }

    // Remove from database
    let deleteQuery = supabase.from("school_uniform_designs").delete().eq("school_id", schoolId);
    if (designId) {
      deleteQuery = deleteQuery.eq("id", designId);
    }
    const { error: dbError } = await deleteQuery;

    if (dbError) {
      console.error("[deleteAdminUniformDesign] Database delete error:", dbError.message);
      return { success: false, error: "Unable to delete uniform design." };
    }

    revalidatePath("/admin/schools");
    revalidatePath(`/admin/schools/${schoolId}`);
    revalidatePath("/school");

    return { success: true };
  } catch (err) {
    console.error("[deleteAdminUniformDesign] Error:", err);
    return { success: false, error: "Unable to delete uniform design." };
  }
}
