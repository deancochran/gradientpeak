import { publicNotificationsRowSchema } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { getRequiredDb } from "../../db";

type Database = ReturnType<typeof getRequiredDb>;

const notificationTimestampSchema = z.union([z.string(), z.date()]);

const notificationRowSchema = z.object({
  id: publicNotificationsRowSchema.shape.id,
  user_id: publicNotificationsRowSchema.shape.user_id,
  actor_id: publicNotificationsRowSchema.shape.actor_id,
  type: publicNotificationsRowSchema.shape.type,
  entity_id: publicNotificationsRowSchema.shape.entity_id,
  read_at: notificationTimestampSchema.nullable(),
  created_at: notificationTimestampSchema,
  is_read: z.boolean(),
});

type NotificationRow = z.infer<typeof notificationRowSchema>;

function normalizeTimestamp(value: string | Date | null): string | null {
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeNotificationRow(row: NotificationRow) {
  return {
    ...row,
    created_at: normalizeTimestamp(row.created_at) ?? "",
    read_at: normalizeTimestamp(row.read_at),
  };
}

function toDatabaseErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") {
    return "Unknown database error";
  }

  const databaseError = error as { code?: string; message?: string };
  const code = databaseError.code ? `[${databaseError.code}] ` : "";
  const message = (databaseError.message ?? "Unknown database error").replace(/\s+/g, " ").trim();

  return `${code}${message}`;
}

function databaseError(error: unknown): TRPCError {
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: toDatabaseErrorMessage(error),
    cause: error,
  });
}

/**
 * Performs notification reads and read-state updates scoped to a recipient profile.
 */
export function createNotificationOperations(db: Database) {
  return {
    async getRecent(input: { recipientProfileId: string; limit: number }) {
      try {
        const result = await db.execute(sql<NotificationRow>`
          select
            "id",
            "user_id",
            "actor_id",
            "type",
            "entity_id",
            "read_at",
            "created_at",
            ("read_at" is not null) as "is_read"
          from "notifications"
          where "user_id" = ${input.recipientProfileId}::uuid
          order by "created_at" desc
          limit ${input.limit}
        `);

        return notificationRowSchema.array().parse(result.rows).map(normalizeNotificationRow);
      } catch (error) {
        throw databaseError(error);
      }
    },

    async getUnreadCount(input: { recipientProfileId: string }) {
      try {
        const result = await db.execute(sql<{ count: number | string }>`
          select count(*)::int as "count"
          from "notifications"
          where "user_id" = ${input.recipientProfileId}::uuid
            and "read_at" is null
        `);

        return Number(result.rows[0]?.count ?? 0);
      } catch (error) {
        throw databaseError(error);
      }
    },

    async markRead(input: { recipientProfileId: string; notificationIds: string[] }) {
      if (input.notificationIds.length === 0) {
        return { success: true };
      }

      try {
        await db.execute(sql`
          update "notifications"
          set "read_at" = coalesce("read_at", now())
          where "user_id" = ${input.recipientProfileId}::uuid
            and "id" in (${sql.join(
              input.notificationIds.map((notificationId) => sql`${notificationId}::uuid`),
              sql`, `,
            )})
        `);

        return { success: true };
      } catch (error) {
        throw databaseError(error);
      }
    },
  };
}
