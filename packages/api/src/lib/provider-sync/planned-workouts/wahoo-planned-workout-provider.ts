import type { ProviderSyncRepository, WahooRepository } from "../../../repositories";
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
};

export class WahooPlannedWorkoutProvider implements PlannedWorkoutProviderAdapter {
  readonly provider = "wahoo" as const;

  constructor(
    private readonly deps: {
      providerSyncRepository: ProviderSyncRepository;
      wahooRepository: WahooRepository;
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
    const payload = {
      eventId: input.eventId,
      operation: "publish" satisfies WahooJobPayload["operation"],
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

    const queued = await this.deps.providerSyncRepository.enqueueJob({
      dedupeKey: `wahoo:publish:event:${input.eventId}`,
      integrationId: integration.id,
      internalResourceId: input.eventId,
      jobType: getPlannedWorkoutJobType({ operation: "publish", provider: "wahoo" }),
      operation: "publish",
      payload,
      payloadHash: hashPlannedWorkoutPayload({
        activityPlanId: planned.activityPlan?.id ?? null,
        activityPlanUpdatedAt: planned.activityPlan?.updatedAt ?? null,
        eventId: input.eventId,
        operation: "publish",
        routeId: planned.activityPlan?.routeId ?? null,
        startsAt: planned.startsAt,
      }),
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

  async enqueueUnsyncEvent(input: { eventId: string; profileId: string }) {
    const integration = await this.deps.wahooRepository.findWahooIntegrationByProfileId(
      input.profileId,
    );
    if (!integration) {
      throw new Error("Wahoo integration not found");
    }

    const payload = {
      eventId: input.eventId,
      operation: "unsync" satisfies WahooJobPayload["operation"],
    };

    const queued = await this.deps.providerSyncRepository.enqueueJob({
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
