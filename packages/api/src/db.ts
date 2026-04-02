import { TRPCError } from "@trpc/server";
import type { Context } from "./context";

export function getRequiredDb(ctx: Context) {
  if (!ctx.db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database client unavailable",
    });
  }

  return ctx.db;
}
