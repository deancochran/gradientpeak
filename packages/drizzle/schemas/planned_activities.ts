import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { profilePlans } from "./profile_plans";
import { profiles } from "./profiles";

export const activityTypeEnum = pgEnum("activity_type", [
  "bike",
  "run",
  "swim",
  "strength",
  "other",
]);
export const completionStatusEnum = pgEnum("completion_status", [
  "pending",
  "completed",
  "skipped",
]);

export const plannedActivities = pgTable("planned_activities", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom()
    .default(sql`gen_random_uuid()`),
  idx: serial("idx").unique(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  profilePlanId: uuid("profile_plan_id").references(() => profilePlans.id, {
    onDelete: "set null",
  }),

  // scheduling
  scheduledDate: date("scheduled_date").notNull(),
  name: text("name").notNull(),
  activityType: activityTypeEnum("activity_type").notNull(),
  description: text("description"),

  // activity structure
  structure: jsonb("structure").notNull(),
  structureVersion: text("structure_version").notNull().default("1.0"),

  // requirements
  requiresFtp: boolean("requires_ftp").default(false),
  requiresThresholdHr: boolean("requires_threshold_hr").default(false),

  // estimates
  estimatedDuration: integer("estimated_duration"), // seconds
  estimatedTss: numeric("estimated_tss", { precision: 6, scale: 2 }),

  // completion tracking
  completionStatus:
    completionStatusEnum("completion_status").default("pending"),
  completedActivityId: uuid("completed_activity_id"), // references activities(id) - defined in next schema
  completionDate: date("completion_date"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at", {
    mode: "date",
    precision: 3,
  }).$onUpdate(() => new Date()),
});
