"use server";

import { requireSchoolAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { STANDARD_CLASSES } from "@/lib/constants/classes";
import { UniformStyleWithDetails } from "@/types/database";

/**
 * Fetch all active uniform styles for the authenticated school admin.
 * School-specific isolation is strictly enforced via profile.school_id and RLS.
 */
export async function getSchoolUniformStyles(): Promise<{
  styles: UniformStyleWithDetails[];
  schoolName?: string;
  error?: string;
}> {
  try {
    const profile = await requireSchoolAdmin();
    if (!profile.school_id) {
      return { styles: [], error: "School profile not found." };
    }

    const supabase = await createClient();

    const [{ data: schoolData }, { data: rawStyles, error: dbError }] = await Promise.all([
      supabase.from("schools").select("name").eq("id", profile.school_id).single(),
      supabase
        .from("uniform_styles")
        .select(`
          id,
          school_id,
          style_name,
          item_name,
          gender,
          is_active,
          available_sizes,
          is_required,
          sort_order,
          description,
          created_at,
          updated_at,
          uniform_style_classes (
            class_name
          ),
          uniform_style_colors (
            id,
            style_id,
            class_name,
            color_name,
            sort_order,
            is_active,
            created_at,
            updated_at
          ),
          uniform_style_images (
            id,
            style_id,
            storage_path,
            original_filename,
            mime_type,
            file_size,
            sort_order,
            created_at
          )
        `)
        .eq("school_id", profile.school_id)
        .eq("is_active", true)
        .order("created_at", { ascending: false }),
    ]);

    if (dbError) {
      console.error("[getSchoolUniformStyles] Database error:", {
        message: dbError.message,
        details: dbError.details,
        hint: dbError.hint,
        code: dbError.code,
      });
      return { styles: [], error: "Failed to load uniform styles." };
    }

    if (!rawStyles || rawStyles.length === 0) {
      return { styles: [], schoolName: schoolData?.name };
    }

    // Collect all storage paths to generate presigned URLs in batch
    const imagePathMap = new Map<string, string>();
    const allPaths: string[] = [];

    rawStyles.forEach((s) => {
      const imgs = (s.uniform_style_images as { storage_path: string }[]) || [];
      imgs.forEach((img) => {
        if (img.storage_path) {
          allPaths.push(img.storage_path);
        }
      });
    });

    if (allPaths.length > 0) {
      try {
        const { data: signedData, error: signedError } = await supabase.storage
          .from("uniform-designs")
          .createSignedUrls(allPaths, 3600);

        if (!signedError && signedData) {
          signedData.forEach((item) => {
            if (item.signedUrl && item.path) {
              imagePathMap.set(item.path, item.signedUrl);
            }
          });
        }
      } catch (err) {
        console.warn("[getSchoolUniformStyles] Signed URLs batch warning:", err);
      }
    }

    const formattedStyles: UniformStyleWithDetails[] = rawStyles.map((s) => {
      const classes = ((s.uniform_style_classes as { class_name: string }[]) || [])
        .map((c) => c.class_name)
        .sort((a, b) => {
          const idxA = STANDARD_CLASSES.indexOf(a);
          const idxB = STANDARD_CLASSES.indexOf(b);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          return a.localeCompare(b);
        });

      const rawImages = (s.uniform_style_images as {
        id: string;
        style_id: string;
        storage_path: string;
        original_filename: string | null;
        mime_type: string;
        file_size: number;
        sort_order: number;
        created_at: string;
      }[]) || [];

      const images = rawImages
        .map((img) => ({
          ...img,
          signed_url: imagePathMap.get(img.storage_path),
        }))
        .sort((a, b) => a.sort_order - b.sort_order);

      const rawColors = ((s as unknown as { uniform_style_colors: UniformStyleWithDetails["colors"] }).uniform_style_colors || []);
      const colors = [...rawColors].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.color_name.localeCompare(b.color_name));

      return {
        id: s.id,
        school_id: s.school_id,
        style_name: s.style_name,
        item_name: s.item_name,
        gender: s.gender as 'Male' | 'Female' | 'All' | null,
        is_active: s.is_active,
        available_sizes: (s as unknown as { available_sizes: string[] }).available_sizes || [],
        is_required: (s as unknown as { is_required: boolean }).is_required ?? true,
        sort_order: (s as unknown as { sort_order: number }).sort_order ?? 0,
        description: (s as unknown as { description: string | null }).description || null,
        created_at: s.created_at,
        updated_at: s.updated_at,
        classes,
        images,
        colors,
        schools: schoolData ? { id: profile.school_id, name: schoolData.name } : null,
      };
    });

    return { styles: formattedStyles, schoolName: schoolData?.name };
  } catch (err) {
    console.error("[getSchoolUniformStyles] Error:", err);
    return { styles: [], error: "An unexpected error occurred loading styles." };
  }
}
