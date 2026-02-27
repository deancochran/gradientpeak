alter table public.activities
    add column if not exists trimp numeric(10,2),
    add column if not exists trimp_source text;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'activities_trimp_source_check'
          and conrelid = 'public.activities'::regclass
    ) then
        alter table public.activities
            add constraint activities_trimp_source_check
            check (trimp_source in ('hr', 'power_proxy'));
    end if;
end
$$;

create index if not exists idx_activities_trimp
    on public.activities(trimp desc)
    where trimp is not null;

create index if not exists idx_activities_trimp_source
    on public.activities(trimp_source)
    where trimp_source is not null;
