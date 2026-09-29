-- Migration: 20261014000001_save_order_inventory_materials_rpc.sql
-- RPC to save/upsert order inventory materials with server-side validation and quantity derivation

CREATE OR REPLACE FUNCTION public.save_order_inventory_materials(
    p_order_id UUID,
    p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_role TEXT;
    v_order_status TEXT;
    v_requirement_id UUID;
    v_item JSONB;
    v_item_name TEXT;
    v_style_id UUID;
    v_style_name TEXT;
    v_color TEXT;
    v_gram NUMERIC(10,2);
    v_qty INTEGER;
    v_total_grams NUMERIC(14,2);
    v_count INTEGER := 0;
BEGIN
    -- 1. Verify user role
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
    IF v_role != 'evenvibe_admin' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized. EvenVibe Admin required.');
    END IF;

    -- 2. Verify order
    SELECT status, requirement_id INTO v_order_status, v_requirement_id
    FROM public.orders
    WHERE id = p_order_id;

    IF v_order_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    IF v_order_status != 'production' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order is not in production status');
    END IF;

    -- 3. Loop over items in p_items and upsert
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_name := trim(v_item->>'item_name');
        IF v_item_name IS NULL OR v_item_name = '' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Item name is required for all rows');
        END IF;

        IF (v_item->>'style_id') ~ '^[0-9a-fA-F-]{36}$' THEN
            v_style_id := (v_item->>'style_id')::uuid;
        ELSE
            v_style_id := NULL;
        END IF;

        v_style_name := NULLIF(trim(v_item->>'style_name'), '');
        v_color := NULLIF(trim(v_item->>'color'), '');

        -- Validate gram_per_piece
        v_gram := (v_item->>'gram_per_piece')::numeric;
        IF v_gram IS NULL OR v_gram <= 0 OR v_gram > 50000 THEN
            RETURN jsonb_build_object('success', false, 'error', format('Invalid gram per piece (%s). Must be greater than 0.', v_item->>'gram_per_piece'));
        END IF;

        -- Authoritative quantity from requirement_items snapshot
        SELECT COALESCE(SUM(quantity), 0)
        INTO v_qty
        FROM public.requirement_items
        WHERE requirement_id = v_requirement_id
          AND item_name = v_item_name
          AND COALESCE(style_id::text, 'no_style_id') = COALESCE(v_style_id::text, 'no_style_id')
          AND COALESCE(style_name, 'no_style_name') = COALESCE(v_style_name, 'no_style_name')
          AND COALESCE(color, 'no_color') = COALESCE(v_color, 'no_color');

        v_total_grams := ROUND(v_gram * v_qty, 2);

        -- Upsert into order_inventory_materials
        INSERT INTO public.order_inventory_materials (
            order_id,
            item_name,
            style_id,
            style_name,
            color,
            gram_per_piece,
            quantity,
            total_grams,
            updated_at
        ) VALUES (
            p_order_id,
            v_item_name,
            v_style_id,
            v_style_name,
            v_color,
            v_gram,
            v_qty,
            v_total_grams,
            now()
        )
        ON CONFLICT (
            order_id,
            item_name,
            COALESCE(style_id::text, 'no_style_id'),
            COALESCE(style_name, 'no_style_name'),
            COALESCE(color, 'no_color')
        )
        DO UPDATE SET
            gram_per_piece = EXCLUDED.gram_per_piece,
            quantity = EXCLUDED.quantity,
            total_grams = EXCLUDED.total_grams,
            updated_at = now();

        v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'saved_count', v_count);
END;
$$;
