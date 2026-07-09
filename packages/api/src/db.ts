import type { Context } from "./context";
import { internalServerError } from "./lib/errors/trpc";

export function getRequiredDb(ctx: Context) {
  if (!ctx.db) {
    throw internalServerError("Database client unavailable");
  }

  return ctx.db;
}
