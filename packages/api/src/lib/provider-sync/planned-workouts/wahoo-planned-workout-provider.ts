import { getProviderCapabilityUnavailableReason } from "@repo/core";
import type { ProviderSyncRepository, WahooRepository } from "../../../repositories";
import type { PlannedWorkoutProviderAdapter, PlannedWorkoutProviderQueueResult } from "./types";

export class WahooPlannedWorkoutProvider implements PlannedWorkoutProviderAdapter {
  readonly provider = "wahoo" as const;

  constructor(
    private readonly deps: {
      providerSyncRepository: ProviderSyncRepository;
      wahooRepository: WahooRepository;
      enqueueJob?: ProviderSyncRepository["enqueueJob"];
    },
  ) {}

  async enqueuePublishEvent(input: {
    eventId: string;
    profileId: string;
  }): Promise<PlannedWorkoutProviderQueueResult> {
    void input;
    void this.deps;
    throw new Error(
      getProviderCapabilityUnavailableReason("wahoo", "planned_activity_push") ??
        "Wahoo planned activity push is unavailable",
    );
  }

  async enqueueUnsyncEvent(input: {
    eventId: string;
    profileId: string;
    unsyncTarget?: { externalId: string; resourceLinkId: string };
  }): Promise<PlannedWorkoutProviderQueueResult> {
    void input;
    void this.deps;
    throw new Error(
      getProviderCapabilityUnavailableReason("wahoo", "planned_activity_push") ??
        "Wahoo planned activity push is unavailable",
    );
  }
}
