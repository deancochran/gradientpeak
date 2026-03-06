-- Add follow_request to notification_type enum
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'follow_request';
