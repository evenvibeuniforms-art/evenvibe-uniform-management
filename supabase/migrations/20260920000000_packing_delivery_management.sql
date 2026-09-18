-- Migration: Packing & Delivery Management Module
-- Phase: EvenVibe Admin Packing & Delivery Management

BEGIN;

-- 1. Create public.packing_records table
CREATE TABLE IF NOT EXISTS public.packing_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'in_progress', 'completed')
    ),
    total_quantity INTEGER NOT NULL CHECK (total_quantity >= 0),
    packed_quantity INTEGER NOT NULL DEFAULT 0 CHECK (
        packed_quantity >= 0 AND packed_quantity <= total_quantity
    ),
    remarks TEXT NULL,
    started_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    packed_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for packing_records
CREATE INDEX IF NOT EXISTS packing_records_order_id_idx ON public.packing_records(order_id);
CREATE INDEX IF NOT EXISTS packing_records_status_idx ON public.packing_records(status);
CREATE INDEX IF NOT EXISTS packing_records_created_at_idx ON public.packing_records(created_at);

-- Trigger for updated_at on packing_records
DROP TRIGGER IF EXISTS set_packing_records_updated_at ON public.packing_records;
CREATE TRIGGER set_packing_records_updated_at
    BEFORE UPDATE ON public.packing_records
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 2. Create public.packing_checklist_items table
CREATE TABLE IF NOT EXISTS public.packing_checklist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    packing_record_id UUID NOT NULL REFERENCES public.packing_records(id) ON DELETE CASCADE,
    item_key TEXT NOT NULL,
    label TEXT NOT NULL,
    is_completed BOOLEAN NOT NULL DEFAULT false,
    completed_by UUID REFERENCES auth.users(id),
    completed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_packing_checklist_item UNIQUE(packing_record_id, item_key)
);

-- Indexes for packing_checklist_items
CREATE INDEX IF NOT EXISTS packing_checklist_record_id_idx ON public.packing_checklist_items(packing_record_id);

-- Trigger for updated_at on packing_checklist_items
DROP TRIGGER IF EXISTS set_packing_checklist_updated_at ON public.packing_checklist_items;
CREATE TRIGGER set_packing_checklist_updated_at
    BEFORE UPDATE ON public.packing_checklist_items
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 3. Create public.packing_history table
CREATE TABLE IF NOT EXISTS public.packing_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    packing_record_id UUID NOT NULL REFERENCES public.packing_records(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    from_status TEXT NULL,
    to_status TEXT NOT NULL,
    note TEXT NULL,
    changed_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for packing_history
CREATE INDEX IF NOT EXISTS packing_history_order_id_idx ON public.packing_history(order_id);
CREATE INDEX IF NOT EXISTS packing_history_record_id_idx ON public.packing_history(packing_record_id);
CREATE INDEX IF NOT EXISTS packing_history_created_at_idx ON public.packing_history(created_at);

-- 4. Row Level Security
ALTER TABLE public.packing_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packing_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packing_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "EvenVive Admins can manage packing_records" ON public.packing_records;
DROP POLICY IF EXISTS "School Admins can view own packing_records" ON public.packing_records;
DROP POLICY IF EXISTS "EvenVive Admins can manage packing_checklist_items" ON public.packing_checklist_items;
DROP POLICY IF EXISTS "School Admins can view own packing_checklist_items" ON public.packing_checklist_items;
DROP POLICY IF EXISTS "EvenVive Admins can manage packing_history" ON public.packing_history;
DROP POLICY IF EXISTS "School Admins can view own packing_history" ON public.packing_history;

-- Admin policies (Full access for EvenVibe Admins)
CREATE POLICY "EvenVive Admins can manage packing_records"
    ON public.packing_records FOR ALL
    USING (public.get_my_role() = 'evenvibe_admin')
    WITH CHECK (public.get_my_role() = 'evenvibe_admin');

CREATE POLICY "EvenVive Admins can manage packing_checklist_items"
    ON public.packing_checklist_items FOR ALL
    USING (public.get_my_role() = 'evenvibe_admin')
    WITH CHECK (public.get_my_role() = 'evenvibe_admin');

CREATE POLICY "EvenVive Admins can manage packing_history"
    ON public.packing_history FOR ALL
    USING (public.get_my_role() = 'evenvibe_admin')
    WITH CHECK (public.get_my_role() = 'evenvibe_admin');

-- School Admin policies (Read-only for their own school orders)
CREATE POLICY "School Admins can view own packing_records"
    ON public.packing_records FOR SELECT
    USING (
        order_id IN (
            SELECT id FROM public.orders WHERE school_id = public.get_my_school_id()
        ) AND public.get_my_role() = 'school_admin'
    );

CREATE POLICY "School Admins can view own packing_checklist_items"
    ON public.packing_checklist_items FOR SELECT
    USING (
        packing_record_id IN (
            SELECT pr.id FROM public.packing_records pr
            JOIN public.orders o ON pr.order_id = o.id
            WHERE o.school_id = public.get_my_school_id()
        ) AND public.get_my_role() = 'school_admin'
    );

CREATE POLICY "School Admins can view own packing_history"
    ON public.packing_history FOR SELECT
    USING (
        order_id IN (
            SELECT id FROM public.orders WHERE school_id = public.get_my_school_id()
        ) AND public.get_my_role() = 'school_admin'
    );

-- 5. Table Grants (Mandatory for authenticated role)
GRANT SELECT, INSERT, UPDATE ON public.packing_records TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.packing_checklist_items TO authenticated;
GRANT SELECT, INSERT ON public.packing_history TO authenticated;

-- 6. Atomic RPC to Start Packing
CREATE OR REPLACE FUNCTION public.start_packing(
    p_order_id UUID,
    p_remarks TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_user_id UUID;
    v_order_status TEXT;
    v_requirement_id UUID;
    v_qc_status TEXT;
    v_total_qty INTEGER := 0;
    v_existing_packing_id UUID;
    v_new_packing_id UUID;
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

    -- 2. Lock & Fetch Order
    SELECT status, requirement_id INTO v_order_status, v_requirement_id
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    IF v_order_status != 'packed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order must be in packed status to start packing. Current status: ' || v_order_status);
    END IF;

    -- 3. Verify QC status = 'passed'
    SELECT status INTO v_qc_status
    FROM public.quality_check_records
    WHERE order_id = p_order_id;

    IF v_qc_status IS NULL OR v_qc_status != 'passed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Quality check must be passed before starting packing. Current QC status: ' || COALESCE(v_qc_status, 'none'));
    END IF;

    -- 4. Check for existing packing record
    SELECT id INTO v_existing_packing_id
    FROM public.packing_records
    WHERE order_id = p_order_id;

    IF v_existing_packing_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Packing record already exists for this order');
    END IF;

    -- 5. Calculate historical total quantity from requirement_items snapshot
    SELECT COALESCE(SUM(quantity), 0) INTO v_total_qty
    FROM public.requirement_items
    WHERE requirement_id = v_requirement_id;

    -- 6. Insert packing_records entry
    INSERT INTO public.packing_records (
        order_id,
        status,
        total_quantity,
        packed_quantity,
        remarks,
        started_at,
        packed_by
    ) VALUES (
        p_order_id,
        'in_progress',
        v_total_qty,
        0,
        p_remarks,
        now(),
        v_user_id
    ) RETURNING id INTO v_new_packing_id;

    -- 7. Seed standard 5 checklist items
    INSERT INTO public.packing_checklist_items (packing_record_id, item_key, label, is_completed)
    VALUES
        (v_new_packing_id, 'quantity_verified', 'Quantity Verified', false),
        (v_new_packing_id, 'items_packed', 'Items Packed', false),
        (v_new_packing_id, 'labels_attached', 'Labels Attached', false),
        (v_new_packing_id, 'order_details_verified', 'Order / School Details Verified', false),
        (v_new_packing_id, 'packaging_completed', 'Packaging Completed', false);

    -- 8. Insert packing_history entry
    INSERT INTO public.packing_history (
        packing_record_id,
        order_id,
        from_status,
        to_status,
        note,
        changed_by
    ) VALUES (
        v_new_packing_id,
        p_order_id,
        NULL,
        'in_progress',
        COALESCE(p_remarks, 'Packing started'),
        v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'packing_id', v_new_packing_id,
        'total_quantity', v_total_qty
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 7. Atomic RPC to Update Packing Progress
CREATE OR REPLACE FUNCTION public.update_packing_progress(
    p_order_id UUID,
    p_packed_quantity INT,
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
    v_packing_id UUID;
    v_packing_status TEXT;
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

    -- 2. Lock & Fetch Packing Record
    SELECT id, status, total_quantity INTO v_packing_id, v_packing_status, v_total_qty
    FROM public.packing_records
    WHERE order_id = p_order_id
    FOR UPDATE;

    IF v_packing_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Packing record not found for this order');
    END IF;

    IF v_packing_status != 'in_progress' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot update progress on packing that is ' || v_packing_status);
    END IF;

    -- 3. Quantity Validations
    IF p_packed_quantity < 0 OR p_packed_quantity > v_total_qty THEN
        RETURN jsonb_build_object('success', false, 'error', format('Packed quantity (%s) must be between 0 and total quantity (%s)', p_packed_quantity, v_total_qty));
    END IF;

    -- 4. Update Packing Record
    UPDATE public.packing_records
    SET packed_quantity = p_packed_quantity,
        updated_at = now()
    WHERE id = v_packing_id;

    -- 5. Insert History
    v_hist_note := format('Packing progress: %s/%s items packed%s',
        p_packed_quantity,
        v_total_qty,
        CASE WHEN p_note IS NOT NULL AND trim(p_note) != '' THEN ' — ' || trim(p_note) ELSE '' END
    );

    INSERT INTO public.packing_history (
        packing_record_id,
        order_id,
        from_status,
        to_status,
        note,
        changed_by
    ) VALUES (
        v_packing_id,
        p_order_id,
        'in_progress',
        'in_progress',
        v_hist_note,
        v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'packed_quantity', p_packed_quantity,
        'total_quantity', v_total_qty
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 8. Atomic RPC to Update Packing Checklist Item
CREATE OR REPLACE FUNCTION public.update_packing_checklist_item(
    p_packing_record_id UUID,
    p_item_key TEXT,
    p_is_completed BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_user_id UUID;
    v_checklist_id UUID;
    v_completed_by UUID;
    v_completed_at TIMESTAMPTZ;
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

    -- 2. Verify Checklist Item exists
    SELECT id INTO v_checklist_id
    FROM public.packing_checklist_items
    WHERE packing_record_id = p_packing_record_id AND item_key = p_item_key;

    IF v_checklist_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Checklist item not found');
    END IF;

    -- 3. Set completion details
    IF p_is_completed THEN
        v_completed_by := v_user_id;
        v_completed_at := now();
    ELSE
        v_completed_by := NULL;
        v_completed_at := NULL;
    END IF;

    UPDATE public.packing_checklist_items
    SET is_completed = p_is_completed,
        completed_by = v_completed_by,
        completed_at = v_completed_at,
        updated_at = now()
    WHERE id = v_checklist_id;

    RETURN jsonb_build_object(
        'success', true,
        'item_key', p_item_key,
        'is_completed', p_is_completed
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 9. Atomic RPC to Complete Packing
CREATE OR REPLACE FUNCTION public.complete_packing(
    p_order_id UUID,
    p_remarks TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_user_id UUID;
    v_packing_id UUID;
    v_packing_status TEXT;
    v_total_qty INT;
    v_packed_qty INT;
    v_uncompleted_count INT;
    v_note TEXT;
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

    -- 2. Lock & Fetch Packing Record
    SELECT id, status, total_quantity, packed_quantity
    INTO v_packing_id, v_packing_status, v_total_qty, v_packed_qty
    FROM public.packing_records
    WHERE order_id = p_order_id
    FOR UPDATE;

    IF v_packing_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Packing record not found for this order');
    END IF;

    IF v_packing_status != 'in_progress' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Packing is already ' || v_packing_status);
    END IF;

    -- 3. Verify packed_quantity = total_quantity
    IF v_packed_qty != v_total_qty THEN
        RETURN jsonb_build_object('success', false, 'error', format('All %s items must be packed before completion. Currently packed: %s.', v_total_qty, v_packed_qty));
    END IF;

    -- 4. Verify all checklist items are completed
    SELECT count(*) INTO v_uncompleted_count
    FROM public.packing_checklist_items
    WHERE packing_record_id = v_packing_id AND is_completed = false;

    IF v_uncompleted_count > 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Complete all packing checklist items before completing packing.');
    END IF;

    -- 5. Mark Packing Completed (orders.status remains 'packed' until dispatch!)
    v_note := COALESCE(p_remarks, 'All items packed and verified. Ready for courier dispatch.');

    UPDATE public.packing_records
    SET status = 'completed',
        completed_at = now(),
        remarks = COALESCE(p_remarks, remarks),
        updated_at = now()
    WHERE id = v_packing_id;

    -- 6. Insert Packing History
    INSERT INTO public.packing_history (
        packing_record_id,
        order_id,
        from_status,
        to_status,
        note,
        changed_by
    ) VALUES (
        v_packing_id,
        p_order_id,
        'in_progress',
        'completed',
        v_note,
        v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', 'completed'
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 10. Atomic RPC to Dispatch Order
CREATE OR REPLACE FUNCTION public.dispatch_order(
    p_order_id UUID,
    p_courier_name TEXT,
    p_tracking_number TEXT,
    p_estimated_delivery DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_user_id UUID;
    v_order_status TEXT;
    v_packing_id UUID;
    v_packing_status TEXT;
    v_note TEXT;
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

    -- 2. Input Validations
    IF p_courier_name IS NULL OR trim(p_courier_name) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Courier name is required.');
    END IF;

    IF p_tracking_number IS NULL OR trim(p_tracking_number) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Tracking number is required.');
    END IF;

    IF p_estimated_delivery IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estimated delivery date is required.');
    END IF;

    -- 3. Lock & Fetch Order
    SELECT status INTO v_order_status
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    IF v_order_status != 'packed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order must be in packed status to dispatch. Current status: ' || v_order_status);
    END IF;

    -- 4. Lock & Verify Packing Record is completed
    SELECT id, status INTO v_packing_id, v_packing_status
    FROM public.packing_records
    WHERE order_id = p_order_id
    FOR UPDATE;

    IF v_packing_id IS NULL OR v_packing_status != 'completed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Packing must be completed before dispatching the order.');
    END IF;

    -- 5. Update Order to 'dispatched'
    UPDATE public.orders
    SET status = 'dispatched',
        courier_name = trim(p_courier_name),
        tracking_number = trim(p_tracking_number),
        estimated_delivery = p_estimated_delivery,
        shipped_at = now(),
        updated_at = now()
    WHERE id = p_order_id;

    v_note := format('Dispatched via %s (Tracking: %s, Est. Delivery: %s)',
        trim(p_courier_name),
        trim(p_tracking_number),
        to_char(p_estimated_delivery, 'YYYY-MM-DD')
    );

    -- 6. Insert Order Status History
    INSERT INTO public.order_status_history (
        order_id,
        status,
        note
    ) VALUES (
        p_order_id,
        'dispatched',
        v_note
    );

    -- 7. Insert Packing History
    INSERT INTO public.packing_history (
        packing_record_id,
        order_id,
        from_status,
        to_status,
        note,
        changed_by
    ) VALUES (
        v_packing_id,
        p_order_id,
        'completed',
        'dispatched',
        v_note,
        v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', 'dispatched'
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 11. Atomic RPC to Mark Order In Transit
CREATE OR REPLACE FUNCTION public.mark_order_in_transit(
    p_order_id UUID,
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
    v_order_status TEXT;
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

    -- 2. Lock & Fetch Order
    SELECT status INTO v_order_status
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    IF v_order_status != 'dispatched' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order must be dispatched before moving to in transit. Current status: ' || v_order_status);
    END IF;

    -- 3. Update Order
    UPDATE public.orders
    SET status = 'in_transit',
        updated_at = now()
    WHERE id = p_order_id;

    v_hist_note := COALESCE(p_note, 'Shipment is in transit with courier');

    -- 4. Insert Order Status History
    INSERT INTO public.order_status_history (
        order_id,
        status,
        note
    ) VALUES (
        p_order_id,
        'in_transit',
        v_hist_note
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', 'in_transit'
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 12. Atomic RPC to Mark Order Delivered
CREATE OR REPLACE FUNCTION public.mark_order_delivered(
    p_order_id UUID,
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
    v_order_status TEXT;
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

    -- 2. Lock & Fetch Order
    SELECT status INTO v_order_status
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    IF v_order_status != 'in_transit' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order must be in transit before marking delivered. Current status: ' || v_order_status);
    END IF;

    -- 3. Update Order to 'delivered'
    UPDATE public.orders
    SET status = 'delivered',
        delivered_at = now(),
        updated_at = now()
    WHERE id = p_order_id;

    v_hist_note := COALESCE(p_note, 'Consignment delivered to school premises');

    -- 4. Insert Order Status History
    INSERT INTO public.order_status_history (
        order_id,
        status,
        note
    ) VALUES (
        p_order_id,
        'delivered',
        v_hist_note
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', 'delivered'
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMIT;
