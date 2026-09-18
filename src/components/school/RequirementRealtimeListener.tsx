"use client";

import { useRealtimeRefresh } from "@/lib/supabase/useRealtime";

export function RequirementRealtimeListener({ schoolId }: { schoolId?: string }) {
  useRealtimeRefresh({
    table: "requirements",
    filter: schoolId ? `school_id=eq.${schoolId}` : undefined,
  });

  return null;
}
