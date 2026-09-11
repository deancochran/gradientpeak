import { activityPlanDocumentSchema, resolveActivityPlanVariant } from "@repo/core";
import type { PublishedAthletePerformanceTargetsRead } from "../../../application/athlete-intelligence/published-athlete-state";
import type { WahooRepository, WahooSyncRepository } from "../../../repositories";
import { hasWahooPlannedActivityScopes } from "../../integrations/wahoo/planned-activity-scopes";
import { hashPlannedActivityPayload } from "./planned-activity-hash";
import {
  getWahooPlannedActivityJobType,
  getWahooPlannedActivitySyncLaneKey,
  PLANNED_ACTIVITY_JOB_PRIORITY,
} from "./wahoo-planned-activity-policy";
import {
  buildWahooPlannedActivityPublishJob,
  projectWahooPlannedActivity,
  type WahooPublishablePlannedActivityProjection,
} from "./wahoo-planned-activity-projection";
import type {
  WahooPlannedActivityAdapter,
  WahooPlannedActivityProviderQueueResult,
} from "./wahoo-types";

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
export class WahooPlannedActivityProvider implements WahooPlannedActivityAdapter {
  readonly provider = "wahoo" as const;
  constructor(
    private readonly deps: {
      providerSyncRepository: WahooSyncRepository;
      wahooRepository: WahooRepository;
      getPerformanceTargets: (input: {
        profileId: string;
      }) => Promise<PublishedAthletePerformanceTargetsRead>;
      enqueueJob?: WahooSyncRepository["enqueueJob"];
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
    now: string;
    performanceModelAsOf: string;
    profileId: string;
    projection: WahooPublishablePlannedActivityProjection;
  }): Promise<WahooPlannedActivityProviderQueueResult> {
    const enqueue =
      this.deps.enqueueJob ??
      this.deps.providerSyncRepository.enqueueJob.bind(this.deps.providerSyncRepository);
    const job = await enqueue(buildWahooPlannedActivityPublishJob(input));
    return { jobId: job.id, queued: job.status === "queued" };
  }

  async enqueuePublishEvent(input: {
    eventId: string;
    profileId: string;
  }): Promise<WahooPlannedActivityProviderQueueResult> {
    const operationTime = this.deps.now();
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
    const parsed = activityPlanDocumentSchema.safeParse(planned.activityPlan.structure);
    if (!parsed.success) {
      return rejectOrUnsync("Wahoo sync requires a valid activity-plan document");
    }
    const resolved = resolveActivityPlanVariant(parsed.data);
    const publishedTargets = await this.deps.getPerformanceTargets({ profileId: input.profileId });
    if (publishedTargets.status === "unavailable") {
      throw new Error(
        "Wahoo planned-activity preflight failed: published performance targets unavailable",
      );
    }
    if (publishedTargets.status === "stale") {
      throw new Error(
        "Wahoo planned-activity preflight failed: published performance targets stale",
      );
    }
    const projection = projectWahooPlannedActivity({
      activityPlan: { ...planned.activityPlan, structure: resolved.structure },
      eventId: input.eventId,
      performanceTargets: publishedTargets.targets,
      startsAt: planned.startsAt,
      timezone: planned.timezone,
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
      now: operationTime.toISOString(),
      performanceModelAsOf: publishedTargets.targets.asOf,
      profileId: input.profileId,
      projection,
    });
  }

  async enqueueUnsyncEvent(input: {
    eventId: string;
    profileId: string;
    unsyncTarget?: { externalId: string; resourceLinkId: string };
  }): Promise<WahooPlannedActivityProviderQueueResult> {
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
      jobType: getWahooPlannedActivityJobType({ operation: "unsync" }),
      operation: "unsync",
      payload,
      payloadHash: hashPlannedActivityPayload(payload),
      priority: PLANNED_ACTIVITY_JOB_PRIORITY,
      profileId: input.profileId,
      provider: "wahoo",
      resourceKind: "event",
      runAt: new Date().toISOString(),
      syncLaneKey: getWahooPlannedActivitySyncLaneKey({
        eventId: input.eventId,
        integrationId: integration.id,
      }),
    });
    return { jobId: job.id, queued: job.status === "queued" };
  }
}
