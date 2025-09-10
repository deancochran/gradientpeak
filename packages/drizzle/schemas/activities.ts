import { sql } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { profiles } from "./profiles";

export const syncStatusEnum = pgEnum("sync_status", [
  "local_only",
  "syncing",
  "synced",
  "sync_failed",
]);

export const activities = pgTable("activities", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom()
    .default(sql`gen_random_uuid()`),
  idx: serial("idx").unique(),

  profileId: uuid("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),

  // minimal storage for file references
  localStoragePath: text("local_storage_path"),
  cloudStoragePath: text("cloud_storage_path"),
  syncStatus: syncStatusEnum("sync_status").notNull().default("local_only"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at", {
    mode: "date",
    precision: 3,
  }).$onUpdate(() => new Date()),
});

export type SelectActivity = typeof activities.$inferSelect;
export type InsertActivity = typeof activities.$inferInsert;
