"use server";

import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type UniformItemDraft = {
  id?: string;
  item_name: string;
  available_sizes: string[];
  is_required: boolean;
  sort_order: number;
};

/**
 * DEPRECATED: Legacy Uniform Configuration is retired.
 * All new uniform configuration must be created in Uniform Designs (/admin/uniform-designs).
 */
export async function saveUniformConfiguration(
  _schoolId: string,
  _gender: "Male" | "Female",
  _items: UniformItemDraft[],
  _targetClasses: string[],
  _configId?: string
): Promise<{ success?: string; error?: string }> {
  void _schoolId;
  void _gender;
  void _items;
  void _targetClasses;
  void _configId;
  return {
    error: "Legacy Uniform Configuration is retired. Please use Uniform Designs at /admin/uniform-designs to configure uniform styles.",
  };
}

/**
 * Historical helper to deactivate a legacy uniform configuration if needed.
 */
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
    const { error: rpcError } = await supabase.rpc("deactivate_uniform_configuration", {
      p_config_id: configId,
      p_school_id: schoolId,
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
