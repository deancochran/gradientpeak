import { randomUUID } from "node:crypto";
import { type ActivityPlanInsert, activityPlans } from "@repo/db";
import { and, eq } from "drizzle-orm";
import type { getRequiredDb } from "../../db";

type ActivityPlansDb = ReturnType<typeof getRequiredDb>;

type ImportedActivityPlanInput = {
  externalId: string;
  profileId: string;
  provider: string;
  template: {
    activity_category: ActivityPlanInsert["activity_category"];
    description?: string | null;
    name: string;
    notes?: string;
    structure: ActivityPlanInsert["structure"];
  };
};

/**
 * Upserts a provider-owned imported activity-plan template for a single profile.
 * Imported templates remain private and never carry source ownership or visibility.
 */
export async function upsertImportedActivityPlan(
  db: ActivityPlansDb,
  input: ImportedActivityPlanInput,
) {
  const [existingRow] = await db
    .select()
    .from(activityPlans)
    .where(
      and(
        eq(activityPlans.profile_id, input.profileId),
        eq(activityPlans.import_provider, input.provider),
        eq(activityPlans.import_external_id, input.externalId),
      ),
    )
    .limit(1);

  const payload: Partial<ActivityPlanInsert> = {
    updated_at: new Date(),
    name: input.template.name,
    description: input.template.description?.trim() ? input.template.description.trim() : null,
    notes: input.template.notes ?? null,
    activity_category: input.template.activity_category,
    structure: input.template.structure,
    version: "1.0",
    profile_id: input.profileId,
    template_visibility: "private",
    import_provider: input.provider,
    import_external_id: input.externalId,
    is_system_template: false,
  };

  const [row] = existingRow
    ? await db
        .update(activityPlans)
        .set(payload)
        .where(
          and(eq(activityPlans.id, existingRow.id), eq(activityPlans.profile_id, input.profileId)),
        )
        .returning()
    : await db
        .insert(activityPlans)
        .values({
          id: randomUUID(),
          created_at: new Date(),
          ...payload,
        } as ActivityPlanInsert)
        .returning();

  return { action: existingRow ? ("updated" as const) : ("created" as const), row };
}
