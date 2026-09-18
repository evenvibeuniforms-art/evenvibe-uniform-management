-- Migration: 20260927000000_production_performance_indexes.sql
-- Description: Composite and covering indexes for multi-tenant queries, status filtering, and chronological sorting

-- 1. Orders table: Multi-tenant status filtering and dashboard sorting
CREATE INDEX IF NOT EXISTS idx_orders_school_status 
    ON public.orders (school_id, status);

CREATE INDEX IF NOT EXISTS idx_orders_school_created 
    ON public.orders (school_id, created_at DESC);

-- 2. Students table: Active status and class filtering within schools
CREATE INDEX IF NOT EXISTS idx_students_school_active 
    ON public.students (school_id, is_active);

CREATE INDEX IF NOT EXISTS idx_students_school_class 
    ON public.students (school_id, class_name);

CREATE INDEX IF NOT EXISTS idx_students_school_created 
    ON public.students (school_id, created_at DESC);

-- 3. Student Uniform Sizes: Pending vs completed size collection
CREATE INDEX IF NOT EXISTS idx_student_uniform_sizes_school_complete 
    ON public.student_uniform_sizes (school_id, is_complete);

-- 4. Requirements table: School requirement status and history
CREATE INDEX IF NOT EXISTS idx_requirements_school_status 
    ON public.requirements (school_id, status);

CREATE INDEX IF NOT EXISTS idx_requirements_school_created 
    ON public.requirements (school_id, created_at DESC);

-- 5. Requirement Students: Fast student participation lookups
CREATE INDEX IF NOT EXISTS idx_requirement_students_req_student 
    ON public.requirement_students (requirement_id, student_id);

-- 6. TC Students: Chronological pagination within school
CREATE INDEX IF NOT EXISTS idx_tc_students_school_created 
    ON public.tc_students (school_id, created_at DESC);

-- 7. Alteration Requests: School status filtering and sorting
CREATE INDEX IF NOT EXISTS idx_alterations_school_status 
    ON public.alteration_requests (school_id, status);

CREATE INDEX IF NOT EXISTS idx_alterations_school_created 
    ON public.alteration_requests (school_id, created_at DESC);

-- 8. Production, QC, and Packing: Fast stage and status resolution per order
CREATE INDEX IF NOT EXISTS idx_production_records_order_stage 
    ON public.production_records (order_id, stage);

CREATE INDEX IF NOT EXISTS idx_quality_check_records_order_status 
    ON public.quality_check_records (order_id, status);

CREATE INDEX IF NOT EXISTS idx_packing_records_order_status 
    ON public.packing_records (order_id, status);
