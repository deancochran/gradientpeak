-- The application reads and writes app tables through the backend/service role.
-- Keep direct PostgREST table access closed unless a table later gets explicit
-- ownership/public-read policies and grants.
do $$
declare
  table_record record;
begin
  for table_record in
    select quote_ident(table_schema) as schema_name, quote_ident(table_name) as table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
  loop
    execute format(
      'revoke all on table %s.%s from anon, authenticated',
      table_record.schema_name,
      table_record.table_name
    );

    execute format(
      'grant select, insert, update, delete on table %s.%s to service_role',
      table_record.schema_name,
      table_record.table_name
    );
  end loop;
end $$;

do $$
declare
  sequence_record record;
begin
  for sequence_record in
    select quote_ident(sequence_schema) as schema_name, quote_ident(sequence_name) as sequence_name
    from information_schema.sequences
    where sequence_schema = 'public'
  loop
    execute format(
      'revoke all on sequence %s.%s from anon, authenticated',
      sequence_record.schema_name,
      sequence_record.sequence_name
    );

    execute format(
      'grant usage, select on sequence %s.%s to service_role',
      sequence_record.schema_name,
      sequence_record.sequence_name
    );
  end loop;
end $$;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public grant usage, select on sequences to service_role;
