import {
  index,
  integer,
  pgEnum,
  pgSchema,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

/**
 * Enums - Keep minimal but extensible
 */
export const activityStatus = pgEnum("activity_status", [
  "in_progress",
  "completed",
  "cancelled",
]);

export const sportType = pgEnum("sport_type", [
  "cycling",
  "running",
  "walking",
  "other",
]);

export const privacyLevel = pgEnum("privacy_level", [
  "private",
  "friends",
  "public",
]);

/**
 * Reference Supabase Auth users (read-only)
 */
const authSchema = pgSchema("auth");

export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

/**
 * User profiles (Drizzle-managed)
 * Keep minimal - you can add athletic data later
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(), // references auth.users.id
    email: text("email").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    username: text("username"), // Important for social features later
    avatarUrl: text("avatar_url"),
    bio: text("bio"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    usernameIdx: index("users_username_idx").on(t.username),
  }),
);

/**
 * Activities (core feature)
 * This replaces your "rides" table with more generic naming
 */
export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Basic metadata
    name: text("name"), // User can name their activity
    description: text("description"),
    sport: sportType("sport").notNull(),
    status: activityStatus("status").default("completed").notNull(),
    privacy: privacyLevel("privacy").default("friends").notNull(),

    // Basic summary metrics
    distanceMeters: integer("distance_meters").default(0),
    durationSeconds: integer("duration_seconds").default(0),

    // File reference (for local-first approach)
    originalFileName: text("original_file_name"), // e.g., "morning_ride.fit"
    fileStoragePath: text("file_storage_path"), // Supabase storage path

    // Timing
    startedAt: timestamp("started_at").notNull(),
    endedAt: timestamp("ended_at"),

    // System
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index("activities_user_id_idx").on(t.userId),
    sportIdx: index("activities_sport_idx").on(t.sport),
    statusIdx: index("activities_status_idx").on(t.status),
    startedAtIdx: index("activities_started_at_idx").on(t.startedAt),
    privacyIdx: index("activities_privacy_idx").on(t.privacy),
  }),
);

// Additional tables can be added later:
// - activityDataPoints (for detailed time-series data)
// - userStats (for aggregated statistics)
// - follows (for social features)
// - clubs (for group features)
// etc.

// Zod schemas for validation
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export const insertActivitySchema = createInsertSchema(activities);
export const selectActivitySchema = createSelectSchema(activities);

// TypeScript types
export type User = z.infer<typeof selectUserSchema>;
export type NewUser = z.infer<typeof insertUserSchema>;
export type Activity = z.infer<typeof selectActivitySchema>;
export type NewActivity = z.infer<typeof insertActivitySchema>;
