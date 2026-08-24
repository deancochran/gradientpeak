import type { E2ECleanupRegistry } from "../support/cleanup";

type TrainingPlanCleanupIdentity = {
  id: string;
  ownerProfileId: string | null;
  scheduledByProfileId: string;
  systemTemplate: boolean;
};

export function registerTrainingPlanCleanup(
  registry: E2ECleanupRegistry,
  identity: TrainingPlanCleanupIdentity,
) {
  const id = identity.id.trim();
  const scheduledByProfileId = identity.scheduledByProfileId.trim();
  const ownerProfileId = identity.ownerProfileId?.trim() ?? null;
  if (!id || !scheduledByProfileId) {
    throw new Error("Training-plan cleanup requires an exact ID and scheduling owner.");
  }
  if (identity.systemTemplate !== (ownerProfileId === null)) {
    throw new Error("Training-plan cleanup owner does not match its system-template state.");
  }

  registry.registerExactId({
    kind: "training-plan",
    id,
    cleanup: (database) =>
      database.transaction(async (query) => {
        await query.query(
          'delete from "planned_sessions" where "training_plan_id" = $1 and "profile_id" = $2',
          [id, scheduledByProfileId],
        );
        await query.query(
          'delete from "events" where "training_plan_id" = $1 and "profile_id" = $2',
          [id, scheduledByProfileId],
        );
        if (ownerProfileId) {
          await query.query(
            `delete from "training_plans"
             where "id" = $1 and "profile_id" = $2 and "is_system_template" = false`,
            [id, ownerProfileId],
          );
        } else {
          await query.query(
            `delete from "training_plans"
             where "id" = $1 and "profile_id" is null and "is_system_template" = true`,
            [id],
          );
        }
      }),
  });
}
