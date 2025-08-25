-- ==============================
-- Baseline schema initialization
-- ==============================

-- Create custom enum type
CREATE TYPE sync_status AS ENUM ('local_only', 'pending', 'synced', 'error');

-- ==============================
-- Users table
-- ==============================
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clerk_user_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  username text UNIQUE CHECK (char_length(username) >= 3),
  avatar_url text,
  full_name text,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (id)
);

-- Enable row-level security (RLS) on users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Example policy: allow a user to manage their own row
CREATE POLICY "Users can manage their own record"
ON public.users
FOR ALL
USING (auth.uid()::text = clerk_user_id)
WITH CHECK (auth.uid()::text = clerk_user_id);

-- ==============================
-- Activities table
-- ==============================
CREATE TABLE public.activities (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  local_fit_file_path text NOT NULL,
  sync_status sync_status NOT NULL DEFAULT 'local_only',
  cloud_storage_path text,
  sync_error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activities_pkey PRIMARY KEY (id),
  CONSTRAINT activities_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.users(id)
);

-- Enable RLS
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- Policy: a user can only access their own activities
CREATE POLICY "Users can manage their own activities"
ON public.activities
FOR ALL
USING (auth.uid()::text = (SELECT clerk_user_id FROM public.users WHERE id = user_id))
WITH CHECK (auth.uid()::text = (SELECT clerk_user_id FROM public.users WHERE id = user_id));

-- ==============================
-- Storage setup
-- ==============================

-- Create bucket for activity FIT files
INSERT INTO storage.buckets (id, name, public)
VALUES ('activity-files', 'activity-files', false)
ON CONFLICT (id) DO NOTHING;

-- Allow users to insert into their own folder (UUID prefix)
CREATE POLICY "Users can upload activity files"
ON storage.objects
FOR INSERT
WITH CHECK (
  auth.uid()::text = substring(name from 1 for 36)
  AND bucket_id = 'activity-files'
);

-- Allow users to read their own files
CREATE POLICY "Users can read their own activity files"
ON storage.objects
FOR SELECT
USING (
  auth.uid()::text = substring(name from 1 for 36)
  AND bucket_id = 'activity-files'
);

-- Allow users to delete their own files
CREATE POLICY "Users can delete their own activity files"
ON storage.objects
FOR DELETE
USING (
  auth.uid()::text = substring(name from 1 for 36)
  AND bucket_id = 'activity-files'
);
;