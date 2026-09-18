"use client";

import { useEffect, useRef, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type {
  RealtimePostgresChangesPayload,
  RealtimeChannel,
} from "@supabase/supabase-js";

export interface RealtimeSubscriptionOptions<T extends Record<string, unknown> = Record<string, unknown>> {
  table: string;
  filter?: string;
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  schema?: string;
  onEvent: (payload: RealtimePostgresChangesPayload<T>) => void;
  enabled?: boolean;
}

/**
 * Hook for subscribing to postgres changes on a specific Supabase table.
 * Automatically handles subscription lifecycle, cleanup, and channel reuse prevention.
 */
export function useRealtimeSubscription<T extends Record<string, unknown> = Record<string, unknown>>({
  table,
  filter,
  event = "*",
  schema = "public",
  onEvent,
  enabled = true,
}: RealtimeSubscriptionOptions<T>) {
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    const channelName = `realtime-${table}-${event}-${filter || "all"}-${Math.random().toString(36).substring(2, 7)}`;

    const channelConfig = {
      event,
      schema,
      table,
      ...(filter ? { filter } : {}),
    };

    let channel: RealtimeChannel | null = supabase.channel(channelName);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    channel.on("postgres_changes" as any, channelConfig, (payload: any) => {
      try {
        onEventRef.current(payload as RealtimePostgresChangesPayload<T>);
      } catch (err) {
        console.error(`[Realtime] Error processing event for ${table}:`, err);
      }
    });

    channel.subscribe((status, err) => {
      if (err) {
        console.warn(`[Realtime] Subscription warning for ${table}:`, err.message);
      }
    });

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
    };
  }, [table, filter, event, schema, enabled]);
}

export interface RefreshTableConfig {
  table: string;
  filter?: string;
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
}

export interface RealtimeRefreshOptions {
  table?: string;
  filter?: string;
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  tables?: RefreshTableConfig[];
  debounceMs?: number;
  enabled?: boolean;
  onRefreshStart?: () => void;
  onRefreshEnd?: () => void;
}

/**
 * Hook to trigger a smooth, debounced Next.js router refresh when database changes occur.
 * Ideal for Server Component dashboards without full-page reloads.
 */
export function useRealtimeRefresh({
  table,
  filter,
  event = "*",
  tables,
  debounceMs = 300,
  enabled = true,
  onRefreshStart,
  onRefreshEnd,
}: RealtimeRefreshOptions) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const resolvedTables: RefreshTableConfig[] = useMemo(() => {
    if (tables && tables.length > 0) return tables;
    if (table) return [{ table, filter, event }];
    return [];
  }, [tables, table, filter, event]);

  useEffect(() => {
    if (!enabled || resolvedTables.length === 0) return;

    const supabase = createClient();
    const channelName = `refresh-${resolvedTables.map((t) => t.table).join("-")}-${Math.random().toString(36).substring(2, 7)}`;
    let channel: RealtimeChannel | null = supabase.channel(channelName);

    const triggerRefresh = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (onRefreshStart) onRefreshStart();
        startTransition(() => {
          router.refresh();
          if (onRefreshEnd) onRefreshEnd();
        });
      }, debounceMs);
    };

    resolvedTables.forEach(({ table: tbl, filter: flt, event: ev = "*" }) => {
      const config = {
        event: ev,
        schema: "public",
        table: tbl,
        ...(flt ? { filter: flt } : {}),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      channel?.on("postgres_changes" as any, config, () => {
        triggerRefresh();
      });
    });

    channel.subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
    };
  }, [resolvedTables, debounceMs, enabled, router, onRefreshStart, onRefreshEnd]);
}
