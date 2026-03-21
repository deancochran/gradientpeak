-- ============================================================================
-- MESSAGES READ-STATE BACKFILL
--
-- Preserve the only root-level orphan migration change inside the canonical
-- packages/supabase migration history before removing the stray root project.
-- ============================================================================

alter table public.messages
    add column if not exists read_at timestamptz;
