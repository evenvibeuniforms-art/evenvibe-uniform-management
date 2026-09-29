-- Reset order 6c24ca88-7bdc-4496-9328-82c520531486 Cutting stage to in_progress so the user can test the UI click
UPDATE public.order_production_workflows
SET status = 'in_progress', completed_at = NULL, updated_at = now()
WHERE order_id = '6c24ca88-7bdc-4496-9328-82c520531486' AND sequence_order = 3;

DELETE FROM public.production_stage_history
WHERE order_id = '6c24ca88-7bdc-4496-9328-82c520531486'
  AND from_stage = 'cutting'
  AND to_stage = 'stitching';
