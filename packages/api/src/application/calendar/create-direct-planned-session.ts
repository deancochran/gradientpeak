import {
  PLANNED_SESSION_CONTRACT_VERSION,
  type PlannedSessionSource,
  plannedSessionIdempotencyKey,
  plannedSessionSchema,
} from "@repo/core/calendar";
import { resolvePrescription, type SessionDemand } from "@repo/core/plan";
import type { DrizzleQueryExecutor } from "../../db";
import type { PlannedSessionRepositoryPort } from "../../repositories/planned-session-repository-port";
import { toVerifiedResolverCandidate } from "../activity-plans/resolver-candidate";
import { loadPlanningBaseline } from "../athlete-intelligence/load-planning-baseline";
import { createPlannedSession } from "./create-planned-session";
import {
  PlannedSessionAccessError,
  PlannedSessionPrescriptionPreconditionError,
} from "./planned-session-errors";

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
  demand?: SessionDemand;
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
  const candidate = toVerifiedResolverCandidate({
    id: plan.id,
    revision: plan.revision,
    structure: plan.structure,
    structureHash: plan.structureHash,
    semanticHash: plan.semanticHash,
    trainingIntent: plan.trainingIntent,
  });
  const resolution = resolvePrescription({
    demand: input.demand ?? {
      activity_category: candidate.activity_category,
      training_intent: candidate.training_intent,
      target_duration_minutes: null,
      target_common_load: null,
      importance: "normal",
    },
    activity_plan_id: candidate.id,
    preferences: {
      weekly_session_count: null,
      target_weekly_duration_minutes: null,
      maximum_session_duration_minutes: null,
      preferred_weekdays: [],
      rest_days: [],
      progression_style: null,
      recovery_priority: null,
    },
    baseline: await loadPlanningBaseline({
      db: input.db,
      profileId: input.profileId,
      now: input.capturedAt,
    }),
    planning_weekday: new Date(`${input.planningDate}T00:00:00.000Z`).getUTCDay(),
    candidates: [candidate],
  });
  if (resolution.status !== "resolved") {
    const explanation =
      resolution.status === "needs_input"
        ? resolution.missing[0]?.message
        : resolution.reasons[0]?.message;
    throw new PlannedSessionPrescriptionPreconditionError(
      explanation ?? "The selected activity plan cannot satisfy this session demand.",
    );
  }
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
    activityPlanId: candidate.id,
    prescription: {
      resolutionManifest: resolution.manifest,
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
