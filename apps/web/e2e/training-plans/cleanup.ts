import {
  plannedSessions,
  trainingPlanApplicationCommandReceipts,
  trainingPlanApplications,
  trainingPlans,
} from "@repo/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
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
      database.typedTransaction(async (transaction) => {
        const applications = await transaction
          .select({ id: trainingPlanApplications.id })
          .from(trainingPlanApplications)
          .where(
            and(
              eq(trainingPlanApplications.training_plan_id, id),
              eq(trainingPlanApplications.profile_id, scheduledByProfileId),
            ),
          );
        if (applications.length) {
          await transaction.delete(trainingPlanApplicationCommandReceipts).where(
            and(
              eq(trainingPlanApplicationCommandReceipts.profile_id, scheduledByProfileId),
              inArray(
                trainingPlanApplicationCommandReceipts.application_id,
                applications.map((application) => application.id),
              ),
            ),
          );
        }
        await transaction
          .delete(plannedSessions)
          .where(
            and(
              eq(plannedSessions.training_plan_id, id),
              eq(plannedSessions.profile_id, scheduledByProfileId),
            ),
          );
        await transaction
          .delete(trainingPlanApplications)
          .where(
            and(
              eq(trainingPlanApplications.training_plan_id, id),
              eq(trainingPlanApplications.profile_id, scheduledByProfileId),
            ),
          );
        if (ownerProfileId) {
          await transaction
            .delete(trainingPlans)
            .where(
              and(
                eq(trainingPlans.id, id),
                eq(trainingPlans.profile_id, ownerProfileId),
                eq(trainingPlans.is_system_template, false),
              ),
            );
        } else {
          await transaction
            .delete(trainingPlans)
            .where(
              and(
                eq(trainingPlans.id, id),
                isNull(trainingPlans.profile_id),
                eq(trainingPlans.is_system_template, true),
              ),
            );
        }
      }),
  });
}
