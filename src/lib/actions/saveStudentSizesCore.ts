import { SupabaseClient } from "@supabase/supabase-js";
import { sizeCollectionSchema, SizeCollectionFormValues } from "@/app/(school)/school/sizes/schema";
import { UNIFORM_TYPES } from "@/lib/constants/uniformSizes";
import { DEFAULT_STUDENT_SIZES, isPositiveWholeNumber } from "@/lib/constants/studentSizes";
import { getActiveAcademicYear, getPreviousAcademicYear } from "@/lib/constants/academicYear";

export async function saveStudentSizesCore({
  supabase,
  data,
  enforceSchoolId,
}: {
  supabase: SupabaseClient;
  data: SizeCollectionFormValues;
  enforceSchoolId?: string;
}): Promise<{ success?: boolean; error?: string }> {
  try {
    const validatedData = sizeCollectionSchema.parse(data);

    // Fetch student
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id, school_id, gender, class_name, section")
      .eq("id", validatedData.student_id)
      .single();

    if (studentError || !student) {
      return { error: "Student not found" };
    }

    if (enforceSchoolId && student.school_id !== enforceSchoolId) {
      return { error: "Unauthorized access to student" };
    }

    // Resolve active and previous academic years server-side
    const activeAcademicYear = await getActiveAcademicYear(supabase);
    const previousAcademicYear = getPreviousAcademicYear(activeAcademicYear);

    // Load actual historical size records for previous academic year
    const { data: previousYearHistory, error: prevHistError } = await supabase
      .from("student_uniform_size_history")
      .select("id, item_name, style_id, style_name, size, source_type")
      .eq("student_id", validatedData.student_id)
      .eq("academic_year", previousAcademicYear);

    if (prevHistError) {
      console.error("Error fetching previous year history in saveStudentSizesCore:", prevHistError);
    }

    const prevHistoryRows = previousYearHistory || [];

    // Fetch active styles for this student's school & class from Uniform Style Master
    const { data: activeStylesData, error: stylesError } = await supabase
      .from("uniform_styles")
      .select(`
        id,
        style_name,
        item_name,
        gender,
        available_sizes,
        is_required,
        sort_order,
        uniform_style_classes!inner (
          class_name
        ),
        colors:uniform_style_colors (
          class_name,
          color_name,
          is_active
        )
      `)
      .eq("school_id", student.school_id)
      .eq("is_active", true)
      .eq("uniform_style_classes.class_name", student.class_name || "");

    if (stylesError) {
      console.error("Error fetching uniform styles for validation:", stylesError);
      return { error: "Failed to validate uniform styles." };
    }

    const activeStyles = (activeStylesData || []).filter((st) => {
      return (
        !st.gender ||
        st.gender === "All" ||
        st.gender.toLowerCase() === (student.gender || "Male").toLowerCase()
      );
    });

    if (activeStyles.length === 0) {
      return { error: `No uniform styles are configured for Class ${student.class_name}. Please configure styles in Admin first.` };
    }

    // Group active styles by item_name
    const itemsMap = new Map<string, typeof activeStyles>();
    activeStyles.forEach((st) => {
      const key = st.item_name.trim().toLowerCase();
      if (!itemsMap.has(key)) itemsMap.set(key, []);
      itemsMap.get(key)!.push(st);
    });

    const dynamic_sizes = validatedData.dynamic_sizes || {};
    const incomingStyles = validatedData.dynamic_styles || {};
    const final_dynamic_styles: Record<string, { style_id: string; style_name: string; color?: string | null }> = {};
    const final_dynamic_sizes: Record<string, string> = {};
    const pendingBaselines: Array<{
      item_name: string;
      style_id: string;
      style_name: string;
      size: string;
    }> = [];

    let allRequiredFilled = true;

    for (const [itemKey, stylesForItem] of itemsMap.entries()) {
      const canonicalItemName = stylesForItem[0].item_name;

      // Find which style was selected for this item
      let matchedStyle = stylesForItem.find((st) => {
        const inStyle = incomingStyles[st.id] || incomingStyles[itemKey];
        if (inStyle?.style_id === st.id) return true;
        const sizeVal = dynamic_sizes[st.id];
        return sizeVal !== undefined;
      });

      // If exactly one active style exists and none explicitly selected, automatically use it
      if (!matchedStyle && stylesForItem.length === 1) {
        matchedStyle = stylesForItem[0];
      }

      if (!matchedStyle) {
        return {
          error: `Please select a uniform style for ${canonicalItemName}.`,
        };
      }

      // Retrieve size value
      let sizeVal = dynamic_sizes[matchedStyle.id];
      if (sizeVal === undefined) {
        sizeVal = dynamic_sizes[itemKey] || "";
      }
      if (sizeVal === "__none__") {
        sizeVal = "";
      }

      // Retrieve incoming color
      const inStyle = incomingStyles[matchedStyle.id] || incomingStyles[itemKey];
      const incomingColor = inStyle?.color;

      // Extract configured colors for this student's class
      const configuredColors = (((matchedStyle as unknown as { colors?: { class_name: string; color_name: string; is_active?: boolean }[] }).colors) || [])
        .filter((c) => c.is_active !== false && c.class_name.trim().toLowerCase() === (student.class_name || "").trim().toLowerCase())
        .map((c) => c.color_name.trim());

      let canonicalColor: string | null = null;

      // Color validation rules:
      // 1. If colors are configured for this class:
      //    Color is REQUIRED when size is provided (or when item is required).
      //    Invalid color is strictly rejected.
      // 2. If NO colors configured for this class:
      //    Color must NOT be provided (rejected if client tries to pass arbitrary color).
      if (configuredColors.length > 0) {
        if (matchedStyle.is_required || (sizeVal && sizeVal.trim() !== "")) {
          if (!incomingColor || incomingColor.trim() === "") {
            return {
              error: `Color is required for ${matchedStyle.style_name} (${canonicalItemName}) in Class ${student.class_name}. Configured colors: ${configuredColors.join(", ")}.`,
            };
          }
          const matchedColor = configuredColors.find(
            (col) => col.toLowerCase() === incomingColor.trim().toLowerCase()
          );
          if (!matchedColor) {
            return {
              error: `Invalid color '${incomingColor}' for ${matchedStyle.style_name} (${canonicalItemName}). Configured colors for Class ${student.class_name}: ${configuredColors.join(", ")}.`,
            };
          }
          canonicalColor = matchedColor;
        }
      } else {
        if (incomingColor && incomingColor.trim() !== "") {
          return {
            error: `Colors are not configured for ${matchedStyle.style_name} in Class ${student.class_name}. Color should not be submitted.`,
          };
        }
      }

      // Required style: size must be provided
      if (matchedStyle.is_required) {
        if (!sizeVal || sizeVal.trim() === "") {
          allRequiredFilled = false;
          return {
            error: `Size is required for ${matchedStyle.style_name} (${canonicalItemName}).`,
          };
        }
      }

      // If size is provided, validate that it is a positive whole number or matching style size
      if (sizeVal && sizeVal.trim() !== "") {
        const trimmedSize = sizeVal.trim();
        const isNumeric = isPositiveWholeNumber(trimmedSize);
        const isDefault = (DEFAULT_STUDENT_SIZES as readonly string[]).includes(trimmedSize);
        const isStyleSize = matchedStyle.available_sizes?.includes(trimmedSize);

        if (!isNumeric && !isDefault && !isStyleSize) {
          return {
            error: `Invalid size '${trimmedSize}' for style '${matchedStyle.style_name}'. Size must be a positive whole number (e.g. 18-46, 48, 50).`,
          };
        }

        final_dynamic_sizes[matchedStyle.id] = trimmedSize;
        final_dynamic_styles[matchedStyle.id] = {
          style_id: matchedStyle.id,
          style_name: matchedStyle.style_name,
          color: canonicalColor,
        };
      }

      // Check if actual historical record exists for previous academic year for exact item + style
      const existingPrevRecord = prevHistoryRows.find(
        (h) =>
          h.item_name.trim().toLowerCase() === canonicalItemName.trim().toLowerCase() &&
          (h.style_id === matchedStyle.id || (h.style_name && h.style_name.trim().toLowerCase() === matchedStyle.style_name.trim().toLowerCase()))
      );

      // CASE 1: Previous-year record exists
      // If exact history already exists, any client-submitted manual last year size is ignored (tamper protection).
      // The stored historical record remains immutable.

      // CASE 2: Previous-year record does NOT exist
      // Last Year Size is optional and manually enterable.
      if (!existingPrevRecord) {
        const rawBaseline =
          validatedData.manual_last_year_sizes?.[`${canonicalItemName.trim()}__${matchedStyle.id}`] ??
          validatedData.manual_last_year_sizes?.[`${canonicalItemName.trim().toLowerCase()}__${matchedStyle.id}`] ??
          validatedData.manual_last_year_sizes?.[matchedStyle.id];

        if (rawBaseline && rawBaseline !== "__none__" && rawBaseline.trim() !== "") {
          const trimmedBaseline = rawBaseline.trim();
          const isNumeric = isPositiveWholeNumber(trimmedBaseline);
          const isDefault = (DEFAULT_STUDENT_SIZES as readonly string[]).includes(trimmedBaseline);
          const isStyleSize = matchedStyle.available_sizes?.includes(trimmedBaseline);

          if (!isNumeric && !isDefault && !isStyleSize) {
            return {
              error: `Invalid Last Year Size '${trimmedBaseline}' for ${matchedStyle.style_name} (${canonicalItemName}). Size must be a positive whole number (e.g. 18-46, 48, 50).`,
            };
          }

          pendingBaselines.push({
            item_name: canonicalItemName,
            style_id: matchedStyle.id,
            style_name: matchedStyle.style_name,
            size: trimmedBaseline,
          });
        }
      }
    }

    const is_complete = allRequiredFilled;
    const uniform_type = validatedData.uniform_type || UNIFORM_TYPES.REGULAR;
    const shirt_size = validatedData.shirt_size || null;
    const tshirt_size = validatedData.tshirt_size || null;
    const pant_size = validatedData.pant_size || null;
    const short_size = validatedData.short_size || null;

    const nowIso = new Date().toISOString();

    const { error: upsertError } = await supabase
      .from("student_uniform_sizes")
      .upsert({
        student_id: validatedData.student_id,
        school_id: student.school_id,
        academic_year: activeAcademicYear,
        uniform_type,
        shirt_size,
        tshirt_size,
        pant_size,
        short_size,
        dynamic_sizes: final_dynamic_sizes,
        dynamic_styles: final_dynamic_styles,
        is_complete,
        updated_at: nowIso,
      }, {
        onConflict: "student_id"
      });

    if (upsertError) {
      console.error("Error saving size:", upsertError);
      return { error: "Failed to save student size" };
    }

    // Persist actual collected sizes to student_uniform_size_history for activeAcademicYear
    const { data: existingYearHistory, error: historyFetchError } = await supabase
      .from("student_uniform_size_history")
      .select("id, item_name, style_id, style_name, source_type")
      .eq("student_id", validatedData.student_id)
      .eq("academic_year", activeAcademicYear);

    if (historyFetchError) {
      console.error("Error fetching existing history in saveStudentSizesCore:", historyFetchError);
    }

    const historyRows = existingYearHistory || [];

    for (const [styleId, sizeVal] of Object.entries(final_dynamic_sizes)) {
      const styleMeta = final_dynamic_styles[styleId];
      const matchedStyle = activeStyles.find((s) => s.id === styleId);
      const itemName = matchedStyle?.item_name || "Uniform Item";
      const styleName = styleMeta?.style_name || matchedStyle?.style_name || "Style 1";
      const colorVal = styleMeta?.color || null;

      const existingRecord = historyRows.find(
        (h) =>
          h.item_name.trim().toLowerCase() === itemName.trim().toLowerCase() &&
          (h.style_id === styleId || (h.style_name && h.style_name.trim().toLowerCase() === styleName.trim().toLowerCase()))
      );

      if (existingRecord) {
        const { error: updateHistErr } = await supabase
          .from("student_uniform_size_history")
          .update({
            style_id: styleId,
            style_name: styleName,
            size: sizeVal,
            color: colorVal,
            gender: student.gender,
            class_name: student.class_name,
            section: student.section || null,
            source_type: existingRecord.source_type || "historical_record",
            updated_at: nowIso,
          })
          .eq("id", existingRecord.id);

        if (updateHistErr) {
          console.error("Error updating student_uniform_size_history:", updateHistErr);
        }
      } else {
        const { error: insertHistErr } = await supabase
          .from("student_uniform_size_history")
          .insert({
            student_id: validatedData.student_id,
            school_id: student.school_id,
            academic_year: activeAcademicYear,
            style_id: styleId,
            style_name: styleName,
            item_name: itemName,
            gender: student.gender,
            size: sizeVal,
            color: colorVal,
            class_name: student.class_name,
            section: student.section || null,
            source_type: "historical_record",
            created_at: nowIso,
            updated_at: nowIso,
          });

        if (insertHistErr) {
          console.error("Error inserting student_uniform_size_history:", insertHistErr);
        }
      }
    }

    // Persist manual baselines to student_uniform_size_history for previousAcademicYear
    for (const baseline of pendingBaselines) {
      const { error: insertBaselineErr } = await supabase
        .from("student_uniform_size_history")
        .insert({
          student_id: validatedData.student_id,
          school_id: student.school_id,
          academic_year: previousAcademicYear,
          style_id: baseline.style_id,
          style_name: baseline.style_name,
          item_name: baseline.item_name,
          gender: student.gender,
          size: baseline.size,
          color: null,
          class_name: null,
          section: null,
          source_type: "manual_baseline",
          created_at: nowIso,
          updated_at: nowIso,
        });

      if (insertBaselineErr) {
        console.error("Error inserting manual baseline in student_uniform_size_history:", insertBaselineErr);
      }
    }

    return { success: true };
  } catch (err) {
    console.error("Error in saveStudentSizesCore:", err);
    return { error: err instanceof Error ? err.message : "An unexpected error occurred" };
  }
}
