"use client";

import { useRealtimeRefresh } from "@/lib/supabase/useRealtime";

export function SchoolDashboardRealtime({ schoolId }: { schoolId: string }) {
  useRealtimeRefresh({
    table: "orders",
    filter: `school_id=eq.${schoolId}`,
  });

  useRealtimeRefresh({
    table: "requirements",
    filter: `school_id=eq.${schoolId}`,
  });

  useRealtimeRefresh({
    table: "students",
    filter: `school_id=eq.${schoolId}`,
  });

  return null;
}
