-- Migration: 20261019000000_fix_dynamic_stage_output_flow.sql
-- Description: Correct order_stage_items result_quantity to (input_quantity - actual_quantity)
-- and update save_order_stage_items to propagate previous stage output = (input_quantity - actual_quantity).

BEGIN;

-- 1. Alter order_stage_items result_quantity generated formula
ALTER TABLE public.order_stage_items DROP COLUMN IF EXISTS result_quantity;

ALTER TABLE public.order_stage_items
    ADD COLUMN result_quantity INTEGER GENERATED ALWAYS AS (input_quantity - actual_quantity) STORED;

-- 2. Update save_order_stage_items RPC with corrected output propagation
CREATE OR REPLACE FUNCTION public.save_order_stage_items(
    p_order_id UUID,
    p_stage_key TEXT,
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
    v_seq_order INTEGER;
    v_prev_seq INTEGER;
    v_prev_stage_key TEXT;
    v_prev_stage_status TEXT;
    v_item JSONB;
    v_item_name TEXT;
    v_style_id UUID;
    v_style_name TEXT;
    v_color TEXT;
    v_size TEXT;
    v_actual_qty INTEGER;
    v_client_input_qty INTEGER;
    v_auth_input_qty INTEGER;
    v_count INTEGER := 0;
BEGIN
    -- 1. Authentication & Role check
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
    IF v_role != 'evenvibe_admin' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized. EvenVibe Admin required.');
    END IF;

    -- 2. Verify Order
    SELECT status INTO v_order_status FROM public.orders WHERE id = p_order_id;
    IF v_order_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    -- 3. Resolve sequence order of p_stage_key
    SELECT sequence_order INTO v_seq_order
    FROM public.order_production_workflows
    WHERE order_id = p_order_id AND stage_key = p_stage_key;

    IF v_seq_order IS NULL OR v_seq_order < 4 OR v_seq_order > 7 THEN
        RETURN jsonb_build_object('success', false, 'error', format('Invalid dynamic stage key: %s', p_stage_key));
    END IF;

    -- 4. Verify previous stage is completed
    v_prev_seq := v_seq_order - 1;
    SELECT stage_key, status INTO v_prev_stage_key, v_prev_stage_status
    FROM public.order_production_workflows
    WHERE order_id = p_order_id AND sequence_order = v_prev_seq;

    IF v_prev_stage_status != 'completed' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Previous stage (%s) must be completed before saving %s.', v_prev_stage_key, p_stage_key)
        );
    END IF;

    -- 5. Process and validate each item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_name := trim(v_item->>'item_name');
        IF v_item->>'style_id' IS NOT NULL AND v_item->>'style_id' != '' THEN
            v_style_id := (v_item->>'style_id')::UUID;
        ELSE
            v_style_id := NULL;
        END IF;
        v_style_name := NULLIF(trim(v_item->>'style_name'), '');
        v_color := NULLIF(trim(v_item->>'color'), '');
        v_size := trim(v_item->>'size');

        IF v_item_name IS NULL OR v_item_name = '' OR v_size IS NULL OR v_size = '' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Item name and size are required for all rows.');
        END IF;

        -- Extract actual mistaked quantity
        BEGIN
            v_actual_qty := (v_item->>'actual_quantity')::INTEGER;
        EXCEPTION WHEN OTHERS THEN
            RETURN jsonb_build_object('success', false, 'error', format('Invalid actual quantity for %s (%s).', v_item_name, v_size));
        END;

        IF v_actual_qty IS NULL OR v_actual_qty < 0 THEN
            RETURN jsonb_build_object('success', false, 'error', format('Actual mistaked quantity for %s (%s) must be 0 or greater.', v_item_name, v_size));
        END IF;

        -- Derive Authoritative Previous Stage Output (which is this stage's input)
        IF v_prev_seq = 3 THEN
            -- Previous stage is Cutting: output is Cut Quantity (cut_quantity) from order_cutting_items
            SELECT cut_quantity INTO v_auth_input_qty
            FROM public.order_cutting_items
            WHERE order_id = p_order_id
              AND lower(trim(item_name)) = lower(v_item_name)
              AND COALESCE(style_id::text, 'no_style_id') = COALESCE(v_style_id::text, 'no_style_id')
              AND COALESCE(lower(trim(style_name)), 'no_style_name') = COALESCE(lower(v_style_name), 'no_style_name')
              AND COALESCE(lower(trim(color)), 'no_color') = COALESCE(lower(v_color), 'no_color')
              AND lower(trim(size)) = lower(v_size);
        ELSE
            -- Previous stage is middle stage (4, 5, or 6): output is result_quantity (input_quantity - actual_quantity)
            SELECT (input_quantity - actual_quantity) INTO v_auth_input_qty
            FROM public.order_stage_items
            WHERE order_id = p_order_id
              AND stage_key = v_prev_stage_key
              AND lower(trim(item_name)) = lower(v_item_name)
              AND COALESCE(style_id::text, 'no_style_id') = COALESCE(v_style_id::text, 'no_style_id')
              AND COALESCE(lower(trim(style_name)), 'no_style_name') = COALESCE(lower(v_style_name), 'no_style_name')
              AND COALESCE(lower(trim(color)), 'no_color') = COALESCE(lower(v_color), 'no_color')
              AND lower(trim(size)) = lower(v_size);
        END IF;

        IF v_auth_input_qty IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', format('No previous stage output found for %s (%s) from %s.', v_item_name, v_size, v_prev_stage_key)
            );
        END IF;

        IF v_actual_qty > v_auth_input_qty THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', format('Actual mistaked quantity (%s) cannot exceed input quantity (%s) for %s (%s).', v_actual_qty, v_auth_input_qty, v_item_name, v_size)
            );
        END IF;

        -- Client input validation: reject fabricated input quantity
        IF v_item->>'input_quantity' IS NOT NULL THEN
            BEGIN
                v_client_input_qty := (v_item->>'input_quantity')::INTEGER;
                IF v_client_input_qty != v_auth_input_qty THEN
                    RETURN jsonb_build_object(
                        'success', false,
                        'error', 'Stage input does not match the previous stage output.'
                    );
                END IF;
            EXCEPTION WHEN OTHERS THEN
                RETURN jsonb_build_object('success', false, 'error', 'Stage input does not match the previous stage output.');
            END;
        END IF;

        -- Upsert record into order_stage_items
        INSERT INTO public.order_stage_items (
            order_id,
            stage_key,
            sequence_order,
            item_name,
            style_id,
            style_name,
            color,
            size,
            input_quantity,
            actual_quantity,
            status,
            updated_at
        ) VALUES (
            p_order_id,
            p_stage_key,
            v_seq_order,
            v_item_name,
            v_style_id,
            v_style_name,
            v_color,
            v_size,
            v_auth_input_qty,
            v_actual_qty,
            'completed',
            now()
        )
        ON CONFLICT (
            order_id,
            stage_key,
            item_name,
            COALESCE(style_id::text, 'no_style_id'),
            COALESCE(style_name, 'no_style_name'),
            COALESCE(color, 'no_color'),
            size
        )
        DO UPDATE SET
            input_quantity = EXCLUDED.input_quantity,
            actual_quantity = EXCLUDED.actual_quantity,
            status = 'completed',
            updated_at = now();

        v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'saved_count', v_count);
END;
$$;

COMMIT;
