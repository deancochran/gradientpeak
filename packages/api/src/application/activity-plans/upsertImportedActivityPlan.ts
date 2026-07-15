import { randomUUID } from "node:crypto";
import { type ActivityPlanInsert, activityPlans } from "@repo/db";
import { sql } from "drizzle-orm";
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
  const id = randomUUID();
  const now = new Date();
  const payload = {
    id,
    created_at: now,
    updated_at: now,
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
  } satisfies ActivityPlanInsert;

  const [row] = await db
    .insert(activityPlans)
    .values(payload)
    .onConflictDoUpdate({
      target: [
        activityPlans.profile_id,
        activityPlans.import_provider,
        activityPlans.import_external_id,
      ],
      targetWhere: sql`${activityPlans.import_provider} is not null and ${activityPlans.import_external_id} is not null`,
      set: {
        updated_at: now,
        name: payload.name,
        description: payload.description,
        notes: payload.notes,
        activity_category: payload.activity_category,
        structure: payload.structure,
        version: payload.version,
        profile_id: payload.profile_id,
        template_visibility: payload.template_visibility,
        import_provider: payload.import_provider,
        import_external_id: payload.import_external_id,
        is_system_template: payload.is_system_template,
      },
    })
    .returning();

  return { action: row?.id === id ? ("created" as const) : ("updated" as const), row };
}
