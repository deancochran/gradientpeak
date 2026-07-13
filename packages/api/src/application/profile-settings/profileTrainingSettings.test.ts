import { defaultAthletePreferenceProfile } from "@repo/core";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import type { getRequiredDb } from "../../db";
import {
  parseProfileTrainingSettings,
  readParsedProfileTrainingSettings,
} from "./profileTrainingSettings";

function createReadDb(rows: unknown[]) {
  let where: unknown;
  const query = {
    from: () => query,
    where: (condition: unknown) => {
      where = condition;
      return query;
    },
    limit: async () => rows,
  };
  const db = { select: () => query } as unknown as ReturnType<typeof getRequiredDb>;
  return { db, getWhere: () => where };
}

describe("profile training settings persistence", () => {
  it("returns null for an absent row", async () => {
    const { db } = createReadDb([]);
    await expect(readParsedProfileTrainingSettings(db, "profile-1")).resolves.toBeNull();
  });

  it("rejects malformed or non-strict persisted policy", () => {
    expect(parseProfileTrainingSettings({ availability: {} })).toBeNull();
    expect(
      parseProfileTrainingSettings({ ...defaultAthletePreferenceProfile, unexpected: true }),
    ).toBeNull();
  });

  it("returns a strictly parsed persisted profile", async () => {
    const updatedAt = new Date("2026-06-01T00:00:00.000Z");
    const { db } = createReadDb([
      { profileId: "profile-1", settings: defaultAthletePreferenceProfile, updatedAt },
    ]);

    await expect(readParsedProfileTrainingSettings(db, "profile-1")).resolves.toEqual({
      profileId: "profile-1",
      settings: defaultAthletePreferenceProfile,
      updatedAt,
    });
  });

  it("adds an independent updated_at cutoff for as-of reads", async () => {
    const { db, getWhere } = createReadDb([]);
    const asOf = new Date("2026-06-01T00:00:00.000Z");

    await readParsedProfileTrainingSettings(db, "profile-1", { asOf });

    const compiled = new PgDialect().sqlToQuery(getWhere() as SQL);
    expect(compiled.sql).toContain('"profile_training_settings"."profile_id" = $1');
    expect(compiled.sql).toContain('"profile_training_settings"."updated_at" <= $2');
    expect(compiled.params).toEqual(["profile-1", asOf.toISOString()]);
  });
});
