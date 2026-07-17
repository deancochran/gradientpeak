import type { StandardActivity } from "@repo/core";
import type { getRequiredDb } from "../../db";
import type { ImportedActivityCreateInput } from "../../lib/provider-sync/imported-activity";
import { submitImportedActivityArtifact } from "./submit-imported-activity-artifact";

type DbClient = ReturnType<typeof getRequiredDb>;

/** Provider enrichment is the same idempotent artifact revision pipeline as initial delivery. */
export async function enrichImportedActivityArtifact(
  db: DbClient,
  input: {
    activityId: string;
    activity: ImportedActivityCreateInput;
    parsedActivity: StandardActivity;
  },
) {
  const submitted = await submitImportedActivityArtifact(db, {
    activity: input.activity,
    parsedActivity: input.parsedActivity,
  });
  if (submitted.id !== input.activityId) {
    throw new Error("Provider activity identity resolved to a different canonical parent");
  }
  return { id: submitted.id };
}
