-- Migration: 20260930000000_enable_realtime_publications.sql
-- Description: Enable Supabase Realtime replication on operational tables with REPLICA IDENTITY FULL.

DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'orders',
        'order_status_history',
        'production_records',
        'production_stage_history',
        'quality_check_records',
        'quality_check_history',
        'packing_records',
        'packing_history',
        'alteration_requests',
        'notifications',
        'notification_reads',
        'students',
        'requirements',
        'tc_students'
    ];
BEGIN
    -- Ensure publication exists
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;

    FOREACH t IN ARRAY tables LOOP
        -- Check if table exists in public schema
        IF EXISTS (
            SELECT 1 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
              AND table_name = t
        ) THEN
            -- Set replica identity full so all columns are included in payload for RLS & filters
            EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL;', t);
            
            -- Add to publication if not already present
            IF NOT EXISTS (
                SELECT 1 
                FROM pg_publication_tables 
                WHERE pubname = 'supabase_realtime' 
                  AND schemaname = 'public' 
                  AND tablename = t
            ) THEN
                EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', t);
            END IF;
        END IF;
    END LOOP;
END $$;
