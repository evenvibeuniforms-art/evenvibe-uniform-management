BEGIN;

-- Set simulated session
SET LOCAL request.jwt.claims = '{"sub": "a068ee85-bd10-4e99-8572-be87da83c8cd", "role": "authenticated"}';

-- Call advance_production_stage
SELECT public.advance_production_stage(
    '6c24ca88-7bdc-4496-9328-82c520531486'::uuid,
    'stitching',
    'Cutting stage completed: 13 pieces cut for 10 required pieces.'
);

-- Inspect the generated history entry
SELECT id, from_stage, to_stage, note, created_at
FROM public.production_stage_history
WHERE order_id = '6c24ca88-7bdc-4496-9328-82c520531486'
ORDER BY created_at DESC
LIMIT 3;

-- Inspect workflow status
SELECT sequence_order, stage_key, status
FROM public.order_production_workflows
WHERE order_id = '6c24ca88-7bdc-4496-9328-82c520531486'
ORDER BY sequence_order;

COMMIT;
