import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  activities,
  integrationResourceKindEnum,
  publicActivitiesInsertSchema,
  publicActivitiesRowSchema,
  publicActivitiesUpdateSchema,
} from "@repo/db";
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";

function source(relativeUrl: string) {
  return readFileSync(fileURLToPath(new URL(relativeUrl, import.meta.url)), "utf8");
}

describe("activity provider identity hard cut", () => {
  it("keeps legacy provider identity out of activity persistence and public contracts", () => {
    expect(getTableColumns(activities)).not.toHaveProperty("provider");
    expect(getTableColumns(activities)).not.toHaveProperty("external_id");
    for (const schema of [
      publicActivitiesRowSchema,
      publicActivitiesInsertSchema,
      publicActivitiesUpdateSchema,
    ]) {
      expect(schema.shape).not.toHaveProperty("provider");
      expect(schema.shape).not.toHaveProperty("external_id");
    }
  });

  it("uses source references without restoring activity resource links", () => {
    const submission = source("./submit-activity.ts");
    const wahooRepository = source("../../infrastructure/repositories/drizzle-wahoo-repository.ts");
    expect(submission).toContain("activitySourceReferences");
    expect(submission).not.toContain("activities.provider");
    expect(submission).not.toContain("activities.external_id");
    expect(submission).not.toContain("integrationResourceLinks");
    expect(wahooRepository).not.toContain('resource_kind: "activity"');
    expect(integrationResourceKindEnum.enumValues).toContain("activity");
  });
});
