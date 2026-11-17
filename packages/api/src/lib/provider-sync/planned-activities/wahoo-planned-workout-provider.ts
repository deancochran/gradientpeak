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
  plannedSessionId: string;
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
      /** @deprecated Planned-session publication uses the frozen manifest instead. */
      getPerformanceTargets?: (input: { profileId: string }) => Promise<unknown>;
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

  async enqueuePublishPlannedSession(input: {
    plannedSessionId: string;
    profileId: string;
  }): Promise<WahooPlannedActivityProviderQueueResult> {
    const operationTime = this.deps.now();
    const integration = await this.integration(input.profileId);
    const planned = await this.deps.wahooRepository.getPlannedSessionForSync(input);
    const existing = await this.deps.wahooRepository.getPlannedSessionResourceLink({
      plannedSessionId: input.plannedSessionId,
      profileId: input.profileId,
      provider: "wahoo",
    });
    const rejectOrUnsync = (message: string) => {
      if (!existing) throw new Error(message);
      return this.enqueueUnsyncPlannedSession({
        ...input,
        unsyncTarget: { externalId: existing.externalId, resourceLinkId: existing.id },
      });
    };
    if (!planned?.activityPlan) return rejectOrUnsync("Planned-session prescription not found");
    const projection = projectWahooPlannedActivity({
      activityPlan: planned.activityPlan,
      plannedSessionId: input.plannedSessionId,
      planningDate: planned.planningDate,
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
      performanceModelAsOf: planned.activityPlan.updatedAt,
      profileId: input.profileId,
      projection,
    });
  }

  async enqueueUnsyncPlannedSession(input: {
    plannedSessionId: string;
    profileId: string;
    unsyncTarget?: { externalId: string; resourceLinkId: string };
  }): Promise<WahooPlannedActivityProviderQueueResult> {
    const integration = await this.integration(input.profileId);
    const payload: WahooJobPayload = {
      plannedSessionId: input.plannedSessionId,
      operation: "unsync",
      ...(input.unsyncTarget ? { unsyncTarget: input.unsyncTarget } : {}),
    };
    const enqueue =
      this.deps.enqueueJob ??
      this.deps.providerSyncRepository.enqueueJob.bind(this.deps.providerSyncRepository);
    const job = await enqueue({
      dedupeKey: `wahoo:unsync:planned_session:${input.plannedSessionId}`,
      integrationId: integration.id,
      integrationGeneration: integration.integrationGeneration,
      internalResourceId: input.plannedSessionId,
      jobType: getWahooPlannedActivityJobType({ operation: "unsync" }),
      operation: "unsync",
      payload,
      payloadHash: hashPlannedActivityPayload(payload),
      priority: PLANNED_ACTIVITY_JOB_PRIORITY,
      profileId: input.profileId,
      provider: "wahoo",
      resourceKind: "planned_session",
      runAt: new Date().toISOString(),
      syncLaneKey: getWahooPlannedActivitySyncLaneKey({
        plannedSessionId: input.plannedSessionId,
        integrationId: integration.id,
      }),
    });
    return { jobId: job.id, queued: job.status === "queued" };
  }
}
