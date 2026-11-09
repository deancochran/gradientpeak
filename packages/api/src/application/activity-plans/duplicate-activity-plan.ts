import { randomUUID } from "node:crypto";
import { activityPlanSemanticHash } from "@repo/core/activity-plan";
import { type ActivityPlanRow, activityPlans } from "@repo/db";
import { eq } from "drizzle-orm";
import type { DrizzleQueryExecutor } from "../../db";
import { parseActivityPlanAuthoringContent } from "./authoring-content";
import { canDuplicateFullActivityPlan } from "./read-projections";
import { activityPlanStructureHash } from "./structure-hash";

export class ActivityPlanDuplicateNotFoundError extends Error {}
export class ActivityPlanDuplicateAccessError extends Error {}

export type DuplicatedActivityPlan = Pick<
  ActivityPlanRow,
  | "id"
  | "profile_id"
  | "name"
  | "description"
  | "notes"
  | "structure"
  | "training_intent"
  | "gps_recording_enabled"
  | "created_at"
  | "updated_at"
>;

/**
 * Copies the authored fields used by the existing activity-plan duplicate command.
 * The copy is always private and owned by the requesting profile, even when the
 * source is a system template.
 */
export async function duplicateActivityPlan(input: {
  db: DrizzleQueryExecutor;
  profileId: string;
  sourceActivityPlanId: string;
  newName?: string;
  now?: Date;
  createId?: () => string;
}): Promise<DuplicatedActivityPlan> {
  const [original] = await input.db
    .select()
    .from(activityPlans)
    .where(eq(activityPlans.id, input.sourceActivityPlanId))
    .limit(1);
  if (!original) throw new ActivityPlanDuplicateNotFoundError("Original activity plan not found");
  if (!canDuplicateFullActivityPlan(original, input.profileId)) {
    throw new ActivityPlanDuplicateAccessError(
      "Only the plan owner can duplicate this activity plan",
    );
  }

  const authoring = parseActivityPlanAuthoringContent({
    structure: original.structure,
    training_intent: original.training_intent,
  });
  const now = input.now ?? new Date();
  const [duplicated] = await input.db
    .insert(activityPlans)
    .values({
      id: input.createId?.() ?? randomUUID(),
      created_at: now,
      updated_at: now,
      name: input.newName?.trim() || `${original.name} (Copy)`,
      description: original.description,
      notes: original.notes ?? null,
      structure: authoring.structure,
      structure_hash: activityPlanStructureHash(authoring.structure),
      training_intent: authoring.intent.training_intent,
      semantic_hash: activityPlanSemanticHash({
        structure: authoring.structure,
        trainingIntent: authoring.intent.training_intent,
      }),
      gps_recording_enabled: original.gps_recording_enabled,
      profile_id: input.profileId,
      content_visibility: "private",
      is_system_template: false,
    })
    .returning();
  if (!duplicated) throw new Error("Failed to duplicate activity plan");
  return duplicated;
}
