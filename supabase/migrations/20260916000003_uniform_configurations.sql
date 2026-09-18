-- Create uniform configurations table
CREATE TABLE IF NOT EXISTS public.school_uniform_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(school_id, gender)
);

-- Create items table
CREATE TABLE IF NOT EXISTS public.school_uniform_configuration_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    configuration_id UUID NOT NULL REFERENCES public.school_uniform_configurations(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    available_sizes TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
    is_required BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add JSONB to sizes
ALTER TABLE public.student_uniform_sizes 
ADD COLUMN IF NOT EXISTS dynamic_sizes JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Setup RLS on new tables
ALTER TABLE public.school_uniform_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_uniform_configuration_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to avoid errors on retry
DROP POLICY IF EXISTS "Admin full access configurations" ON public.school_uniform_configurations;
DROP POLICY IF EXISTS "School admin select own configurations" ON public.school_uniform_configurations;
DROP POLICY IF EXISTS "Admin full access items" ON public.school_uniform_configuration_items;
DROP POLICY IF EXISTS "School admin select own items" ON public.school_uniform_configuration_items;

-- EvenVibe Admin gets full access
CREATE POLICY "Admin full access configurations" 
ON public.school_uniform_configurations FOR ALL 
USING (public.get_my_role() = 'evenvibe_admin'::app_role) 
WITH CHECK (public.get_my_role() = 'evenvibe_admin'::app_role);

CREATE POLICY "Admin full access items" 
ON public.school_uniform_configuration_items FOR ALL 
USING (public.get_my_role() = 'evenvibe_admin'::app_role) 
WITH CHECK (public.get_my_role() = 'evenvibe_admin'::app_role);

-- School Admin gets SELECT access to their own school
CREATE POLICY "School admin select own configurations" 
ON public.school_uniform_configurations FOR SELECT 
USING (school_id = public.get_my_school_id());

-- For items, they belong to the config, so we join to configurations table to verify school_id
CREATE POLICY "School admin select own items" 
ON public.school_uniform_configuration_items FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.school_uniform_configurations c
        WHERE c.id = configuration_id 
        AND c.school_id = public.get_my_school_id()
    )
);

-- Add index for item lookup efficiency
CREATE INDEX IF NOT EXISTS idx_uniform_config_school ON public.school_uniform_configurations(school_id);
CREATE INDEX IF NOT EXISTS idx_uniform_config_items ON public.school_uniform_configuration_items(configuration_id);
