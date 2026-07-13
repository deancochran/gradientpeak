-- Relational access is backend-owned. Drizzle push can recreate tables without
-- Supabase-specific RLS and grants, so restore those controls for the complete
-- current public table catalog without adding direct-client policies.
DO $$
DECLARE
	table_record record;
BEGIN
	FOR table_record IN
		SELECT n.nspname AS schema_name, c.relname AS table_name
		FROM pg_catalog.pg_class c
		JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = 'public'
			AND c.relkind IN ('r', 'p')
	LOOP
		EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', table_record.schema_name, table_record.table_name);
		EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM PUBLIC, anon, authenticated', table_record.schema_name, table_record.table_name);
		EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I.%I TO service_role', table_record.schema_name, table_record.table_name);
	END LOOP;
END $$;
--> statement-breakpoint
DO $$
DECLARE
	sequence_record record;
BEGIN
	FOR sequence_record IN
		SELECT n.nspname AS schema_name, c.relname AS sequence_name
		FROM pg_catalog.pg_class c
		JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = 'public'
			AND c.relkind = 'S'
	LOOP
		EXECUTE format('REVOKE ALL ON SEQUENCE %I.%I FROM PUBLIC, anon, authenticated', sequence_record.schema_name, sequence_record.sequence_name);
		EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I.%I TO service_role', sequence_record.schema_name, sequence_record.sequence_name);
	END LOOP;
END $$;
--> statement-breakpoint
DO $$
DECLARE
	owner_role text;
BEGIN
	-- Catalog inspection found postgres owns all current public tables/sequences and
	-- is the migration executor. Keep this guarded for reduced-role environments.
	FOREACH owner_role IN ARRAY ARRAY['postgres', current_user]
	LOOP
		IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = owner_role) THEN
			EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated', owner_role);
			EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role', owner_role);
			EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated', owner_role);
			EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO service_role', owner_role);
		END IF;
	END LOOP;
END $$;
