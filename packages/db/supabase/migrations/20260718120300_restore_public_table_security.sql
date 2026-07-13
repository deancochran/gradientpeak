-- Relational access is backend-owned. Drizzle push can recreate tables without
-- Supabase-specific RLS and grants, so restore those controls for the complete
-- current public table catalog without adding direct-client policies.
do $$
declare
  table_record record;
begin
  for table_record in
    select n.nspname as schema_name, c.relname as table_name
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  loop
    execute format('alter table %I.%I enable row level security', table_record.schema_name, table_record.table_name);
    execute format('revoke all on table %I.%I from public, anon, authenticated', table_record.schema_name, table_record.table_name);
    execute format('grant select, insert, update, delete on table %I.%I to service_role', table_record.schema_name, table_record.table_name);
  end loop;
end $$;

do $$
declare
  sequence_record record;
begin
  for sequence_record in
    select n.nspname as schema_name, c.relname as sequence_name
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'S'
  loop
    execute format('revoke all on sequence %I.%I from public, anon, authenticated', sequence_record.schema_name, sequence_record.sequence_name);
    execute format('grant usage, select on sequence %I.%I to service_role', sequence_record.schema_name, sequence_record.sequence_name);
  end loop;
end $$;

do $$
declare
  owner_role text;
begin
  -- Catalog inspection found postgres owns all current public tables/sequences and
  -- is the migration executor. Keep this guarded for reduced-role environments.
  foreach owner_role in array array['postgres', current_user]
  loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = owner_role) then
      execute format('alter default privileges for role %I in schema public revoke all on tables from public, anon, authenticated', owner_role);
      execute format('alter default privileges for role %I in schema public grant select, insert, update, delete on tables to service_role', owner_role);
      execute format('alter default privileges for role %I in schema public revoke all on sequences from public, anon, authenticated', owner_role);
      execute format('alter default privileges for role %I in schema public grant usage, select on sequences to service_role', owner_role);
    end if;
  end loop;
end $$;
