-- Migration: Fix Quality Check Quantity Validation
-- Enforces passed_quantity + defective_quantity = checked_quantity invariant at both database and RPC level

BEGIN;

-- 1. Update check constraint on public.quality_check_records
ALTER TABLE public.quality_check_records
    DROP CONSTRAINT IF EXISTS chk_qc_quantities;

ALTER TABLE public.quality_check_records
    ADD CONSTRAINT chk_qc_quantities_equal
    CHECK (passed_quantity + defective_quantity = checked_quantity);

-- 2. Update update_quality_check_progress RPC to enforce exact equality
CREATE OR REPLACE FUNCTION public.update_quality_check_progress(
    p_order_id UUID,
    p_checked_quantity INT,
    p_passed_quantity INT,
    p_defective_quantity INT,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_user_id UUID;
    v_qc_id UUID;
    v_qc_status TEXT;
    v_total_qty INT;
    v_hist_note TEXT;
BEGIN
    -- 1. Verify Authentication & Role
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
    IF v_role != 'evenvibe_admin' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized. EvenVibe Admin required.');
    END IF;

    -- 2. Lock & Fetch QC Record
    SELECT id, status, total_quantity INTO v_qc_id, v_qc_status, v_total_qty
    FROM public.quality_check_records
    WHERE order_id = p_order_id
    FOR UPDATE;

    IF v_qc_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Quality check record not found for this order');
    END IF;

    IF v_qc_status != 'in_progress' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot update progress on quality check that is ' || v_qc_status);
    END IF;

    -- 3. Quantity Validations
    IF p_checked_quantity < 0 OR p_checked_quantity > v_total_qty THEN
        RETURN jsonb_build_object('success', false, 'error', format('Checked quantity (%s) must be between 0 and total quantity (%s)', p_checked_quantity, v_total_qty));
    END IF;

    IF p_passed_quantity < 0 OR p_defective_quantity < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Passed and defective quantities cannot be negative');
    END IF;

    IF (p_passed_quantity + p_defective_quantity) != p_checked_quantity THEN
        RETURN jsonb_build_object('success', false, 'error', 'Passed and defective quantities must equal the checked quantity.');
    END IF;

    -- 4. Update QC Record
    UPDATE public.quality_check_records
    SET checked_quantity = p_checked_quantity,
        passed_quantity = p_passed_quantity,
        defective_quantity = p_defective_quantity,
        updated_at = now()
    WHERE id = v_qc_id;

    -- 5. Insert History
    v_hist_note := format('Inspection progress: %s/%s checked (%s passed, %s defective)%s',
        p_checked_quantity,
        v_total_qty,
        p_passed_quantity,
        p_defective_quantity,
        CASE WHEN p_note IS NOT NULL AND trim(p_note) != '' THEN ' — ' || trim(p_note) ELSE '' END
    );

    INSERT INTO public.quality_check_history (
        quality_check_id,
        order_id,
        from_status,
        to_status,
        note,
        changed_by
    ) VALUES (
        v_qc_id,
        p_order_id,
        'in_progress',
        'in_progress',
        v_hist_note,
        v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'checked_quantity', p_checked_quantity,
        'passed_quantity', p_passed_quantity,
        'defective_quantity', p_defective_quantity
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMIT;
