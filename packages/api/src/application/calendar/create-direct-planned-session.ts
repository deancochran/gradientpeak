import {
  PLANNED_SESSION_CONTRACT_VERSION,
  type PlannedSessionSource,
  plannedSessionIdempotencyKey,
  plannedSessionSchema,
} from "@repo/core/calendar";
import type { DrizzleQueryExecutor } from "../../db";
import type { PlannedSessionRepositoryPort } from "../../repositories/planned-session-repository-port";
import { estimateActivityPlan } from "../activity-plans/estimate-activity-plans";
import { createPlannedSession } from "./create-planned-session";
import { PlannedSessionAccessError } from "./planned-session-errors";

type DirectPlannedSessionSource = Extract<PlannedSessionSource, { kind: "direct" }>;

/** Creates a direct session from an owner-scoped saved plan, never client prescription data. */
export async function createDirectPlannedSession(input: {
  db: DrizzleQueryExecutor;
  repository: PlannedSessionRepositoryPort;
  profileId: string;
  sessionId: string;
  planningDate: string;
  source: DirectPlannedSessionSource;
  activityPlanId: string;
  groupEventId: string | null;
  capturedAt: Date;
}) {
  if (!Number.isFinite(input.capturedAt.getTime())) {
    throw new Error("A valid server capture time is required");
  }
  const plan = await input.repository.getActivityPlanPrescriptionSource({
    profileId: input.profileId,
    activityPlanId: input.activityPlanId,
  });
  if (!plan) {
    throw new PlannedSessionAccessError(
      "The prescribed activity plan is not owned or system-provided",
    );
  }

  const estimated = await estimateActivityPlan(
    {
      id: plan.id,
      profile_id: plan.profileId,
      name: plan.name,
      description: plan.description,
      structure: plan.structure,
      structure_hash: plan.structureHash,
      gps_recording_enabled: plan.gpsRecordingEnabled,
      updated_at: plan.updatedAt,
    },
    input.db,
    input.profileId,
    { asOf: input.capturedAt },
  );
  const session = plannedSessionSchema.parse({
    contractVersion: PLANNED_SESSION_CONTRACT_VERSION,
    id: input.sessionId,
    profileId: input.profileId,
    sessionRevision: 1,
    planningDate: input.planningDate,
    originalTargetDate: input.planningDate,
    source: input.source,
    idempotencyKey: plannedSessionIdempotencyKey(input.source),
    groupEventId: input.groupEventId,
    prescription: {
      activityPlanId: plan.id,
      activityPlanRevision: plan.revision,
      structure: plan.structure,
      prescriptionQuantification: estimated.prescriptionQuantification,
      capturedAt: input.capturedAt.toISOString(),
    },
    lifecycle: { status: "scheduled" },
  });

  return createPlannedSession({
    repository: input.repository,
    profileId: input.profileId,
    session,
  });
}
