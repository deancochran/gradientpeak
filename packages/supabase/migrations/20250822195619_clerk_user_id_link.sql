-- ==============================
-- 1️⃣ Drop policies that reference clerk_user_id
-- ==============================
DROP POLICY IF EXISTS "Users can manage their own record" ON public.users;
DROP POLICY IF EXISTS "Users can manage their own activities" ON public.activities;

-- ==============================
-- 2️⃣ Drop foreign key from activities
-- ==============================
ALTER TABLE public.activities
DROP CONSTRAINT IF EXISTS activities_user_id_fkey;

-- ==============================
-- 3️⃣ Drop clerk_user_id column
-- ==============================
ALTER TABLE public.users
DROP COLUMN IF EXISTS clerk_user_id;

-- ==============================
-- 4️⃣ Drop existing primary key
-- ==============================
ALTER TABLE public.users
DROP CONSTRAINT IF EXISTS users_pkey;

-- ==============================
-- 5️⃣ Recreate primary key
-- ==============================
ALTER TABLE public.users
ADD CONSTRAINT users_pkey PRIMARY KEY (id);

-- ==============================
-- 6️⃣ Add foreign key from activities back to users
-- ==============================
ALTER TABLE public.activities
ADD CONSTRAINT activities_user_id_fkey FOREIGN KEY (user_id)
REFERENCES public.users(id) ON DELETE CASCADE;

-- ==============================
-- 7️⃣ Add foreign key from users to auth.users
-- ==============================
ALTER TABLE public.users
ADD CONSTRAINT users_auth_fk FOREIGN KEY (id)
REFERENCES auth.users(id) ON DELETE CASCADE;

-- ==============================
-- 8️⃣ Recreate RLS policies using id
-- ==============================
-- Users table policy
CREATE POLICY "Users can manage their own record"
ON public.users
FOR ALL
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Activities table policy
CREATE POLICY "Users can manage their own activities"
ON public.activities
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
