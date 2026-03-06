-- Add read_at column to messages for read/unread tracking
ALTER TABLE messages ADD COLUMN read_at TIMESTAMPTZ;

-- Add follow_request to notification_type enum
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'follow_request';
