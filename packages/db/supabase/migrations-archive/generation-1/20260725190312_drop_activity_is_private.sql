-- content_visibility is already non-null and constrained. Preserve every
-- canonical visibility value (including followers) while removing the legacy
-- boolean authority.
alter table public.activities drop column if exists is_private;
