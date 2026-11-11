import { type ActivityPlanStructure, compileActivityPlan } from "@repo/core";
import type { WahooIntegrationRecord } from "../../../repositories/wahoo-repository";
import type { EnqueueWahooSyncJobInput } from "../../../repositories/wahoo-sync-repository";
import {
  getWahooProjectionCategoryOption,
  isWahooSupported,
  toActivityType,
} from "../../integrations/wahoo/activity-type-utils";
import {
  getWahooProjectionSnapshot,
  validateWahooCompatibility,
  type WahooCompatibilityResult,
  type WahooProjectionSnapshot,
} from "../../integrations/wahoo/plan-converter";
import { serializeWahooScheduledStart } from "../../integrations/wahoo/sync-service";
import { hashPlannedActivityPayload } from "./planned-activity-hash";
import {
  getEarliestPlannedActivityRunAt,
  getWahooPlannedActivityJobType,
  getWahooPlannedActivitySyncLaneKey,
  getWahooPlannedActivitySyncPolicy,
  PLANNED_ACTIVITY_JOB_PRIORITY,
} from "./wahoo-planned-activity-policy";

type WahooPublishJobPayload = {
  performanceModelAsOf: string;
  plannedSessionId: string;
  operation: "publish";
  projectionHash: string;
  projectionSnapshot: WahooProjectionSnapshot;
  startsAt: string;
  timezone: string;
};

type WahooPublishDesiredPayload = Omit<WahooPublishJobPayload, "performanceModelAsOf">;

export type WahooPlannedActivityProjection =
  | { disposition: "unsupported_sport" }
  | { compatibility: WahooCompatibilityResult; disposition: "incompatible" }
  | {
      desiredPayload: WahooPublishDesiredPayload;
      disposition: "publishable";
      payloadHash: string;
    };

export type WahooPublishablePlannedActivityProjection = Extract<
  WahooPlannedActivityProjection,
  { disposition: "publishable" }
>;

export function projectWahooPlannedActivity(input: {
  activityPlan: {
    description: string | null;
    id: string;
    name: string;
    structure: ActivityPlanStructure;
  };
  plannedSessionId?: string;
  planningDate?: string;
  /** @deprecated Generic-event projection compatibility. */
  eventId?: string;
  /** @deprecated Generic-event projection compatibility. */
  startsAt?: string;
  /** @deprecated Snapshot structure already contains resolved targets. */
  performanceTargets?: unknown;
  timezone: string;
}): WahooPlannedActivityProjection {
  const compiled = compileActivityPlan(input.activityPlan.structure);
  const providerActivityType = toActivityType(compiled.activity_category);
  if (!isWahooSupported(providerActivityType)) return { disposition: "unsupported_sport" };

  const options = {
    ...getWahooProjectionCategoryOption(providerActivityType),
    name: input.activityPlan.name,
    ...(input.activityPlan.description !== null
      ? { description: input.activityPlan.description }
      : {}),
    hasRoute: false,
  };
  const compatibility = validateWahooCompatibility(input.activityPlan.structure, options);
  if (!compatibility.compatible) return { compatibility, disposition: "incompatible" };

  const projectionSnapshot = getWahooProjectionSnapshot(input.activityPlan.structure, options);
  const projectionHash = hashPlannedActivityPayload({
    projectionSnapshot,
    sourcePlanId: input.activityPlan.id,
    sourceRouteId: null,
  });
  const desiredPayload: WahooPublishDesiredPayload = {
    plannedSessionId: input.plannedSessionId ?? input.eventId ?? "legacy",
    operation: "publish",
    projectionHash,
    projectionSnapshot,
    startsAt: serializeWahooScheduledStart(
      input.startsAt ?? `${input.planningDate ?? "1970-01-01"}T12:00:00.000Z`,
      input.timezone,
    ),
    timezone: input.timezone,
  };
  return {
    desiredPayload,
    disposition: "publishable",
    payloadHash: hashPlannedActivityPayload(desiredPayload),
  };
}

export function buildWahooPlannedActivityPublishJob(input: {
  integration: Pick<WahooIntegrationRecord, "id" | "integrationGeneration">;
  now: string;
  performanceModelAsOf: string;
  profileId: string;
  projection: WahooPublishablePlannedActivityProjection;
}): EnqueueWahooSyncJobInput {
  const policy = getWahooPlannedActivitySyncPolicy();
  const runAt = getEarliestPlannedActivityRunAt({
    availabilityWindowDays: policy.availabilityWindowDays,
    now: input.now,
    startsAt: input.projection.desiredPayload.startsAt,
  });
  return {
    dedupeKey: `wahoo:publish:planned_session:${input.projection.desiredPayload.plannedSessionId}`,
    integrationId: input.integration.id,
    integrationGeneration: input.integration.integrationGeneration,
    internalResourceId: input.projection.desiredPayload.plannedSessionId,
    jobType: getWahooPlannedActivityJobType({ operation: "publish" }),
    operation: "publish",
    payload: {
      performanceModelAsOf: input.performanceModelAsOf,
      ...input.projection.desiredPayload,
    } satisfies WahooPublishJobPayload,
    // Model time fences worker recomputation but is not itself provider-visible desired state.
    payloadHash: input.projection.payloadHash,
    priority: PLANNED_ACTIVITY_JOB_PRIORITY,
    profileId: input.profileId,
    provider: "wahoo",
    resourceKind: "planned_session",
    runAt,
    syncLaneKey: getWahooPlannedActivitySyncLaneKey({
      plannedSessionId: input.projection.desiredPayload.plannedSessionId,
      integrationId: input.integration.id,
    }),
  };
}
