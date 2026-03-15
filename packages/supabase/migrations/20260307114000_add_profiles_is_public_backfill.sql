-- ============================================================================
-- PROFILE PRIVACY BACKFILL
--
-- Some environments were provisioned before profiles.is_public existed.
-- Profiles router and UI now depend on this column for public/private behavior.
-- ============================================================================

alter table public.profiles
    add column if not exists is_public boolean;

update public.profiles
set is_public = false
where is_public is null;

alter table public.profiles
    alter column is_public set default false,
    alter column is_public set not null;
