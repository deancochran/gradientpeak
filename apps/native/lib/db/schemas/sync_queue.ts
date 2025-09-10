import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Schema for the synchronization queue.
 * This table tracks local entities that need to be synced with the remote server.
 */
export const syncQueue = sqliteTable("sync_queue", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entityId: text("entity_id").notNull(), // The ID of the item to sync (e.g., local_activity_id)
  entityType: text("entity_type").notNull(), // e.g., 'activity', 'segment'
  operation: text("operation").notNull(), // 'create', 'update', 'delete'
  payload: text("payload", { mode: "json" }), // The data to be sent
  attempts: integer("attempts").default(0),
  lastAttemptedAt: integer("last_attempted_at", { mode: "timestamp" }),
  status: text("status").default("pending"), // 'pending', 'failed', 'success'
});

export const syncQueueRelations = relations(syncQueue, ({ one }) => ({}));
