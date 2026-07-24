import { activityPlanStructureSchemaV3, compileActivityPlanV3 } from "@repo/core";
import type { ProviderSyncRepository, WahooRepository } from "../../../repositories";
import {
  isWahooSupported,
  supportsRoutes,
  toActivityType,
} from "../../integrations/wahoo/activity-type-utils";
import {
  getWahooProjectionSnapshot,
  validateWahooCompatibility,
  type WahooProjectionSnapshot,
} from "../../integrations/wahoo/plan-converter";
import { resolveWahooSyncMetrics } from "../../integrations/wahoo/sync-service";
import { hashPlannedWorkoutPayload } from "./planned-workout-hash";
import {
  getEarliestPlannedWorkoutRunAt,
  getPlannedWorkoutJobType,
  getPlannedWorkoutSyncLaneKey,
  getPlannedWorkoutSyncPolicy,
  PLANNED_WORKOUT_RESOURCE,
} from "./planned-workout-policy";
import type { PlannedWorkoutProviderAdapter } from "./types";

type WahooJobPayload = {
  eventId: string;
  operation: "publish" | "unsync";
  projectionHash?: string;
  projectionSnapshot?: WahooProjectionSnapshot;
  unsyncTarget?: { externalId: string; resourceLinkId: string };
};

export class WahooPlannedWorkoutProvider implements PlannedWorkoutProviderAdapter {
  readonly provider = "wahoo" as const;

  constructor(
    private readonly deps: {
      providerSyncRepository: ProviderSyncRepository;
      wahooRepository: WahooRepository;
      enqueueJob?: ProviderSyncRepository["enqueueJob"];
    },
  ) {}

  async enqueuePublishEvent(input: { eventId: string; profileId: string }) {
    const integration = await this.deps.wahooRepository.findWahooIntegrationByProfileId(
      input.profileId,
    );
    if (!integration) {
      throw new Error("Wahoo integration not found");
    }

    const planned = await this.deps.wahooRepository.getPlannedEventForSync({
      eventId: input.eventId,
      profileId: input.profileId,
    });

    if (!planned) {
      throw new Error("Planned activity event not found");
    }

    if (!planned.activityPlan) {
      throw new Error("Activity plan not found for this planned activity event");
    }
    const parsedStructure = activityPlanStructureSchemaV3.safeParse(planned.activityPlan.structure);
    if (!parsedStructure.success) {
      throw new Error("Wahoo sync requires a valid Activity Plan V3 structure");
    }
    const compiled = compileActivityPlanV3(parsedStructure.data);
    const activityType = toActivityType(compiled.primaryCategory);
    if (!isWahooSupported(activityType)) {
      throw new Error(
        `${compiled.primaryCategory} planned workouts are not supported by Wahoo; use a single-sport run or bike plan`,
      );
    }
    const metrics = resolveWahooSyncMetrics(
      await this.deps.wahooRepository.getProfileSyncMetrics(input.profileId),
      compiled.primaryCategory,
    );
    const compatibility = validateWahooCompatibility(parsedStructure.data, {
      activityType,
      name: planned.activityPlan.name,
      ftp: metrics?.ftp ?? undefined,
      max_hr: metrics?.maxHr ?? undefined,
      threshold_hr: metrics?.thresholdHr ?? undefined,
    });
    if (!compatibility.compatible) {
      const issue = compatibility.issues[0];
      const path = issue?.path?.join(".");
      throw new Error(
        `Wahoo planned-workout preflight failed${path ? ` at ${path}` : ""}: ${issue?.message ?? "unsupported workout semantics"}`,
      );
    }
    if (planned.activityPlan.routeId) {
      if (!supportsRoutes(activityType)) {
        throw new Error(`${activityType} planned workouts cannot include Wahoo routes`);
      }
      const route = await this.deps.wahooRepository.getRouteForSync({
        profileId: input.profileId,
        routeId: planned.activityPlan.routeId,
      });
      if (!route?.filePath) {
        throw new Error("Wahoo planned-workout preflight failed: linked route is missing");
      }
    }

    const policy = getPlannedWorkoutSyncPolicy("wahoo");
    if (!policy) {
      throw new Error("Wahoo planned workout sync is not configured");
    }

    const now = new Date().toISOString();
    const runAt = getEarliestPlannedWorkoutRunAt({
      availabilityWindowDays: policy.availabilityWindowDays,
      now,
      startsAt: planned.startsAt,
    });
    const projectionSnapshot = getWahooProjectionSnapshot(parsedStructure.data, {
      activityType,
      description: planned.activityPlan.description ?? undefined,
      hasRoute: Boolean(planned.activityPlan.routeId),
      name: planned.activityPlan.name,
      ftp: metrics?.ftp ?? undefined,
      max_hr: metrics?.maxHr ?? undefined,
      threshold_hr: metrics?.thresholdHr ?? undefined,
    });
    const projectionHash = hashPlannedWorkoutPayload({
      projectionSnapshot,
      sourcePlanId: planned.activityPlan.id,
      sourceRouteId: planned.activityPlan.routeId,
    });
    const payload = {
      eventId: input.eventId,
      operation: "publish" satisfies WahooJobPayload["operation"],
      projectionHash,
      projectionSnapshot,
      source: {
        activityPlanId: planned.activityPlan.id,
        activityPlanUpdatedAt: planned.activityPlan.updatedAt,
        routeId: planned.activityPlan.routeId,
        startsAt: planned.startsAt,
      },
    };

    await this.deps.providerSyncRepository.touchSyncState({
      integrationId: integration.id,
      metadata: { last_enqueued_event_id: input.eventId },
      nextSyncAt: runAt,
      provider: "wahoo",
      publishHorizonDays: policy.availabilityWindowDays ?? undefined,
      resource: PLANNED_WORKOUT_RESOURCE,
      syncMode: policy.syncMode,
    });

    const queued = await (
      this.deps.enqueueJob ??
      this.deps.providerSyncRepository.enqueueJob.bind(this.deps.providerSyncRepository)
    )({
      dedupeKey: `wahoo:publish:event:${input.eventId}`,
      integrationId: integration.id,
      internalResourceId: input.eventId,
      jobType: getPlannedWorkoutJobType({ operation: "publish", provider: "wahoo" }),
      operation: "publish",
      payload,
      payloadHash: hashPlannedWorkoutPayload(payload),
      profileId: input.profileId,
      provider: "wahoo",
      resourceKind: "event",
      runAt,
      syncLaneKey: getPlannedWorkoutSyncLaneKey({
        eventId: input.eventId,
        integrationId: integration.id,
        provider: "wahoo",
      }),
    });

    return { jobId: queued.id, queued: queued.status === "queued" };
  }

  async enqueueUnsyncEvent(input: {
    eventId: string;
    profileId: string;
    unsyncTarget?: { externalId: string; resourceLinkId: string };
  }) {
    const integration = await this.deps.wahooRepository.findWahooIntegrationByProfileId(
      input.profileId,
    );
    if (!integration) {
      throw new Error("Wahoo integration not found");
    }

    const payload = {
      eventId: input.eventId,
      operation: "unsync" satisfies WahooJobPayload["operation"],
      ...(input.unsyncTarget ? { unsyncTarget: input.unsyncTarget } : {}),
    };

    const queued = await (
      this.deps.enqueueJob ??
      this.deps.providerSyncRepository.enqueueJob.bind(this.deps.providerSyncRepository)
    )({
      dedupeKey: `wahoo:unsync:event:${input.eventId}`,
      integrationId: integration.id,
      internalResourceId: input.eventId,
      jobType: getPlannedWorkoutJobType({ operation: "unsync", provider: "wahoo" }),
      operation: "unsync",
      payload,
      payloadHash: hashPlannedWorkoutPayload(payload),
      profileId: input.profileId,
      provider: "wahoo",
      resourceKind: "event",
      runAt: new Date().toISOString(),
      syncLaneKey: getPlannedWorkoutSyncLaneKey({
        eventId: input.eventId,
        integrationId: integration.id,
        provider: "wahoo",
      }),
    });

    return { jobId: queued.id, queued: queued.status === "queued" };
  }
}
