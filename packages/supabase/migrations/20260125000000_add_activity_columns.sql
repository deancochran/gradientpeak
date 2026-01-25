-- Migration: Add new columns to activities table
-- Created: 2026-01-25
-- Description: Adds geospatial, structure, power analysis, swim metrics, and device info columns

-- Geospatial
ALTER TABLE activities
ADD COLUMN IF NOT EXISTS polyline TEXT,
ADD COLUMN IF NOT EXISTS map_bounds JSONB;

-- Structure
ALTER TABLE activities
ADD COLUMN IF NOT EXISTS laps JSONB DEFAULT '[]'::jsonb;

-- Power Analysis
ALTER TABLE activities
ADD COLUMN IF NOT EXISTS power_curve JSONB;

-- Swim Metrics
ALTER TABLE activities
ADD COLUMN IF NOT EXISTS total_strokes INTEGER,
ADD COLUMN IF NOT EXISTS avg_swolf NUMERIC,
ADD COLUMN IF NOT EXISTS pool_length NUMERIC,
ADD COLUMN IF NOT EXISTS pool_length_unit TEXT;

-- Device
ALTER TABLE activities
ADD COLUMN IF NOT EXISTS device_name TEXT;

-- Add comments for documentation
COMMENT ON COLUMN activities.map_bounds IS 'Store min/max lat/lng { minLat, maxLat, minLng, maxLng }';
COMMENT ON COLUMN activities.power_curve IS 'Critical power values { "1s": number, "30s": number, "1m": number, "5m": number, "20m": number, "60m": number }';
