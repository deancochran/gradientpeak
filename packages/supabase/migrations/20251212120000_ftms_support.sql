-- ==========================================
-- Target Adherence Support Migration
-- ==========================================
-- Purpose: Add target adherence tracking for planned workouts
-- Date: 2025-12-12
-- ==========================================

-- Add target adherence column to activities table
-- This tracks how well the user adhered to planned workout targets
-- Applicable to any planned activity (FTMS-controlled or manual)
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS avg_target_adherence numeric(5,2)
    CHECK (avg_target_adherence >= 0 AND avg_target_adherence <= 100);

-- Add comment documentation
COMMENT ON COLUMN activities.avg_target_adherence IS
  'Average adherence to planned workout targets (0-100%). Calculated for any planned activity regardless of trainer control method.';
