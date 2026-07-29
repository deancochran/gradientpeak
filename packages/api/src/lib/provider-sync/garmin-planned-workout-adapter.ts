import type {
  PlannedActivityProviderAdapter,
  ProviderPublishResult,
  ProviderSyncEligibility,
} from "./provider-adapter";

const DEFAULT_GARMIN_PUBLISH_HORIZON_DAYS = 15;

function diffUtcDays(fromIso: string, toIso: string): number {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

export class GarminPlannedActivityAdapter implements PlannedActivityProviderAdapter {
  async getPublishEligibility(input: {
    integrationId: string;
    profileId: string;
    resourceKind: "event" | "activity_plan" | "activity_route" | "activity";
    startsAt: string;
  }): Promise<ProviderSyncEligibility> {
    const daysUntilActivity = diffUtcDays(new Date().toISOString(), input.startsAt);
    const maturityReason =
      "Garmin planned-activity delivery is evidence-gated; partner publish support is not available.";
    if (daysUntilActivity > DEFAULT_GARMIN_PUBLISH_HORIZON_DAYS) {
      const nextEligibleAt = new Date(input.startsAt);
      nextEligibleAt.setUTCDate(nextEligibleAt.getUTCDate() - DEFAULT_GARMIN_PUBLISH_HORIZON_DAYS);

      return {
        eligible: false,
        nextEligibleAt: nextEligibleAt.toISOString(),
        reason: maturityReason,
      };
    }

    return {
      eligible: false,
      reason: maturityReason,
    };
  }

  async publishResource(): Promise<ProviderPublishResult> {
    return {
      action: "noop",
      error: "Garmin planned activity publish is not implemented yet",
      success: false,
    };
  }

  async unsyncResource(): Promise<ProviderPublishResult> {
    return {
      action: "noop",
      error: "Garmin planned activity unsync is not implemented yet",
      success: false,
    };
  }

  async reconcileIntegration(): Promise<void> {
    return Promise.resolve();
  }
}

export function getDefaultGarminPublishHorizonDays() {
  return DEFAULT_GARMIN_PUBLISH_HORIZON_DAYS;
}
