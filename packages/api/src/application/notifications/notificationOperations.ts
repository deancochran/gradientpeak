import { notifications, publicNotificationsRowSchema } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
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
});

type NotificationRow = z.infer<typeof notificationRowSchema>;

type NotificationHistoryCursor = { createdAt: Date; id: string };

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
        const rows = await db
          .select({
            id: notifications.id,
            user_id: notifications.user_id,
            actor_id: notifications.actor_id,
            type: notifications.type,
            entity_id: notifications.entity_id,
            read_at: notifications.read_at,
            created_at: notifications.created_at,
          })
          .from(notifications)
          .where(eq(notifications.user_id, input.recipientProfileId))
          .orderBy(desc(notifications.created_at))
          .limit(input.limit);

        return notificationRowSchema.array().parse(rows).map(normalizeNotificationRow);
      } catch (error) {
        throw databaseError(error);
      }
    },

    async getHistory(input: {
      recipientProfileId: string;
      limit: number;
      cursor?: NotificationHistoryCursor | null;
      view: "all" | "unread";
    }) {
      try {
        const filters = [eq(notifications.user_id, input.recipientProfileId)];
        if (input.view === "unread") filters.push(isNull(notifications.read_at));
        if (input.cursor) {
          const cursorFilter = or(
            lt(notifications.created_at, input.cursor.createdAt),
            and(
              eq(notifications.created_at, input.cursor.createdAt),
              lt(notifications.id, input.cursor.id),
            ),
          );
          if (cursorFilter) filters.push(cursorFilter);
        }

        const rows = await db
          .select({
            id: notifications.id,
            user_id: notifications.user_id,
            actor_id: notifications.actor_id,
            type: notifications.type,
            entity_id: notifications.entity_id,
            read_at: notifications.read_at,
            created_at: notifications.created_at,
          })
          .from(notifications)
          .where(and(...filters))
          .orderBy(desc(notifications.created_at), desc(notifications.id))
          .limit(input.limit + 1);
        const page = notificationRowSchema.array().parse(rows);
        const hasMore = page.length > input.limit;
        const items = page.slice(0, input.limit).map(normalizeNotificationRow);
        const last = items.at(-1);

        return {
          items,
          nextCursor: hasMore && last ? { createdAt: last.created_at, id: last.id } : null,
        };
      } catch (error) {
        throw databaseError(error);
      }
    },

    async getUnreadCount(input: { recipientProfileId: string }) {
      try {
        const [result] = await db
          .select({ count: count() })
          .from(notifications)
          .where(
            and(eq(notifications.user_id, input.recipientProfileId), isNull(notifications.read_at)),
          );

        return result?.count ?? 0;
      } catch (error) {
        throw databaseError(error);
      }
    },

    async markRead(input: { recipientProfileId: string; notificationIds: string[] }) {
      if (input.notificationIds.length === 0) {
        return { success: true };
      }

      try {
        await db
          .update(notifications)
          .set({ read_at: sql`coalesce(${notifications.read_at}, now())` })
          .where(
            and(
              eq(notifications.user_id, input.recipientProfileId),
              inArray(notifications.id, input.notificationIds),
            ),
          );

        return { success: true };
      } catch (error) {
        throw databaseError(error);
      }
    },
  };
}
