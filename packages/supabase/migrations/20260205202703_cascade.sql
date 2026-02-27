do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'gender' and n.nspname = 'public'
  ) then
    create type "public"."gender" as enum ('male', 'female', 'other');
  end if;
end
$$;

alter table "public"."profiles" add column if not exists "gender" public.gender;

