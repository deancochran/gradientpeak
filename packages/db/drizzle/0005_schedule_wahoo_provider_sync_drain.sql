CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;--> statement-breakpoint
GRANT USAGE ON SCHEMA cron TO postgres;--> statement-breakpoint
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.invoke_wahoo_provider_sync_drain()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  base_url text;
  internal_secret text;
BEGIN
  SELECT decrypted_secret INTO base_url
  FROM vault.decrypted_secrets
  WHERE name = 'provider_sync_base_url'
  LIMIT 1;

  SELECT decrypted_secret INTO internal_secret
  FROM vault.decrypted_secrets
  WHERE name = 'provider_sync_internal_secret'
  LIMIT 1;

  IF base_url IS NULL OR internal_secret IS NULL THEN
    RAISE NOTICE 'Skipping provider sync drain invoke because required Vault secrets are missing';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := base_url || '/api/internal/provider-sync/wahoo/drain',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || internal_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
END;
$$;--> statement-breakpoint

SELECT cron.schedule(
  'provider-sync-wahoo-drain',
  '* * * * *',
  $$ SELECT public.invoke_wahoo_provider_sync_drain(); $$
);
