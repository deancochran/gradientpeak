import { activityPlanStructureSchema } from "@repo/core";
import type { AthletePerformanceTargetFactsReader } from "../../../application/performance-model/get-athlete-performance-model-as-of";
import type { ProviderSyncRepository, WahooRepository } from "../../../repositories";
import { hasWahooPlannedActivityScopes } from "../../integrations/wahoo/planned-activity-scopes";
import { hashPlannedActivityPayload } from "./planned-activity-hash";
import {
  getPlannedActivityJobType,
  getPlannedActivitySyncLaneKey,
  PLANNED_ACTIVITY_JOB_PRIORITY,
} from "./planned-activity-policy";
import type { PlannedActivityProviderAdapter, PlannedActivityProviderQueueResult } from "./types";
import {
  buildWahooPlannedActivityPublishJob,
  projectWahooPlannedActivity,
  type WahooPublishablePlannedActivityProjection,
} from "./wahoo-planned-activity-projection";

type WahooUnsyncJobPayload = {
  eventId: string;
  operation: "unsync";
  unsyncTarget?: { externalId: string; resourceLinkId: string };
};

type WahooJobPayload = WahooUnsyncJobPayload;
type WahooIntegration = NonNullable<
  Awaited<ReturnType<WahooRepository["findWahooIntegrationByProfileId"]>>
>;

/** Preflight is deliberately before durable enqueue so ineligible events never reach a worker. */
export class WahooPlannedActivityProvider implements PlannedActivityProviderAdapter {
  readonly provider = "wahoo" as const;
  constructor(
    private readonly deps: {
      providerSyncRepository: ProviderSyncRepository;
      wahooRepository: WahooRepository;
      getPerformanceTargets: AthletePerformanceTargetFactsReader;
      enqueueJob?: ProviderSyncRepository["enqueueJob"];
      now: () => Date;
    },
  ) {}

  private async integration(profileId: string) {
    const integration = await this.deps.wahooRepository.findWahooIntegrationByProfileId(profileId);
    if (!integration) throw new Error("Wahoo integration not found");
    if (!hasWahooPlannedActivityScopes(integration.scope))
      throw new Error("Wahoo reconnect is required for planned-activity sync");
    return integration;
  }

  private async enqueuePublishProjection(input: {
    integration: WahooIntegration;
    performanceModelAsOf: string;
    profileId: string;
    projection: WahooPublishablePlannedActivityProjection;
  }): Promise<PlannedActivityProviderQueueResult> {
    const enqueue =
      this.deps.enqueueJob ??
      this.deps.providerSyncRepository.enqueueJob.bind(this.deps.providerSyncRepository);
    const job = await enqueue(buildWahooPlannedActivityPublishJob(input));
    return { jobId: job.id, queued: job.status === "queued" };
  }

  async enqueuePublishEvent(input: {
    eventId: string;
    profileId: string;
  }): Promise<PlannedActivityProviderQueueResult> {
    const operationTime = this.deps.now();
    const performanceModelAsOf = operationTime.toISOString();
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
    const parsed = activityPlanStructureSchema.safeParse(planned.activityPlan.structure);
    if (!parsed.success) {
      return rejectOrUnsync("Wahoo sync requires a valid activity-plan structure");
    }
    const projection = projectWahooPlannedActivity({
      activityPlan: { ...planned.activityPlan, structure: parsed.data },
      eventId: input.eventId,
      performanceTargets: await this.deps.getPerformanceTargets({
        actorProfileId: input.profileId,
        asOf: operationTime,
      }),
      startsAt: planned.startsAt,
    });
    if (projection.disposition === "unsupported_sport") {
      return rejectOrUnsync("Only run and bike planned activities are supported by Wahoo");
    }
    if (projection.disposition === "incompatible") {
      if (projection.compatibility.issues.some((issue) => issue.code === "missing_metric")) {
        throw new Error("Wahoo planned-activity preflight failed: performance target unavailable");
      }
      return rejectOrUnsync(
        "Wahoo planned-activity preflight failed: unsupported activity semantics",
      );
    }
    return this.enqueuePublishProjection({
      integration,
      performanceModelAsOf,
      profileId: input.profileId,
      projection,
    });
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
      priority: PLANNED_ACTIVITY_JOB_PRIORITY,
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
