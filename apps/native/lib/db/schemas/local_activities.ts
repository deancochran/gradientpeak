import { relations } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Schema for activities stored locally during recording sessions.
 * This table holds real-time activity data before it is processed and synced
 * to the cloud.
 */
export const localActivities = sqliteTable("local_activities", {
  id: text("id").primaryKey(), // UUID generated on the client
  name: text("name").notNull(),
  activityType: text("activity_type").notNull(), // e.g., 'run', 'bike'
  startDate: integer("start_date", { mode: "timestamp" }).notNull(),
  // Using real for floating point numbers in SQLite
  totalDistance: real("total_distance").default(0),
  totalTime: integer("total_time").default(0),
  // Foreign key to the online profile ID
  profileId: text("profile_id").notNull(),
});

export const localActivitiesRelations = relations(
  localActivities,
  ({ many }) => ({})
);
