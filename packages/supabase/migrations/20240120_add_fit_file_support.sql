-- Add FIT file support to activities table
-- This migration adds FIT file storage and processing capabilities

-- Add FIT file path and processing status columns
ALTER TABLE activities 
ADD COLUMN fit_file_path TEXT,
ADD COLUMN processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
ADD COLUMN fit_file_size INTEGER,
ADD COLUMN fit_file_version INTEGER;

-- Add indexes for better query performance
CREATE INDEX idx_activities_processing_status ON activities(processing_status);
CREATE INDEX idx_activities_fit_file_path ON activities(fit_file_path) WHERE fit_file_path IS NOT NULL;

-- Add comment to explain new columns
COMMENT ON COLUMN activities.fit_file_path IS 'Path to FIT file in Supabase Storage';
COMMENT ON COLUMN activities.processing_status IS 'FIT file processing status: pending, processing, completed, failed';
COMMENT ON COLUMN activities.fit_file_size IS 'Size of FIT file in bytes';
COMMENT ON COLUMN activities.fit_file_version IS 'Version of FIT file protocol';

-- Create a storage bucket for FIT files (handled by Supabase Storage API)
-- Bucket name: fit-files
-- RLS policies will be handled separately