import { sql } from "drizzle-orm";
import {
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
import { profiles } from "./profiles";

export const planStatusEnum = pgEnum("plan_status", [
  "draft",
  "active",
  "completed",
  "paused",
]);
export const planTypeEnum = pgEnum("plan_type", [
  "base",
  "build",
  "peak",
  "recovery",
  "custom",
]);

export const profilePlans = pgTable("profile_plans", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom()
    .default(sql`gen_random_uuid()`),
  idx: serial("idx").unique(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),

  name: text("name").notNull(),
  description: text("description"),
  planType: planTypeEnum("plan_type").notNull().default("custom"),
  status: planStatusEnum("status").notNull().default("draft"),

  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),

  // profile snapshot
  snapshotWeightKg: numeric("snapshot_weight_kg", { precision: 5, scale: 2 }),
  snapshotFtp: numeric("snapshot_ftp", { precision: 5, scale: 2 }),
  snapshotThresholdHr: integer("snapshot_threshold_hr"),

  // progression config (JSONB)
  configVersion: text("config_version").notNull().default("1.0"),
  config: jsonb("config").notNull(),

  // progress tracking
  completionPercentage: numeric("completion_percentage", {
    precision: 5,
    scale: 2,
  }).default("0.00"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at", {
    mode: "date",
    precision: 3,
  }).$onUpdate(() => new Date()),
});
