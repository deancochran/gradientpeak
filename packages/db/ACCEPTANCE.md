# Disposable acceptance database

This is the only database target supported by browser acceptance. It does not
use or reset the preserved Supabase stack on port 54322. Compose owns local
lifecycle; GitHub Actions owns its ephemeral PostgreSQL service in CI. The
preparation command never launches children, creates containers, or resets data.

From the repository root, run in Bash:

```bash
set -eu
export DB_DISPOSABLE_TARGET=1
export DB_DISPOSABLE_TARGET_ID=$(openssl rand -hex 8)
export DB_DISPOSABLE_DATABASE=gradientpeak_fresh_${DB_DISPOSABLE_TARGET_ID}
compose=(docker compose --env-file /dev/null -f packages/db/compose.acceptance.yml)
trap '"${compose[@]}" down --volumes' EXIT
"${compose[@]}" up --wait --wait-timeout 90
port=$("${compose[@]}" port postgres 5432)
export DATABASE_URL="postgresql://postgres:acceptance-only@${port}/${DB_DISPOSABLE_DATABASE}"
export POSTGRES_URL="$DATABASE_URL" SUPABASE_DB_URL="$DATABASE_URL"
pnpm --filter @repo/db db:acceptance:prepare
pnpm --filter @repo/api test:live-db
pnpm --filter web exec playwright install chromium # first use only
pnpm --filter web test:e2e
```

The password above is synthetic, for a loopback-only, tmpfs-backed container.
Keep the generated target ID if manually cleaning up an interrupted shell. Use
the same Compose file and ID for `down --volumes`; never use a global Docker prune.

Preparation verifies Docker ownership labels, actual port mapping, database
identity, and an empty public schema before applying SQL in a transaction. It
compares the current Drizzle export with the versioned baseline and checks
default-deny RLS/grants. Browser startup independently verifies the target and
seeds its synthetic account before starting Vite with an allowlisted environment.
There is no global setup that repeats that browser preflight. Tests never reuse
an existing web server or load the application's local environment files.

## Fresh-only, not an upgrade path

The baseline is a fresh-install acceptance artifact, not a migration repair.
Existing-target replay remains unsupported at
`0016_add_tentative_group_event_rsvps.sql`, whose group-event prerequisites are
missing. No preserved or hosted target may use this preparation command. Passing
fresh acceptance does not establish compatibility for the main preview database.
Provider callback scheduling (Vault/pg_cron/pg_net) remains an explicit operational
deployment concern and is not installed by this portable relational baseline.

To intentionally update the baseline after a reviewed schema change, regenerate
with `pnpm --filter @repo/db exec drizzle-kit export --config drizzle.config.ts`
into `packages/db/drizzle/baseline/20261031_current_main.sql`, inspect the SQL,
and rerun fresh acceptance. The security overlay is independently reviewed SQL.
