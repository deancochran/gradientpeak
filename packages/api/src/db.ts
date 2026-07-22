import type { DrizzleDbClient } from "@repo/db";
import type { Context } from "./context";
import { internalServerError } from "./lib/errors/trpc";

export type DrizzleTransactionClient = Parameters<Parameters<DrizzleDbClient["transaction"]>[0]>[0];
export type DrizzleQueryExecutor = DrizzleDbClient | DrizzleTransactionClient;

export function getRequiredDb(ctx: Context) {
  if (!ctx.db) {
    throw internalServerError("Database client unavailable");
  }

  return ctx.db;
}
