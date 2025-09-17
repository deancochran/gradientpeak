import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  numeric,
  pgTable,
  serial,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { activities } from "./activities";

export const activityResults = pgTable("activity_results", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom()
    .default(sql`gen_random_uuid()`),
  idx: serial("idx").unique(),
  activityId: uuid("activity_id")
    .notNull()
    .references(() => activities.id, { onDelete: "cascade" }),

  // activity timing
  startedAt: timestamp("started_at").notNull(),
  totalTime: integer("total_time"), // total elapsed time (wall clock)
  movingTime: integer("moving_time"), // active recording time

  // profile snapshot
  snapshotWeightKg: numeric("snapshot_weight_kg", { precision: 5, scale: 2 }),
  snapshotFtp: numeric("snapshot_ftp", { precision: 5, scale: 2 }),
  snapshotThresholdHr: integer("snapshot_threshold_hr"),

  // profile training load
  tss: numeric("tss", { precision: 6, scale: 2 }),
  ctl: numeric("ctl", { precision: 6, scale: 2 }),
  atl: numeric("atl", { precision: 6, scale: 2 }),
  tsb: numeric("tsb", { precision: 6, scale: 2 }), // ctl - atl

  // power metrics
  normalizedPower: numeric("normalized_power", { precision: 6, scale: 2 }),
  avgPower: numeric("avg_power", { precision: 6, scale: 2 }),
  peakPower: numeric("peak_power", { precision: 6, scale: 2 }),
  intensityFactor: numeric("intensity_factor", { precision: 4, scale: 2 }),
  variabilityIndex: numeric("variability_index", { precision: 4, scale: 2 }),

  // heart rate metrics
  avgHeartRate: numeric("avg_heart_rate", { precision: 4, scale: 0 }),
  maxHeartRate: numeric("max_heart_rate", { precision: 4, scale: 0 }),

  // cadence metrics
  avgCadence: numeric("avg_cadence", { precision: 4, scale: 0 }),
  maxCadence: numeric("max_cadence", { precision: 4, scale: 0 }),

  // speed / distance metrics
  distance: numeric("distance", { precision: 8, scale: 2 }),
  avgSpeed: numeric("avg_speed", { precision: 5, scale: 2 }),
  maxSpeed: numeric("max_speed", { precision: 5, scale: 2 }),

  // elevation metrics
  totalAscent: numeric("total_ascent", { precision: 6, scale: 2 }),
  totalDescent: numeric("total_descent", { precision: 6, scale: 2 }),

  // compliance
  adherenceScore: numeric("adherence_score", { precision: 4, scale: 2 }),
  activityMatch: boolean("activity_match"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at", {
    mode: "date",
    precision: 3,
  }).$onUpdate(() => new Date()),
});
