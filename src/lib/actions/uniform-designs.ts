"use server";

import { requireSchoolAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { SchoolUniformDesign } from "@/types/database";

export type ActiveUniformDesignResult = {
  design: SchoolUniformDesign | null;
  signedUrl: string | null;
  error?: string;
};

/**
 * Server action / function to retrieve the active uniform design for the authenticated school.
 * Enforces tenant isolation: Always derives school_id from authenticated profile. Never accepts school_id or storage_path from client.
 */
export async function getActiveUniformDesign(): Promise<ActiveUniformDesignResult> {
  try {
    const profile = await requireSchoolAdmin();

    if (!profile.school_id) {
      return { design: null, signedUrl: null, error: "School account not associated with a school." };
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
      return { design: null, signedUrl: null, error: "Failed to fetch uniform design." };
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
    }

    return {
      design: design as SchoolUniformDesign,
      signedUrl,
    };
  } catch (err) {
    console.error("[getActiveUniformDesign] Error:", err);
    return { design: null, signedUrl: null, error: "An unexpected error occurred." };
  }
}
