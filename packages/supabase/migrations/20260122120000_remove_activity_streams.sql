-- Migration: Remove activity_streams table and simplify architecture
-- Created: 2026-01-22
-- Description: Drop activity_streams table as stream data is now stored in activities.metrics.streams

-- Drop indexes first
DROP INDEX IF EXISTS idx_activity_streams_activity_id;
DROP INDEX IF EXISTS idx_activity_streams_type;
DROP INDEX IF EXISTS activity_streams_idx_key;
DROP INDEX IF EXISTS activity_streams_pkey;
DROP INDEX IF EXISTS unique_activity_type;

-- Drop foreign key constraint
ALTER TABLE public.activity_streams DROP CONSTRAINT IF EXISTS activity_streams_activity_id_fkey;

-- Drop the table
DROP TABLE IF EXISTS public.activity_streams CASCADE;

-- Drop sequence
DROP SEQUENCE IF EXISTS public.activity_streams_idx_seq;

-- Update RLS settings (table no longer exists)
-- No need to disable RLS on non-existent table