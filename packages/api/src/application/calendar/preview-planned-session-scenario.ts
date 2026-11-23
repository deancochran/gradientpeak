import {
  getCalendarDateInIanaZone,
  ianaTimezoneSchema,
  type ProjectedTrainingStimulus,
  resolvePlanReadinessHorizon,
  resolvePrescription,
  scheduledDateTimeToIsoInstant,
  simulateTrainingPlan,
} from "@repo/core";
import type { PlannedSession } from "@repo/core/calendar";
import { activityPlans } from "@repo/db";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import type { DrizzleQueryExecutor } from "../../db";
import type {
  ActivityPlanPrescriptionSource,
  PlannedSessionRepositoryPort,
} from "../../repositories/planned-session-repository-port";
import { toVerifiedResolverCandidates } from "../activity-plans/resolver-candidate";
import { activityPlanCanonicalStructureHash } from "../activity-plans/structure-hash";
import { readAthleteReadModel } from "../athlete-intelligence/athlete-read-model";
import { loadPlanningBaseline } from "../athlete-intelligence/load-planning-baseline";
import { selectSimulatedSessionsForProjection } from "../training-plan/projection-planning";
import { resolveCurrentPlannedSessionPlan } from "./resolve-current-planned-session-plan";

const MAX_SCENARIO_SESSIONS = 366;
const scenarioSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("as_planned") }).strict(),
  z.object({ kind: z.literal("less") }).strict(),
  z.object({ kind: z.literal("more") }).strict(),
  z.object({ kind: z.literal("skip") }).strict(),
  z.object({ kind: z.literal("substitute"), activityPlanId: z.string().uuid() }).strict(),
]);

export const previewPlannedSessionScenarioInputSchema = z
  .object({
    sessionId: z.string().uuid(),
    expectedSessionRevision: z.number().int().positive(),
    expectedPlanRevision: z.number().int().positive(),
    expectedStateRevision: z.number().int().nonnegative(),
    scenario: scenarioSchema,
  })
  .strict();

const unavailable = (reason: string) => ({ status: "unavailable" as const, reason });
const stale = (
  reason: string,
  current: { sessionRevision?: number; planRevision?: number; stateRevision?: number } = {},
) => ({
  status: "stale" as const,
  reason,
  currentSessionRevision: current.sessionRevision ?? null,
  currentPlanRevision: current.planRevision ?? null,
  currentStateRevision: current.stateRevision ?? null,
});

function demandForPlan(plan: ActivityPlanPrescriptionSource) {
  return {
    activity_category: plan.structure.activity_category,
    training_intent: plan.trainingIntent,
    target_duration_minutes: null,
    target_common_load: null,
    importance: "normal" as const,
  };
}

function scaleDuration(durationSeconds: number | null, scale: number) {
  return durationSeconds === null ? null : Math.max(1, Math.round((durationSeconds / 60) * scale));
}

/**
 * Read-only comparison authority. It resolves every remaining scheduled session
 * from the current plan reference; persisted snapshots are provenance only.
 */
export async function previewPlannedSessionScenario(input: {
  db: DrizzleQueryExecutor;
  repository: PlannedSessionRepositoryPort;
  profileId: string;
  values: z.input<typeof previewPlannedSessionScenarioInputSchema>;
  now: Date;
}) {
  const values = previewPlannedSessionScenarioInputSchema.parse(input.values);
  const selected = await input.repository.getOwned({
    profileId: input.profileId,
    sessionId: values.sessionId,
  });
  if (!selected) return unavailable("session_not_found");
  if (selected.lifecycle.status !== "scheduled") return unavailable("session_not_scheduled");
  if (selected.sessionRevision !== values.expectedSessionRevision)
    return stale("session_revision", { sessionRevision: selected.sessionRevision });

  const readModel = await readAthleteReadModel({
    db: input.db,
    profileId: input.profileId,
    now: input.now,
    sections: {
      publishedState: true,
      status: true,
      currentBaseline: { includePlanningContext: false },
    },
  });
  if (readModel.publishedRevision !== values.expectedStateRevision)
    return stale("state_revision", { stateRevision: readModel.publishedRevision ?? undefined });
  const simulationBaseline = readModel.currentBaseline?.baseline;
  if (!simulationBaseline || !readModel.currentBaseline?.planningTimezone)
    return unavailable("baseline_unavailable");
  const timezone = ianaTimezoneSchema.safeParse(readModel.currentBaseline.planningTimezone);
  if (!timezone.success) return unavailable("planning_timezone_unavailable");

  const today = getCalendarDateInIanaZone(input.now.toISOString(), timezone.data);
  if (selected.planningDate < today) return unavailable("session_in_past");
  const endDate = new Date(`${selected.planningDate}T00:00:00.000Z`);
  endDate.setUTCDate(endDate.getUTCDate() + MAX_SCENARIO_SESSIONS - 1);
  const range = await input.repository.listOwnedRange({
    profileId: input.profileId,
    startDate: selected.planningDate,
    endDate: endDate.toISOString().slice(0, 10),
    limit: MAX_SCENARIO_SESSIONS,
  });
  if (range.truncated) return unavailable("horizon_exceeds_limit");
  const sessions = range.items.filter((session) => session.lifecycle.status === "scheduled");
  if (!sessions.some((session) => session.id === selected.id))
    return unavailable("session_not_scheduled");

  const currentPlans = await Promise.all(
    sessions.map(async (session) => ({
      session,
      plan: await resolveCurrentPlannedSessionPlan({
        repository: input.repository,
        profileId: input.profileId,
        session,
      }),
    })),
  );
  const resolvedPlans = currentPlans.flatMap(({ session, plan }) =>
    plan && activityPlanCanonicalStructureHash(plan.structure) === plan.structureHash
      ? [{ session, plan }]
      : [],
  );
  if (resolvedPlans.length !== currentPlans.length) return unavailable("current_plan_unavailable");
  const selectedPlan = resolvedPlans.find(({ session }) => session.id === selected.id)?.plan;
  if (!selectedPlan) return unavailable("current_plan_unavailable");
  if (selectedPlan.revision !== values.expectedPlanRevision)
    return stale("plan_revision", { planRevision: selectedPlan.revision });

  const replacementId =
    values.scenario.kind === "substitute" ? values.scenario.activityPlanId : null;
  const ids = new Set(resolvedPlans.map(({ plan }) => plan.id));
  if (replacementId) ids.add(replacementId);
  const candidateRows = await input.db
    .select()
    .from(activityPlans)
    .where(
      and(
        or(
          eq(activityPlans.profile_id, input.profileId),
          eq(activityPlans.content_visibility, "public"),
          eq(activityPlans.is_system_template, true),
        ),
      ),
    )
    .limit(1001);
  if (
    candidateRows.length > 1000 ||
    [...ids].some((id) => !candidateRows.some((row) => row.id === id))
  )
    return unavailable("candidate_unavailable");
  let candidates: ReturnType<typeof toVerifiedResolverCandidates>;
  try {
    candidates = toVerifiedResolverCandidates(
      candidateRows.map((row) => ({
        id: row.id,
        revision: row.revision,
        structure: row.structure,
        structureHash: row.structure_hash,
        semanticHash: row.semantic_hash,
        trainingIntent: row.training_intent,
      })),
      [...ids],
    );
  } catch {
    return unavailable("candidate_unavailable");
  }
  const baseline = await loadPlanningBaseline({
    db: input.db,
    profileId: input.profileId,
    now: input.now,
  });
  const resolve = (
    session: PlannedSession,
    plan: ActivityPlanPrescriptionSource,
    alternative: boolean,
  ) => {
    const activityPlanId = alternative && session.id === selected.id ? replacementId : plan.id;
    const baselineResolution = resolvePrescription({
      demand: demandForPlan(plan),
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
      baseline,
      planning_weekday: new Date(`${session.planningDate}T00:00:00.000Z`).getUTCDay(),
      candidates: candidates.filter((candidate) => candidate.id === plan.id),
    });
    if (baselineResolution.status !== "resolved") return baselineResolution;
    const scale =
      alternative && session.id === selected.id
        ? values.scenario.kind === "less"
          ? 0.75
          : values.scenario.kind === "more"
            ? 1.25
            : 1
        : 1;
    const targetDuration = scaleDuration(
      baselineResolution.manifest.prescription_estimate.duration.value_seconds,
      scale,
    );
    return resolvePrescription({
      demand: { ...demandForPlan(plan), target_duration_minutes: targetDuration },
      activity_plan_id: activityPlanId,
      preferences: {
        weekly_session_count: null,
        target_weekly_duration_minutes: null,
        maximum_session_duration_minutes: null,
        preferred_weekdays: [],
        rest_days: [],
        progression_style: null,
        recovery_priority: null,
      },
      baseline,
      planning_weekday: new Date(`${session.planningDate}T00:00:00.000Z`).getUTCDay(),
      candidates:
        activityPlanId === null
          ? candidates
          : candidates.filter((candidate) => candidate.id === activityPlanId),
    });
  };
  const toStimuli = (alternative: boolean): ProjectedTrainingStimulus[] | null => {
    const stimuli: Array<ProjectedTrainingStimulus & { planningDate: string; isUntimed: boolean }> =
      [];
    for (const { session, plan } of resolvedPlans) {
      if (alternative && session.id === selected.id && values.scenario.kind === "skip") continue;
      const result = resolve(session, plan, alternative);
      if (
        result.status !== "resolved" ||
        result.manifest.prescription_estimate.common_load.value === null
      )
        return null;
      stimuli.push({
        kind: "projected",
        sourceId: session.id,
        scheduledAt: scheduledDateTimeToIsoInstant({
          scheduledDate: session.planningDate,
          time: "00:00",
          timeZone: timezone.data,
        }),
        planningDate: session.planningDate,
        isUntimed: true,
        activityCategory: plan.structure.activity_category,
        commonLoad: result.manifest.prescription_estimate.common_load.value,
      });
    }
    return selectSimulatedSessionsForProjection({
      baselineAsOf: simulationBaseline.asOf,
      planningTimezone: timezone.data,
      sessions: stimuli,
    });
  };
  const baselineStimuli = toStimuli(false);
  const alternativeStimuli = toStimuli(true);
  if (!baselineStimuli || !alternativeStimuli) return unavailable("prescription_unavailable");
  const simulationAt = resolvePlanReadinessHorizon({
    baselineAsOf: simulationBaseline.asOf,
    plannedSessions: baselineStimuli,
    goal: null,
  });
  const simulate = (plannedSessions: ProjectedTrainingStimulus[]) =>
    simulateTrainingPlan({
      baseline: simulationBaseline,
      plannedSessions,
      simulationAt,
      planningTimezone: timezone.data,
      goal: null,
    });
  return {
    status: "available" as const,
    selectedSession: {
      id: selected.id,
      sessionRevision: selected.sessionRevision,
      planningDate: selected.planningDate,
    },
    stateRevision: readModel.publishedRevision,
    freshness: readModel.status?.freshness ?? "unavailable",
    horizon: { startDate: selected.planningDate, simulationAt, sessionCount: sessions.length },
    scenario: values.scenario,
    baseline: simulate(baselineStimuli),
    alternative: simulate(alternativeStimuli),
    provenance: {
      resolution: "current_activity_plan",
      selectedPlan: { id: selectedPlan.id, revision: selectedPlan.revision },
      historicalSnapshots: "provenance_only" as const,
    },
  };
}
