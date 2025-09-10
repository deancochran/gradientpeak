import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id")
      .primaryKey()
      .defaultRandom()
      .default(sql`gen_random_uuid()`),

    idx: serial("idx").unique(),

    // key fitness metrics
    thresholdHr: integer("threshold_hr"),
    ftp: integer("ftp"),
    weightKg: numeric("weight_kg", { precision: 5, scale: 2 }),

    // personal info
    gender: text("gender"),
    dob: date("dob"),
    username: text("username").unique(),
    language: text("language").default("en"),
    preferredUnits: text("preferred_units").default("metric"),
    avatarUrl: text("avatar_url"),
    bio: text("bio"),

    // onboarding & measurement tracking
    onboarded: boolean("onboarded").default(false),
    lastFtpUpdate: timestamp("last_ftp_update"),
    lastThresholdHrUpdate: timestamp("last_threshold_hr_update"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at", {
      mode: "date",
      precision: 3,
    }).$onUpdate(() => new Date()),
  },
  (table) => ({
    genderCheck: check(
      "gender_check",
      sql`${table.gender} in ('male', 'female', 'other')`,
    ),
    preferredUnitsCheck: check(
      "preferred_units_check",
      sql`${table.preferredUnits} in ('metric', 'imperial')`,
    ),
  }),
);
