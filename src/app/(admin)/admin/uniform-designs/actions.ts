"use server";

import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { v4 as uuidv4 } from "uuid";
import { STANDARD_CLASSES } from "@/lib/constants/classes";
import { UniformStyleWithDetails } from "@/types/database";

export interface StyleFilterParams {
  schoolId?: string;
  className?: string;
  itemName?: string;
  status?: "all" | "active" | "inactive";
}

/**
 * Fetch all uniform styles for Admin view with optional filters.
 */
export async function getAdminUniformStyles(filters?: StyleFilterParams): Promise<{
  styles: UniformStyleWithDetails[];
  error?: string;
}> {
  try {
    await requireAdmin();
    const supabase = await createClient();

    let query = supabase
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
        schools (
          id,
          name
        ),
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
      .order("created_at", { ascending: false });

    if (filters?.schoolId && filters.schoolId !== "all") {
      query = query.eq("school_id", filters.schoolId);
    }
    if (filters?.itemName && filters.itemName !== "all") {
      query = query.ilike("item_name", filters.itemName.trim());
    }
    if (filters?.status === "active") {
      query = query.eq("is_active", true);
    } else if (filters?.status === "inactive") {
      query = query.eq("is_active", false);
    }

    const { data: rawStyles, error: dbError } = await query;

    if (dbError) {
      console.error("[getAdminUniformStyles] Database error:", dbError.message || dbError, {
        code: dbError.code,
        details: dbError.details,
        hint: dbError.hint,
      });
      return { styles: [], error: "Failed to load uniform styles." };
    }

    if (!rawStyles || rawStyles.length === 0) {
      return { styles: [] };
    }

    // Filter by class_name if specified
    let filteredStyles = rawStyles;
    if (filters?.className && filters.className !== "all") {
      filteredStyles = rawStyles.filter((s) => {
        const clsList = (s.uniform_style_classes as { class_name: string }[]) || [];
        return clsList.some((c) => c.class_name === filters.className);
      });
    }

    // Collect all storage paths to generate presigned URLs in batch
    const imagePathMap = new Map<string, string>();
    const allPaths: string[] = [];

    filteredStyles.forEach((s) => {
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
        console.warn("[getAdminUniformStyles] Signed URLs batch warning:", err);
      }
    }

    const formattedStyles: UniformStyleWithDetails[] = filteredStyles.map((s) => {
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
      const schoolObj = Array.isArray(s.schools) ? s.schools[0] : s.schools;
      const schoolInfo = schoolObj as unknown as { id: string; name: string } | null;

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
        schools: schoolInfo ? { id: schoolInfo.id, name: schoolInfo.name } : null,
      };
    });

    return { styles: formattedStyles };
  } catch (err) {
    console.error("[getAdminUniformStyles] Error:", err);
    return { styles: [], error: "An unexpected error occurred loading styles." };
  }
}

const STANDARD_UNIFORM_ITEMS = [
  "Shirt",
  "Pant",
  "T-Shirt",
  "Skirt",
  "Salwar",
  "Kameez",
  "Duppatta",
  "Tie",
  "Belt",
  "Socks",
  "Blazer",
  "Sweater",
  "Track Pant",
  "House T-Shirt",
];

/**
 * Fetch dynamic uniform item names available for a specific school.
 */
export async function getSchoolConfiguredItems(schoolId: string): Promise<string[]> {
  try {
    await requireAdmin();
    const supabase = await createClient();

    const itemNames = new Set<string>(STANDARD_UNIFORM_ITEMS);

    // Fetch items already defined in uniform_styles for this school
    const { data: styles } = await supabase
      .from("uniform_styles")
      .select("item_name")
      .eq("school_id", schoolId);

    (styles || []).forEach((st) => {
      if (st.item_name && st.item_name.trim()) {
        itemNames.add(st.item_name.trim());
      }
    });

    return Array.from(itemNames).sort((a, b) => a.localeCompare(b));
  } catch (err) {
    console.error("[getSchoolConfiguredItems] Error:", err);
    return STANDARD_UNIFORM_ITEMS;
  }
}

/**
 * Create a new uniform style with multiple images and class range.
 */
export async function createUniformStyle(formData: FormData): Promise<{
  success?: boolean;
  styleId?: string;
  error?: string;
}> {
  try {
    await requireAdmin();
    const supabase = await createClient();

    const schoolId = (formData.get("school_id") as string)?.trim();
    const styleName = (formData.get("style_name") as string)?.trim();
    const itemName = (formData.get("item_name") as string)?.trim();
    const gender = ((formData.get("gender") as string)?.trim() || "All") as "Male" | "Female" | "All";
    const isRequired = formData.get("is_required") !== "false";
    const availableSizesJson = formData.get("available_sizes") as string;
    const classesJson = formData.get("classes") as string;
    const images = formData.getAll("images") as File[];

    if (!schoolId) return { error: "Please select a school." };

    // Verify school exists
    const { data: schoolCheck } = await supabase
      .from("schools")
      .select("id")
      .eq("id", schoolId)
      .maybeSingle();

    if (!schoolCheck) {
      return { error: "Selected school does not exist." };
    }

    if (!styleName) return { error: "Style name is required." };
    if (!itemName) return { error: "Item name is required." };

    let availableSizes: string[] = [];
    try {
      if (availableSizesJson) {
        availableSizes = JSON.parse(availableSizesJson);
      }
    } catch {
      availableSizes = [];
    }

    let targetClasses: string[] = [];
    try {
      targetClasses = JSON.parse(classesJson || "[]");
    } catch {
      return { error: "Invalid class selection." };
    }

    if (!targetClasses || targetClasses.length === 0) {
      return { error: "Please select at least one applicable class." };
    }

    // Filter to valid canonical classes
    targetClasses = targetClasses.filter((c) => STANDARD_CLASSES.includes(c));
    if (targetClasses.length === 0) {
      return { error: "Selected classes must be valid standard classes." };
    }

    // 1. Check duplicate style name for this school, item, and gender
    const { data: dupStyle } = await supabase
      .from("uniform_styles")
      .select("id")
      .eq("school_id", schoolId)
      .ilike("item_name", itemName)
      .ilike("style_name", styleName)
      .eq("gender", gender)
      .maybeSingle();

    if (dupStyle) {
      return { error: `A style named "${styleName}" already exists for ${itemName} (${gender}) in this school.` };
    }

    // 2. Insert style record
    const { data: createdStyle, error: createError } = await supabase
      .from("uniform_styles")
      .insert({
        school_id: schoolId,
        style_name: styleName,
        item_name: itemName,
        gender,
        is_active: true,
        available_sizes: availableSizes,
        is_required: isRequired,
        sort_order: 0,
      })
      .select("id")
      .single();

    if (createError || !createdStyle) {
      console.error("[createUniformStyle] Insert error:", createError);
      return { error: "Failed to create uniform style record." };
    }

    const styleId = createdStyle.id;

    // 4. Insert class mappings
    const classRows = targetClasses.map((cls) => ({
      style_id: styleId,
      class_name: cls,
    }));

    const { error: classesError } = await supabase
      .from("uniform_style_classes")
      .insert(classRows);

    if (classesError) {
      console.error("[createUniformStyle] Classes insert error:", classesError);
      // Clean up style
      await supabase.from("uniform_styles").delete().eq("id", styleId);
      return { error: "Failed to save applicable classes." };
    }

    // 5. Upload images if provided
    const validImages = images.filter((f) => f && f.size > 0);
    if (validImages.length > 0) {
      let sortIdx = 0;
      for (const file of validImages) {
        const fileExt = file.name.split(".").pop() || "jpg";
        const cleanExt = fileExt.toLowerCase().replace(/[^a-z0-9]/g, "");
        const storagePath = `schools/${schoolId}/styles/${styleId}/${uuidv4()}.${cleanExt}`;

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const { error: uploadError } = await supabase.storage
          .from("uniform-designs")
          .upload(storagePath, buffer, {
            contentType: file.type || "image/jpeg",
            upsert: true,
          });

        if (uploadError) {
          console.error("[createUniformStyle] Storage upload error:", uploadError);
          continue;
        }

        await supabase.from("uniform_style_images").insert({
          style_id: styleId,
          storage_path: storagePath,
          original_filename: file.name,
          mime_type: file.type || "image/jpeg",
          file_size: file.size,
          sort_order: sortIdx++,
        });
      }
    }

    revalidatePath("/admin/uniform-designs");
    revalidatePath("/school/uniform-designs");
    revalidatePath("/school/sizes");

    return { success: true, styleId };
  } catch (err) {
    console.error("[createUniformStyle] Error:", err);
    return { error: err instanceof Error ? err.message : "Failed to create uniform style." };
  }
}

/**
 * Update an existing uniform style (name, classes, active status, add/remove images).
 */
export async function updateUniformStyle(
  styleId: string,
  formData: FormData
): Promise<{ success?: boolean; error?: string }> {
  try {
    await requireAdmin();
    const supabase = await createClient();

    const styleName = (formData.get("style_name") as string)?.trim();
    const gender = ((formData.get("gender") as string)?.trim() || "All") as "Male" | "Female" | "All";
    const isActiveStr = formData.get("is_active") as string;
    const isActive = isActiveStr === "true";
    const isRequired = formData.get("is_required") !== "false";
    const availableSizesJson = formData.get("available_sizes") as string;
    const classesJson = formData.get("classes") as string;
    const removeImageIdsJson = formData.get("remove_image_ids") as string;
    const newImages = formData.getAll("new_images") as File[];

    if (!styleName) return { error: "Style name is required." };

    let availableSizes: string[] = [];
    try {
      if (availableSizesJson) {
        availableSizes = JSON.parse(availableSizesJson);
      }
    } catch {
      availableSizes = [];
    }

    let targetClasses: string[] = [];
    try {
      targetClasses = JSON.parse(classesJson || "[]");
    } catch {
      return { error: "Invalid class selection." };
    }

    if (!targetClasses || targetClasses.length === 0) {
      return { error: "Please select at least one applicable class." };
    }

    targetClasses = targetClasses.filter((c) => STANDARD_CLASSES.includes(c));

    // Fetch existing style
    const { data: existing, error: fetchErr } = await supabase
      .from("uniform_styles")
      .select("id, school_id, item_name, is_active, available_sizes")
      .eq("id", styleId)
      .single();

    if (fetchErr || !existing) {
      return { error: "Style not found." };
    }

    if (!availableSizes || availableSizes.length === 0) {
      availableSizes = (existing?.available_sizes as string[]) || [];
    }

    // 1. Check duplicate name if renamed
    const { data: dupName } = await supabase
      .from("uniform_styles")
      .select("id")
      .eq("school_id", existing.school_id)
      .ilike("item_name", existing.item_name)
      .ilike("style_name", styleName)
      .eq("gender", gender)
      .neq("id", styleId)
      .maybeSingle();

    if (dupName) {
      return { error: `Another style named "${styleName}" already exists for ${existing.item_name} (${gender}).` };
    }

    // 2. Update style record
    const { error: updateErr } = await supabase
      .from("uniform_styles")
      .update({
        style_name: styleName,
        gender,
        is_active: isActive,
        available_sizes: availableSizes,
        is_required: isRequired,
        updated_at: new Date().toISOString(),
      })
      .eq("id", styleId);

    if (updateErr) {
      console.error("[updateUniformStyle] Update error:", updateErr);
      return { error: "Failed to update uniform style." };
    }

    const classRows = targetClasses.map((cls) => ({
      style_id: styleId,
      class_name: cls,
    }));
    await supabase.from("uniform_style_classes").delete().eq("style_id", styleId);
    await supabase.from("uniform_style_classes").insert(classRows);

    // 5. Remove deleted images if any
    let removeImageIds: string[] = [];
    try {
      removeImageIds = JSON.parse(removeImageIdsJson || "[]");
    } catch {
      removeImageIds = [];
    }

    if (removeImageIds.length > 0) {
      const { data: imgsToDelete } = await supabase
        .from("uniform_style_images")
        .select("id, storage_path")
        .eq("style_id", styleId)
        .in("id", removeImageIds);

      if (imgsToDelete && imgsToDelete.length > 0) {
        const paths = imgsToDelete.map((i) => i.storage_path).filter(Boolean);
        if (paths.length > 0) {
          await supabase.storage.from("uniform-designs").remove(paths);
        }
        await supabase
          .from("uniform_style_images")
          .delete()
          .eq("style_id", styleId)
          .in("id", removeImageIds);
      }
    }

    // 6. Upload new images if any
    const validNewImages = newImages.filter((f) => f && f.size > 0);
    if (validNewImages.length > 0) {
      // Get current max sort order
      const { data: currentImgs } = await supabase
        .from("uniform_style_images")
        .select("sort_order")
        .eq("style_id", styleId)
        .order("sort_order", { ascending: false })
        .limit(1);

      let nextSort = currentImgs && currentImgs.length > 0 ? (currentImgs[0].sort_order || 0) + 1 : 0;

      for (const file of validNewImages) {
        const fileExt = file.name.split(".").pop() || "jpg";
        const cleanExt = fileExt.toLowerCase().replace(/[^a-z0-9]/g, "");
        const storagePath = `schools/${existing.school_id}/styles/${styleId}/${uuidv4()}.${cleanExt}`;

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const { error: uploadError } = await supabase.storage
          .from("uniform-designs")
          .upload(storagePath, buffer, {
            contentType: file.type || "image/jpeg",
            upsert: true,
          });

        if (uploadError) {
          console.error("[updateUniformStyle] Storage upload error:", uploadError);
          continue;
        }

        await supabase.from("uniform_style_images").insert({
          style_id: styleId,
          storage_path: storagePath,
          original_filename: file.name,
          mime_type: file.type || "image/jpeg",
          file_size: file.size,
          sort_order: nextSort++,
        });
      }
    }

    revalidatePath("/admin/uniform-designs");
    revalidatePath("/school/uniform-designs");
    revalidatePath("/school/sizes");

    return { success: true };
  } catch (err) {
    console.error("[updateUniformStyle] Error:", err);
    return { error: err instanceof Error ? err.message : "Failed to update style." };
  }
}

/**
 * Toggle active / inactive status of a style.
 */
export async function toggleStyleStatus(
  styleId: string,
  isActive: boolean
): Promise<{ success?: boolean; error?: string }> {
  try {
    await requireAdmin();
    const supabase = await createClient();

    const { data: style } = await supabase
      .from("uniform_styles")
      .select(`
        id,
        school_id,
        item_name,
        gender,
        uniform_style_classes (
          class_name
        )
      `)
      .eq("id", styleId)
      .single();

    if (!style) return { error: "Style not found." };

    if (isActive) {
      // Conflict check: ensure no other active style exists for these classes
      const targetClasses = ((style.uniform_style_classes as { class_name: string }[]) || []).map((c) => c.class_name);

      const { data: otherActives } = await supabase
        .from("uniform_styles")
        .select(`
          id,
          style_name,
          gender,
          uniform_style_classes (
            class_name
          )
        `)
        .eq("school_id", style.school_id)
        .ilike("item_name", style.item_name)
        .eq("is_active", true)
        .neq("id", styleId);

      if (otherActives && otherActives.length > 0) {
        for (const ex of otherActives) {
          const genderOverlap =
            style.gender === "All" ||
            ex.gender === "All" ||
            !ex.gender ||
            ex.gender === style.gender;

          if (genderOverlap) {
            const exClasses = ((ex.uniform_style_classes as { class_name: string }[]) || []).map((c) => c.class_name);
            const overlaps = targetClasses.filter((c) => exClasses.includes(c));
            if (overlaps.length > 0) {
              return {
                error: `Cannot activate: "${ex.style_name}" is already active for ${style.item_name} in ${overlaps.join(", ")}.`,
              };
            }
          }
        }
      }
    }

    const { error: updateErr } = await supabase
      .from("uniform_styles")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", styleId);

    if (updateErr) {
      return { error: "Failed to update style status." };
    }

    revalidatePath("/admin/uniform-designs");
    revalidatePath("/school/uniform-designs");
    revalidatePath("/school/sizes");

    return { success: true };
  } catch (err) {
    console.error("[toggleStyleStatus] Error:", err);
    return { error: "An unexpected error occurred." };
  }
}

/**
 * Safely delete a uniform style if it has NOT been referenced in student size records or orders.
 * Otherwise, blocks deletion and recommends deactivating instead.
 */
export async function deleteUniformStyle(styleId: string): Promise<{ success?: boolean; error?: string }> {
  try {
    await requireAdmin();
    const supabase = await createClient();

    // 1. Check if referenced in historical requirement_items
    const { data: usedInReqs } = await supabase
      .from("requirement_items")
      .select("id")
      .eq("style_id", styleId)
      .limit(1);

    if (usedInReqs && usedInReqs.length > 0) {
      return {
        error: "This style cannot be deleted because it is recorded in historical submitted orders. Please deactivate it instead to preserve production history.",
      };
    }

    // 2. Check if referenced in student_uniform_sizes dynamic_styles
    // Using jsonb filter: check if any student has this style_id
    const { data: styleRecord } = await supabase
      .from("uniform_styles")
      .select("id, school_id")
      .eq("id", styleId)
      .single();

    if (!styleRecord) {
      return { error: "Style not found." };
    }

    // Fetch images to delete from storage
    const { data: images } = await supabase
      .from("uniform_style_images")
      .select("storage_path")
      .eq("style_id", styleId);

    if (images && images.length > 0) {
      const paths = images.map((i) => i.storage_path).filter(Boolean);
      if (paths.length > 0) {
        await supabase.storage.from("uniform-designs").remove(paths);
      }
    }

    // Delete style record (cascades to classes and images table)
    const { error: delErr } = await supabase.from("uniform_styles").delete().eq("id", styleId);

    if (delErr) {
      console.error("[deleteUniformStyle] Delete error:", delErr);
      return { error: "Failed to delete uniform style." };
    }

    revalidatePath("/admin/uniform-designs");
    revalidatePath("/school/uniform-designs");
    revalidatePath("/school/sizes");

    return { success: true };
  } catch (err) {
    console.error("[deleteUniformStyle] Error:", err);
    return { error: "An unexpected error occurred deleting the style." };
  }
}

/**
 * Dedicated server action to configure and save class-wise colors for a uniform style.
 * Strictly verifies that the style belongs to the specified school.
 */
export async function saveStyleColors(payload: {
  schoolId: string;
  styleId: string;
  classColors: Record<string, string[]>;
}): Promise<{
  success?: boolean;
  colors?: UniformStyleWithDetails["colors"];
  error?: string;
}> {
  try {
    await requireAdmin();
    const supabase = await createClient();

    const { schoolId, styleId, classColors } = payload;
    if (!schoolId || !styleId) {
      return { error: "School and Uniform Style are required." };
    }

    // 1. Verify style exists and belongs to school
    const { data: styleRecord, error: styleErr } = await supabase
      .from("uniform_styles")
      .select("id, school_id, is_active")
      .eq("id", styleId)
      .single();

    if (styleErr || !styleRecord) {
      return { error: "Uniform style not found." };
    }

    if (styleRecord.school_id !== schoolId) {
      return { error: "Unauthorized: Uniform style does not belong to the selected school." };
    }

    // 2. Fetch applicable classes for this style
    const { data: classesData, error: classesErr } = await supabase
      .from("uniform_style_classes")
      .select("class_name")
      .eq("style_id", styleId);

    if (classesErr) {
      return { error: "Failed to verify applicable classes." };
    }

    const applicableClasses = (classesData || []).map((c) => c.class_name);

    // 3. Format valid color rows with duplicate prevention (style_id + class_name + color_name)
    const seen = new Set<string>();
    const validRows: Array<{
      style_id: string;
      class_name: string;
      color_name: string;
      sort_order: number;
      is_active: boolean;
    }> = [];
    let sortIdx = 0;

    Object.entries(classColors || {}).forEach(([className, colorList]) => {
      const trimmedClass = className?.trim();
      if (!applicableClasses.includes(trimmedClass)) return;

      (colorList || []).forEach((col) => {
        const trimmedColor = col?.trim();
        if (!trimmedColor) return;
        const key = `${trimmedClass}__${trimmedColor.toLowerCase()}`;
        if (seen.has(key)) return;
        seen.add(key);

        validRows.push({
          style_id: styleId,
          class_name: trimmedClass,
          color_name: trimmedColor,
          sort_order: sortIdx++,
          is_active: true,
        });
      });
    });

    // 4. Replace colors atomically
    await supabase.from("uniform_style_colors").delete().eq("style_id", styleId);

    let insertedColors: UniformStyleWithDetails["colors"] = [];
    if (validRows.length > 0) {
      const { data: inserted, error: insertErr } = await supabase
        .from("uniform_style_colors")
        .insert(validRows)
        .select("id, style_id, class_name, color_name, sort_order, is_active, created_at, updated_at");

      if (insertErr) {
        console.error("[saveStyleColors] Insert error:", insertErr);
        return { error: "Failed to save colors: " + insertErr.message };
      }
      insertedColors = inserted || [];
    }

    revalidatePath("/admin/uniform-designs");
    revalidatePath("/school/uniform-designs");
    revalidatePath("/school/sizes");

    return { success: true, colors: insertedColors };
  } catch (err) {
    console.error("[saveStyleColors] Unexpected error:", err);
    return { error: err instanceof Error ? err.message : "Failed to save style colors." };
  }
}

