import { type RecordingPlannedSessionLaunch, resolvePrescription } from "@repo/core";
import type { PlannedSession } from "@repo/core/calendar";
import type { DrizzleQueryExecutor } from "../../db";
import type { PlannedSessionRepositoryPort } from "../../repositories/planned-session-repository-port";
import { toVerifiedResolverCandidate } from "../activity-plans/resolver-candidate";
import { activityPlanCanonicalStructureHash } from "../activity-plans/structure-hash";
import { loadPlanningBaseline } from "../athlete-intelligence/load-planning-baseline";
import { resolveCurrentPlannedSessionPlan } from "./resolve-current-planned-session-plan";

/**
 * Captures the current referenced plan immediately before recording starts.
 * The returned payload is then recorder-owned execution evidence; it is not
 * re-resolved during submission.
 */
export async function resolveCurrentPlannedSessionRecordingLaunch(input: {
  db: DrizzleQueryExecutor;
  repository: PlannedSessionRepositoryPort;
  profileId: string;
  session: PlannedSession;
  capturedAt: Date;
}): Promise<RecordingPlannedSessionLaunch | null> {
  if (!Number.isFinite(input.capturedAt.getTime()))
    throw new Error("Recording launch clock is invalid");
  const plan = await resolveCurrentPlannedSessionPlan(input);
  if (!plan || activityPlanCanonicalStructureHash(plan.structure) !== plan.structureHash)
    return null;
  // A legacy scheduled snapshot is provenance only. Recording must always
  // capture a fresh resolver result for the current referenced plan, otherwise
  // old context/fingerprint fields can be merged with new plan structure.
  const resolution = resolvePrescription({
    demand: {
      activity_category: plan.structure.activity_category,
      training_intent: plan.trainingIntent,
      target_duration_minutes: null,
      target_common_load: null,
      importance: "normal",
    },
    activity_plan_id: plan.id,
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
    planning_weekday: new Date(`${input.session.planningDate}T00:00:00.000Z`).getUTCDay(),
    candidates: [
      toVerifiedResolverCandidate({
        id: plan.id,
        revision: plan.revision,
        structure: plan.structure,
        structureHash: plan.structureHash,
        semanticHash: plan.semanticHash,
        trainingIntent: plan.trainingIntent,
      }),
    ],
  });
  if (resolution.status !== "resolved") return null;

  return {
    id: input.session.id,
    sessionRevision: input.session.sessionRevision,
    source: input.session.source,
    prescription: {
      resolutionManifest: {
        ...resolution.manifest,
        activity_plan_id: plan.id,
        activity_plan_revision: plan.revision,
        activity_plan_semantic_hash: plan.semanticHash,
        resolved_structure: plan.structure,
        resolved_structure_hash: plan.structureHash,
      },
      capturedAt: input.capturedAt.toISOString(),
    },
  };
}
