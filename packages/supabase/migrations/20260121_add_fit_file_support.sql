-- Migration: Add FIT file support
-- Created: 2026-01-21
-- Description: Add columns for FIT file processing and remove activity_streams

-- Add columns to activities
ALTER TABLE activities
ADD COLUMN IF NOT EXISTS fit_file_path TEXT,
ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS processing_error TEXT,
ADD COLUMN IF NOT EXISTS fit_file_size BIGINT;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_activities_processing_status ON activities(processing_status);
CREATE INDEX IF NOT EXISTS idx_activities_fit_path ON activities(fit_file_path);

-- Drop activity_streams table
DROP TABLE IF EXISTS activity_streams;
