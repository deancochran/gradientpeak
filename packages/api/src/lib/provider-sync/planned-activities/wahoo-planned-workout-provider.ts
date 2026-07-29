import { activityPlanStructureSchemaV3, compileActivityPlanV3 } from "@repo/core";
import type { ProviderSyncRepository, WahooRepository } from "../../../repositories";
import { isWahooSupported, toActivityType } from "../../integrations/wahoo/activity-type-utils";
import {
  getWahooProjectionSnapshot,
  validateWahooCompatibility,
  type WahooProjectionSnapshot,
} from "../../integrations/wahoo/plan-converter";
import { hasWahooPlannedActivityScopes } from "../../integrations/wahoo/planned-activity-scopes";
import { resolveWahooSyncMetrics } from "../../integrations/wahoo/sync-service";
import { hashPlannedActivityPayload } from "./planned-activity-hash";
import {
  getEarliestPlannedActivityRunAt,
  getPlannedActivityJobType,
  getPlannedActivitySyncLaneKey,
  getPlannedActivitySyncPolicy,
} from "./planned-activity-policy";
import type { PlannedActivityProviderAdapter, PlannedActivityProviderQueueResult } from "./types";

type WahooJobPayload = {
  eventId: string;
  operation: "publish" | "unsync";
  projectionHash?: string;
  projectionSnapshot?: WahooProjectionSnapshot;
  startsAt?: string;
  unsyncTarget?: { externalId: string; resourceLinkId: string };
};

/** Preflight is deliberately before durable enqueue so ineligible events never reach a worker. */
export class WahooPlannedActivityProvider implements PlannedActivityProviderAdapter {
  readonly provider = "wahoo" as const;
  constructor(
    private readonly deps: {
      providerSyncRepository: ProviderSyncRepository;
      wahooRepository: WahooRepository;
      enqueueJob?: ProviderSyncRepository["enqueueJob"];
    },
  ) {}

  private async integration(profileId: string) {
    const integration = await this.deps.wahooRepository.findWahooIntegrationByProfileId(profileId);
    if (!integration) throw new Error("Wahoo integration not found");
    if (!hasWahooPlannedActivityScopes(integration.scope))
      throw new Error("Wahoo reconnect is required for planned-activity sync");
    return integration;
  }

  async enqueuePublishEvent(input: {
    eventId: string;
    profileId: string;
  }): Promise<PlannedActivityProviderQueueResult> {
    const integration = await this.integration(input.profileId);
    const planned = await this.deps.wahooRepository.getPlannedEventForSync(input);
    const existing = await this.deps.wahooRepository.getEventResourceLink({
      eventId: input.eventId,
      profileId: input.profileId,
      provider: "wahoo",
    });
    const rejectOrUnsync = (message: string) => {
      if (!existing) throw new Error(message);
      return this.enqueueUnsyncEvent({
        ...input,
        unsyncTarget: { externalId: existing.externalId, resourceLinkId: existing.id },
      });
    };
    if (!planned?.activityPlan) {
      return rejectOrUnsync("Activity plan not found for this planned activity event");
    }
    if (planned.routeId) {
      if (!existing) return { jobId: null, queued: false, skipped: true };
      return rejectOrUnsync("Wahoo route-linked planned activities are not supported");
    }
    const parsed = activityPlanStructureSchemaV3.safeParse(planned.activityPlan.structure);
    if (!parsed.success) {
      return rejectOrUnsync("Wahoo sync requires a valid Activity Plan V3 structure");
    }
    const structure = parsed.data;
    const compiled = compileActivityPlanV3(structure);
    const activityType = toActivityType(compiled.activity_category);
    if (!isWahooSupported(activityType)) {
      return rejectOrUnsync("Only run and bike planned activities are supported by Wahoo");
    }
    const metrics = resolveWahooSyncMetrics(
      await this.deps.wahooRepository.getProfileSyncMetrics(input.profileId),
      compiled.activity_category,
    );
    const compatibility = validateWahooCompatibility(structure, {
      activityType,
      name: planned.activityPlan.name,
      ...(metrics?.ftp !== null && metrics?.ftp !== undefined ? { ftp: metrics.ftp } : {}),
      ...(metrics?.maxHr !== null && metrics?.maxHr !== undefined ? { max_hr: metrics.maxHr } : {}),
      ...(metrics?.thresholdHr !== null && metrics?.thresholdHr !== undefined
        ? { threshold_hr: metrics.thresholdHr }
        : {}),
    });
    if (!compatibility.compatible) {
      return rejectOrUnsync(
        "Wahoo planned-activity preflight failed: unsupported activity semantics",
      );
    }
    const policy = getPlannedActivitySyncPolicy("wahoo");
    if (!policy) throw new Error("Wahoo planned-activity sync is not configured");
    const now = new Date().toISOString();
    const runAt = getEarliestPlannedActivityRunAt({
      availabilityWindowDays: policy.availabilityWindowDays,
      now,
      startsAt: planned.startsAt,
    });
    const projectionSnapshot = getWahooProjectionSnapshot(structure, {
      activityType,
      hasRoute: false,
      name: planned.activityPlan.name,
      ...(planned.activityPlan.description !== null
        ? { description: planned.activityPlan.description }
        : {}),
      ...(metrics?.ftp !== null && metrics?.ftp !== undefined ? { ftp: metrics.ftp } : {}),
      ...(metrics?.maxHr !== null && metrics?.maxHr !== undefined ? { max_hr: metrics.maxHr } : {}),
      ...(metrics?.thresholdHr !== null && metrics?.thresholdHr !== undefined
        ? { threshold_hr: metrics.thresholdHr }
        : {}),
    });
    const projectionHash = hashPlannedActivityPayload({
      projectionSnapshot,
      sourcePlanId: planned.activityPlan.id,
      sourceRouteId: null,
    });
    const payload: WahooJobPayload = {
      eventId: input.eventId,
      operation: "publish",
      projectionHash,
      projectionSnapshot,
      startsAt: planned.startsAt,
    };
    const enqueue =
      this.deps.enqueueJob ??
      this.deps.providerSyncRepository.enqueueJob.bind(this.deps.providerSyncRepository);
    const job = await enqueue({
      dedupeKey: `wahoo:publish:event:${input.eventId}`,
      integrationId: integration.id,
      integrationGeneration: integration.integrationGeneration,
      internalResourceId: input.eventId,
      jobType: getPlannedActivityJobType({ operation: "publish", provider: "wahoo" }),
      operation: "publish",
      payload,
      payloadHash: hashPlannedActivityPayload(payload),
      profileId: input.profileId,
      provider: "wahoo",
      resourceKind: "event",
      runAt,
      syncLaneKey: getPlannedActivitySyncLaneKey({
        eventId: input.eventId,
        integrationId: integration.id,
        provider: "wahoo",
      }),
    });
    return { jobId: job.id, queued: job.status === "queued" };
  }

  async enqueueUnsyncEvent(input: {
    eventId: string;
    profileId: string;
    unsyncTarget?: { externalId: string; resourceLinkId: string };
  }): Promise<PlannedActivityProviderQueueResult> {
    const integration = await this.integration(input.profileId);
    const payload: WahooJobPayload = {
      eventId: input.eventId,
      operation: "unsync",
      ...(input.unsyncTarget ? { unsyncTarget: input.unsyncTarget } : {}),
    };
    const enqueue =
      this.deps.enqueueJob ??
      this.deps.providerSyncRepository.enqueueJob.bind(this.deps.providerSyncRepository);
    const job = await enqueue({
      dedupeKey: `wahoo:unsync:event:${input.eventId}`,
      integrationId: integration.id,
      integrationGeneration: integration.integrationGeneration,
      internalResourceId: input.eventId,
      jobType: getPlannedActivityJobType({ operation: "unsync", provider: "wahoo" }),
      operation: "unsync",
      payload,
      payloadHash: hashPlannedActivityPayload(payload),
      profileId: input.profileId,
      provider: "wahoo",
      resourceKind: "event",
      runAt: new Date().toISOString(),
      syncLaneKey: getPlannedActivitySyncLaneKey({
        eventId: input.eventId,
        integrationId: integration.id,
        provider: "wahoo",
      }),
    });
    return { jobId: job.id, queued: job.status === "queued" };
  }
}
