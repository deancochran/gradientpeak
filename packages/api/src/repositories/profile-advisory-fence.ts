import { sql } from "drizzle-orm";
import type { DrizzleTransactionClient } from "../db";

/**
 * Serializes profile-scoped bulk-import admission with authoritative state consumers.
 * Callers must acquire this transaction lock before any plan, athlete-state, or import-run
 * row lock so every participating transaction follows one deadlock-safe lock order.
 */
export async function lockProfileAdvisoryFence(tx: DrizzleTransactionClient, profileId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${profileId}, 0))`);
}
