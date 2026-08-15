import type { DrizzleDbClient } from "@repo/db";
import { relationalSchema } from "@repo/db/schema";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Context } from "./context";
import { internalServerError } from "./lib/errors/trpc";

export type DrizzleTransactionClient = Parameters<Parameters<DrizzleDbClient["transaction"]>[0]>[0];
export type DrizzleQueryExecutor = DrizzleDbClient | DrizzleTransactionClient;

type RepeatableReadAccessMode = "read only" | "read write";
const repeatableReadTransactions = new WeakMap<object, RepeatableReadAccessMode>();

function isRootDb(db: DrizzleQueryExecutor): db is DrizzleDbClient {
  return "$client" in db;
}

/**
 * Owns one repeatable-read snapshot at a public read boundary. Nested readers may
 * reuse only a transaction created by this helper, which prevents an accidental
 * savepoint or an unknown read-committed parent from weakening snapshot coherence.
 */
export async function withRepeatableReadSnapshot<T>(
  db: DrizzleQueryExecutor,
  read: (tx: DrizzleTransactionClient) => Promise<T>,
  options: { accessMode?: RepeatableReadAccessMode } = {},
): Promise<T> {
  const accessMode = options.accessMode ?? "read only";
  if (isRootDb(db)) {
    return db.transaction(
      async (tx) => {
        repeatableReadTransactions.set(tx, accessMode);
        try {
          return await read(tx);
        } finally {
          repeatableReadTransactions.delete(tx);
        }
      },
      { accessMode, isolationLevel: "repeatable read" },
    );
  }

  const parentAccessMode = repeatableReadTransactions.get(db);
  if (parentAccessMode === undefined) {
    throw new Error("Existing transaction is not a known repeatable-read snapshot");
  }
  if (accessMode === "read write" && parentAccessMode !== "read write") {
    throw new Error("Read-write snapshot work cannot reuse a read-only parent transaction");
  }
  return read(db);
}

/**
 * Serializes a profile before opening its repeatable-read snapshot, then takes
 * the transaction-scoped form of the same lock as the transaction's first
 * statement. The session lock and transaction must share one connection so
 * there is no handoff gap where another profile writer can establish a stale
 * snapshot. The complete callback runs once; this helper never partially
 * retries application work.
 */
export async function withProfileFencedRepeatableReadSnapshot<T>(
  db: DrizzleDbClient,
  profileId: string,
  write: (tx: DrizzleTransactionClient) => Promise<T>,
): Promise<T> {
  const client = await db.$client.connect();
  const connectionDb = drizzle({ client, schema: relationalSchema, casing: "snake_case" });
  let sessionLockHeld = false;
  let destroyConnection = false;
  try {
    await client.query("select pg_advisory_lock(hashtextextended($1, 0))", [profileId]);
    sessionLockHeld = true;
    return await connectionDb.transaction(
      async (tx) => {
        repeatableReadTransactions.set(tx, "read write");
        try {
          await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${profileId}, 0))`);
          const released = await client.query<{ released: boolean }>(
            "select pg_advisory_unlock(hashtextextended($1, 0)) as released",
            [profileId],
          );
          if (released.rows[0]?.released !== true) {
            throw new Error("Profile submission session fence could not be transferred");
          }
          sessionLockHeld = false;
          return await write(tx);
        } finally {
          repeatableReadTransactions.delete(tx);
        }
      },
      { accessMode: "read write", isolationLevel: "repeatable read" },
    );
  } finally {
    if (sessionLockHeld) {
      try {
        await client.query("select pg_advisory_unlock(hashtextextended($1, 0))", [profileId]);
      } catch {
        destroyConnection = true;
      }
    }
    client.release(destroyConnection);
  }
}

export function getRequiredDb(ctx: Context) {
  if (!ctx.db) {
    throw internalServerError("Database client unavailable");
  }

  return ctx.db;
}
