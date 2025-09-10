import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { activities } from "./activities";

export const activityStreams = pgTable(
  "activity_streams",
  {
    id: uuid("id")
      .primaryKey()
      .defaultRandom()
      .default(sql`gen_random_uuid()`),
    idx: serial("idx").unique(),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // 'distance', 'heartrate', 'power', 'latlng', 'moving'
    resolution: text("resolution"),
    originalSize: integer("original_size").notNull(),

    data: doublePrecision("data").array(),
    dataLatlng: doublePrecision("data_latlng").array().array(),
    dataMoving: boolean("data_moving").array(),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at", {
      mode: "date",
      precision: 3,
    }).$onUpdate(() => new Date()),
  },
  (table) => ({
    resolutionCheck: check(
      "resolution_check",
      sql`${table.resolution} in ('low', 'medium', 'high')`,
    ),
    uniqueActivityStreamType: unique("uq_activity_stream_type").on(
      table.activityId,
      table.type,
    ),
  }),
);
