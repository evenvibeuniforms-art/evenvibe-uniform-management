-- Migration: 20261105000000_order_delivery_student_items.sql
-- Description: Authoritative student-level delivery allocation module for Alterations and School Admin visibility.
-- 1. Creates public.order_delivery_student_items table tracking student-level delivered items.
-- 2. Implements sync_order_delivery_student_items RPC allocating passed QC items to ordered students.
-- 3. Enables RLS and backfills all existing delivered orders.

BEGIN;

-- 1. Create public.order_delivery_student_items table
CREATE TABLE IF NOT EXISTS public.order_delivery_student_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    style_id UUID REFERENCES public.uniform_styles(id) ON DELETE SET NULL,
    style_name TEXT NULL,
    color TEXT NULL,
    size TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique index to prevent duplicate delivered item mapping per student, order, item, style, color, and size
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_delivery_student_item_idx ON public.order_delivery_student_items (
    order_id,
    student_id,
    lower(trim(item_name)),
    lower(trim(size)),
    COALESCE(lower(trim(style_name)), ''),
    COALESCE(lower(trim(color)), '')
);

-- Query performance indexes
CREATE INDEX IF NOT EXISTS idx_order_delivery_students_order ON public.order_delivery_student_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_delivery_students_school ON public.order_delivery_student_items(school_id);
CREATE INDEX IF NOT EXISTS idx_order_delivery_students_student ON public.order_delivery_student_items(student_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS set_order_delivery_student_items_updated_at ON public.order_delivery_student_items;
CREATE TRIGGER set_order_delivery_student_items_updated_at
    BEFORE UPDATE ON public.order_delivery_student_items
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 2. Row Level Security
ALTER TABLE public.order_delivery_student_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School Admins can view own delivery student items" ON public.order_delivery_student_items;
CREATE POLICY "School Admins can view own delivery student items"
    ON public.order_delivery_student_items FOR SELECT
    USING (
        school_id = public.get_my_school_id() 
        AND public.get_my_role() = 'school_admin'
    );

DROP POLICY IF EXISTS "EvenVibe Admins can manage all delivery student items" ON public.order_delivery_student_items;
CREATE POLICY "EvenVibe Admins can manage all delivery student items"
    ON public.order_delivery_student_items FOR ALL
    USING (public.get_my_role() = 'evenvibe_admin')
    WITH CHECK (public.get_my_role() = 'evenvibe_admin');

GRANT SELECT ON public.order_delivery_student_items TO authenticated, service_role;
GRANT ALL ON public.order_delivery_student_items TO service_role;

-- 3. Synchronization RPC: Maps QC Passed uniform items to eligible ordered students
CREATE OR REPLACE FUNCTION public.sync_order_delivery_student_items(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_school_id UUID;
    v_req_id UUID;
    v_order_status TEXT;
    v_mapped_count INTEGER := 0;
    
    r_qc RECORD;
    r_cand RECORD;
    v_remaining_qty INTEGER;
BEGIN
    -- 1. Fetch order
    SELECT school_id, requirement_id, status 
    INTO v_school_id, v_req_id, v_order_status
    FROM public.orders
    WHERE id = p_order_id;
    
    IF v_school_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    IF v_req_id IS NULL THEN
        RETURN jsonb_build_object('success', true, 'mapped_count', 0, 'message', 'Legacy order without requirement');
    END IF;

    -- 2. Clear existing mappings for idempotency
    DELETE FROM public.order_delivery_student_items WHERE order_id = p_order_id;

    -- 3. Loop over each QC item with passed_quantity > 0
    FOR r_qc IN 
        SELECT 
            id,
            trim(item_name) AS item_name,
            style_id,
            trim(style_name) AS style_name,
            trim(color) AS color,
            trim(size) AS size,
            passed_quantity
        FROM public.order_quality_check_items
        WHERE order_id = p_order_id AND passed_quantity > 0
        ORDER BY passed_quantity DESC, item_name, size
    LOOP
        v_remaining_qty := r_qc.passed_quantity;

        -- Find candidate students in requirement_students who ordered this item
        FOR r_cand IN
            WITH student_candidates AS (
                -- A: Dynamic sizes & styles
                SELECT 
                    rs.student_id,
                    us.item_name,
                    COALESCE(
                        (sus.dynamic_styles->kv.key->>'style_id')::uuid,
                        us.id
                    ) AS style_id,
                    COALESCE(
                        sus.dynamic_styles->kv.key->>'style_name',
                        us.style_name
                    ) AS style_name,
                    sus.dynamic_styles->kv.key->>'color' AS color,
                    kv.value AS size
                FROM public.requirement_students rs
                JOIN public.student_uniform_sizes sus ON sus.student_id = rs.student_id
                CROSS JOIN LATERAL jsonb_each_text(COALESCE(sus.dynamic_sizes, '{}'::jsonb)) kv
                LEFT JOIN public.uniform_styles us ON us.id = (
                    CASE 
                        WHEN kv.key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                        THEN kv.key::uuid 
                        ELSE NULL 
                    END
                )
                WHERE rs.requirement_id = v_req_id
                
                UNION ALL
                
                -- B: Standard size fields (Shirt, Pant, T-Shirt, Short)
                SELECT 
                    rs.student_id,
                    std.item_name,
                    NULL::uuid AS style_id,
                    NULL AS style_name,
                    NULL AS color,
                    std.size
                FROM public.requirement_students rs
                JOIN public.student_uniform_sizes sus ON sus.student_id = rs.student_id
                CROSS JOIN LATERAL (
                    VALUES 
                        ('Shirt', sus.shirt_size),
                        ('Pant', sus.pant_size),
                        ('T-Shirt', sus.tshirt_size),
                        ('Short', sus.short_size)
                ) std(item_name, size)
                WHERE rs.requirement_id = v_req_id AND std.size IS NOT NULL AND trim(std.size) <> ''
            )
            SELECT DISTINCT student_id, item_name, style_id, style_name, color, size
            FROM student_candidates sc
            WHERE lower(trim(sc.item_name)) = lower(trim(r_qc.item_name))
              AND lower(trim(sc.size)) = lower(trim(r_qc.size))
              AND (
                  -- Match color if QC has color and student has color
                  r_qc.color IS NULL 
                  OR sc.color IS NULL 
                  OR lower(trim(r_qc.color)) = lower(trim(sc.color))
              )
              AND (
                  -- Match style if QC has style and student has style
                  r_qc.style_name IS NULL 
                  OR sc.style_name IS NULL 
                  OR lower(trim(r_qc.style_name)) = lower(trim(sc.style_name))
              )
              -- Avoid double assigning same item to same student
              AND NOT EXISTS (
                  SELECT 1 FROM public.order_delivery_student_items odsi
                  WHERE odsi.order_id = p_order_id
                    AND odsi.student_id = sc.student_id
                    AND lower(trim(odsi.item_name)) = lower(trim(sc.item_name))
              )
            ORDER BY student_id
        LOOP
            IF v_remaining_qty <= 0 THEN
                EXIT;
            END IF;

            INSERT INTO public.order_delivery_student_items (
                order_id,
                school_id,
                student_id,
                item_name,
                style_id,
                style_name,
                color,
                size,
                quantity,
                created_at,
                updated_at
            ) VALUES (
                p_order_id,
                v_school_id,
                r_cand.student_id,
                r_qc.item_name,
                COALESCE(r_cand.style_id, r_qc.style_id),
                COALESCE(r_cand.style_name, r_qc.style_name),
                COALESCE(r_cand.color, r_qc.color),
                r_qc.size,
                1,
                now(),
                now()
            )
            ON CONFLICT DO NOTHING;

            v_remaining_qty := v_remaining_qty - 1;
            v_mapped_count := v_mapped_count + 1;
        END LOOP;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'mapped_count', v_mapped_count
    );
END;
$$;

-- 4. Backfill existing delivered and dispatched orders
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM public.orders WHERE status IN ('packed', 'dispatched', 'in_transit', 'delivered')
    LOOP
        PERFORM public.sync_order_delivery_student_items(r.id);
    END LOOP;
END;
$$;

COMMIT;
