import { readFileSync } from "node:fs";
import { Pool } from "pg";
import {
  requireGuardedDisposableLocalDatabaseUrl,
  requireRepositoryManagedDisposableLocalTarget,
} from "./_target-safety";

function withDatabase(baseUrl: string, database: string) {
  const url = new URL(baseUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

export type DisposablePool = {
  end: () => Promise<void>;
};

export type DisposableAdminPool = DisposablePool & {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<{ count?: number }> }>;
};

type DisposableTeardownOptions = {
  maxClientCloseChecks?: number;
  wait?: () => Promise<void>;
};

const clientBackendsSql = `
  select count(*)::integer count
  from pg_stat_activity
  where datname = $1
    and backend_type = 'client backend'
    and pid <> pg_backend_pid()
`;

const terminateClientBackendsSql = `
  select pg_terminate_backend(pid)
  from pg_stat_activity
  where datname = $1
    and backend_type = 'client backend'
    and pid <> pg_backend_pid()
`;

const waitForClientClose = () => new Promise<void>((resolve) => setTimeout(resolve, 25));

/**
 * Closes the harness-owned pool before dropping its database.  A pool's `end()`
 * resolves when its socket closes, while PostgreSQL may briefly retain the
 * corresponding backend.  Poll that narrow target first; force termination is
 * only the bounded fallback for a client the callback left behind.
 */
export async function teardownDisposableDatabase(
  target: DisposablePool | undefined,
  admin: DisposableAdminPool,
  database: string,
  options: DisposableTeardownOptions = {},
) {
  if (!/^gradientpeak_[a-z_]+_\d+_\d+$/.test(database)) {
    throw new Error("unsafe disposable database name");
  }
  const maxClientCloseChecks = options.maxClientCloseChecks ?? 20;
  if (
    !Number.isInteger(maxClientCloseChecks) ||
    maxClientCloseChecks < 1 ||
    maxClientCloseChecks > 20
  ) {
    throw new Error("maxClientCloseChecks must be an integer from 1 through 20");
  }
  const errors: unknown[] = [];
  const wait = options.wait ?? waitForClientClose;

  if (target) {
    try {
      await target.end();
    } catch (error) {
      errors.push(error);
    }
  }

  let clientsRemaining = true;
  for (let attempt = 0; attempt < maxClientCloseChecks; attempt += 1) {
    try {
      const result = await admin.query(clientBackendsSql, [database]);
      clientsRemaining = (result.rows[0]?.count ?? 0) > 0;
      if (!clientsRemaining) break;
    } catch (error) {
      errors.push(error);
      break;
    }
    if (attempt + 1 < maxClientCloseChecks) {
      try {
        await wait();
      } catch (error) {
        errors.push(error);
        break;
      }
    }
  }

  if (clientsRemaining) {
    try {
      // Only client sessions for this generated disposable database are in scope.
      await admin.query(terminateClientBackendsSql, [database]);
    } catch (error) {
      errors.push(error);
    }
  }

  try {
    await admin.query(`drop database if exists "${database}"`);
  } catch (error) {
    errors.push(error);
  }
  try {
    await admin.end();
  } catch (error) {
    errors.push(error);
  }

  if (errors.length) {
    throw new AggregateError(errors, `failed to clean up disposable database ${database}`);
  }
}

export type DisposableOutcome<T> =
  | { completed: true; value: T }
  | { completed: false; error: unknown };

export function completeDisposableDatabaseRun<T>(
  run: DisposableOutcome<T>,
  teardown: DisposableOutcome<void>,
): T {
  if (!run.completed && !teardown.completed) {
    throw new AggregateError(
      [run.error, teardown.error],
      "disposable database run and teardown failed",
    );
  }
  if (!run.completed) throw run.error;
  if (!teardown.completed) throw teardown.error;
  return run.value;
}

export async function withDisposableDatabase<T>(
  args: string[],
  label: string,
  run: (pool: Pool, connectionString: string) => Promise<T>,
) {
  const baseUrl = requireRepositoryManagedDisposableLocalTarget(args);
  const adminUrl = withDatabase(baseUrl, "postgres");
  const database = `gradientpeak_${label}_${process.pid}_${Date.now()}`;
  if (!/^gradientpeak_[a-z_]+_\d+_\d+$/.test(database)) {
    throw new Error("unsafe disposable database name");
  }
  const connectionString = withDatabase(baseUrl, database);
  requireGuardedDisposableLocalDatabaseUrl(connectionString);
  const admin = new Pool({ connectionString: adminUrl, max: 1 });
  let target: Pool | undefined;
  const runOutcome: DisposableOutcome<T> = await (async () => {
    try {
      await admin.query(`create database "${database}"`);
      target = new Pool({ connectionString, max: 1 });
      return { completed: true, value: await run(target, connectionString) };
    } catch (error) {
      return { completed: false, error };
    }
  })();
  const teardownOutcome: DisposableOutcome<void> = await (async () => {
    try {
      await teardownDisposableDatabase(target, admin, database);
      return { completed: true, value: undefined };
    } catch (error) {
      return { completed: false, error };
    }
  })();
  return completeDisposableDatabaseRun(runOutcome, teardownOutcome);
}

export async function bootstrapSupabaseAuthSchema(pool: Pool) {
  await pool.query(`
    create schema if not exists extensions;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create table auth.users (
      id uuid primary key,
      email text,
      email_confirmed_at timestamptz,
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );
  `);
}

export async function bootstrapSupabaseSchemas(pool: Pool) {
  await bootstrapSupabaseAuthSchema(pool);
  await pool.query(`
    create schema storage;
    create function storage.foldername(name text) returns text[]
      language sql immutable as $$ select string_to_array(name, '/') $$;
    create table storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null references storage.buckets(id),
      name text not null
    );
    alter table storage.objects enable row level security;
  `);
}

export async function applySqlFile(pool: Pool, path: string) {
  const client = await pool.connect();
  const sql = readFileSync(path, "utf8");
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw new Error(
      `failed transactional baseline ${path}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  } finally {
    client.release();
  }
}
