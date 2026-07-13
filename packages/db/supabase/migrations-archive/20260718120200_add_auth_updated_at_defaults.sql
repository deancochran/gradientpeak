alter table public.accounts alter column updated_at set default now();
alter table public.sessions alter column updated_at set default now();
