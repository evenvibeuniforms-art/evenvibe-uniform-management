"use server";

import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { UniformConfigSchema, validateDuplicateItemNames } from "@/lib/validations/uniform-config";

export type UniformItemDraft = {
  id?: string;
  item_name: string;
  available_sizes: string[];
  is_required: boolean;
  sort_order: number;
};

export async function saveUniformConfiguration(
  schoolId: string,
  gender: "Male" | "Female",
  items: UniformItemDraft[],
  targetClasses: string[],
  configId?: string
) {
  try {
    await requireAdmin();
    const supabase = await createClient();

    // 1. Validation: School ID
    if (!schoolId || typeof schoolId !== "string") {
      return { error: "Invalid school ID." };
    }

    // 2. Zod Validation for config and items
    const result = UniformConfigSchema.safeParse({
      gender,
      targetClasses,
      items
    });

    if (!result.success) {
      return { error: result.error.issues[0].message };
    }

    // 3. Custom Item Name Duplication Validation
    const duplicateError = validateDuplicateItemNames(result.data.items);
    if (duplicateError) {
      return { error: duplicateError };
    }

    // 5. Pre-check for Overlaps to provide a clear, comprehensive error message
    let query = supabase
      .from('school_uniform_configurations')
      .select('id, school_uniform_configuration_classes(class_name)')
      .eq('school_id', schoolId)
      .eq('gender', gender)
      .eq('is_active', true);
      
    if (configId) {
      query = query.neq('id', configId);
    }
    
    const { data: existingConfigs, error: overlapError } = await query;
    
    if (overlapError) {
      console.error("[saveUniformConfiguration] overlap pre-check failed", {
        message: overlapError.message,
        code: overlapError.code,
        details: overlapError.details,
        hint: overlapError.hint,
      });
      return { error: `Failed to validate configuration overlaps: ${overlapError.message}` };
    }
    
    const overlappingClasses: string[] = [];
    if (existingConfigs) {
      for (const config of existingConfigs) {
        const classes = config.school_uniform_configuration_classes as unknown as { class_name: string }[];
        if (classes && Array.isArray(classes)) {
          for (const cls of classes) {
            if (targetClasses.includes(cls.class_name)) {
              overlappingClasses.push(cls.class_name);
            }
          }
        }
      }
    }
    
    if (overlappingClasses.length > 0) {
      const uniqueOverlaps = Array.from(new Set(overlappingClasses));
      const classStr = uniqueOverlaps.length === 1 
        ? `${uniqueOverlaps[0]} is` 
        : `${uniqueOverlaps.join(', ')} are`;
        
      return { error: `Configuration conflict: ${classStr} already assigned to another active ${gender} configuration.` };
    }

    // 6. Build RPC arguments dynamically to avoid null casting issues
    const rpcArgs: { p_school_id: string; p_gender: string; p_target_classes: string[]; p_config_id?: string; p_items?: unknown } = {
      p_school_id: schoolId,
      p_gender: gender,
      p_target_classes: targetClasses,
      p_items: items.map((item, index) => ({
        id: item.id || null,
        item_name: item.item_name,
        available_sizes: item.available_sizes,
        is_required: item.is_required,
        sort_order: index
      }))
    };
    if (configId) {
      rpcArgs.p_config_id = configId;
    }

    // 6. Execute RPC for transactional save & overlap check
    const { data: finalConfigId, error: rpcError } = await supabase
      .rpc('save_uniform_configuration', rpcArgs);

    if (rpcError) {
      // Return safe user-facing message for known errors
      if (rpcError.message?.includes("Configuration conflict")) {
        return { error: rpcError.message }; // Keep the specific overlap message from Postgres
      }
      if (rpcError.message?.includes("schema cache") || rpcError.code === "PGRST202") {
        return { error: "Uniform configuration service is unavailable. Please try again (Schema Cache/RPC Error)." };
      }
      return { error: rpcError.message || "An error occurred while saving the configuration." };
    }

    if (!finalConfigId) {
      return { error: "Failed to get configuration ID from database." };
    }

    revalidatePath(`/admin/schools/${schoolId}/uniforms`);
    return { success: "Configuration saved successfully." };

  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "An unexpected error occurred." };
  }
}

export async function deactivateUniformConfiguration(configId: string, schoolId: string) {
  try {
    await requireAdmin();
    const supabase = await createClient();

    if (!configId || typeof configId !== "string") {
      return { error: "Invalid configuration ID." };
    }
    if (!schoolId || typeof schoolId !== "string") {
      return { error: "Invalid school ID." };
    }

    // 1. Fetch the configuration to verify ownership and active state
    const { data: config, error: fetchError } = await supabase
      .from("school_uniform_configurations")
      .select("id, school_id, is_active")
      .eq("id", configId)
      .single();

    if (fetchError || !config) {
      return { error: "Configuration not found." };
    }

    if (config.school_id !== schoolId) {
      return { error: "Unauthorized: Configuration does not belong to this school." };
    }

    if (!config.is_active) {
      return { success: "Configuration is already inactive." };
    }

    // 2. Soft deactivate via secure RPC
    const { error: rpcError } = await supabase.rpc('deactivate_uniform_configuration', {
      p_config_id: configId,
      p_school_id: schoolId
    });

    if (rpcError) {
      console.error("[deactivateUniformConfiguration] rpcError:", {
        message: rpcError.message,
        code: rpcError.code,
        details: rpcError.details,
        hint: rpcError.hint,
      });
      
      if (rpcError.message?.includes("Unauthorized") || rpcError.message?.includes("not found")) {
         return { error: rpcError.message };
      }
      return { error: "Failed to deactivate configuration." };
    }

    revalidatePath(`/admin/schools/${schoolId}/uniforms`);
    return { success: "Configuration deactivated successfully." };

  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "An unexpected error occurred." };
  }
}
