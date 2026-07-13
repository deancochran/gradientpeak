ALTER TABLE public.activity_file_ingestions
  DROP CONSTRAINT IF EXISTS activity_file_ingestions_profile_source_operation_key_unique;

DROP INDEX IF EXISTS public.idx_activity_file_ingestions_processing_reclaim;

ALTER TABLE public.activity_file_ingestions
  DROP COLUMN IF EXISTS operation_key,
  DROP COLUMN IF EXISTS processing_claim_token,
  DROP COLUMN IF EXISTS processing_lease_expires_at;
