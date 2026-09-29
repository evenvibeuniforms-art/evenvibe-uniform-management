-- Migration: 20261109000000_performance_optimization_indexes.sql
-- Description: Composite and covering indexes for optimized dashboard queries, student filtering, stage workflows, and notifications

-- 1. Order Delivery Students: Received status lookups and delivery filters
CREATE INDEX IF NOT EXISTS idx_order_delivery_students_school_received
    ON public.order_delivery_student_items (school_id, is_received);

CREATE INDEX IF NOT EXISTS idx_order_delivery_students_order_delivered
    ON public.order_delivery_student_items (order_id, is_delivered);

-- 2. Student Sizes: Fast student-level size lookup
CREATE INDEX IF NOT EXISTS idx_student_uniform_sizes_student_complete
    ON public.student_uniform_sizes (student_id, is_complete);

-- 3. Students: Compound multi-column class/section queries
CREATE INDEX IF NOT EXISTS idx_students_school_class_section_active
    ON public.students (school_id, class_name, section, is_active);

-- 4. Global Orders: Admin status pipelines and sorting
CREATE INDEX IF NOT EXISTS idx_orders_status_created
    ON public.orders (status, created_at DESC);

-- 5. Alteration Requests: Fast lookups per student and order
CREATE INDEX IF NOT EXISTS idx_alteration_requests_order_status
    ON public.alteration_requests (order_id, status);

CREATE INDEX IF NOT EXISTS idx_alteration_requests_student_status
    ON public.alteration_requests (student_id, status);

-- 6. Notifications: Fast unread and chronological feed resolution
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created
    ON public.notifications (user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_school_read_created
    ON public.notifications (school_id, is_read, created_at DESC);

-- 7. Order Production Workflows: Specific stage gate lookups
CREATE INDEX IF NOT EXISTS idx_order_workflows_order_stage_status
    ON public.order_production_workflows (order_id, stage_key, status);
