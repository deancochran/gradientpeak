import type { PlannedWorkoutProviderAdapter, ProviderPublishResult, ProviderSyncEligibility } from "./provider-adapter";

const DEFAULT_GARMIN_PUBLISH_HORIZON_DAYS = 15;

function diffUtcDays(fromIso: string, toIso: string): number {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

export class GarminPlannedWorkoutAdapter implements PlannedWorkoutProviderAdapter {
  async getPublishEligibility(input: {
    integrationId: string;
    profileId: string;
    resourceKind: "event" | "activity_plan" | "activity_route" | "activity";
    startsAt: string;
  }): Promise<ProviderSyncEligibility> {
    const daysUntilWorkout = diffUtcDays(new Date().toISOString(), input.startsAt);
    if (daysUntilWorkout > DEFAULT_GARMIN_PUBLISH_HORIZON_DAYS) {
      const nextEligibleAt = new Date(input.startsAt);
      nextEligibleAt.setUTCDate(nextEligibleAt.getUTCDate() - DEFAULT_GARMIN_PUBLISH_HORIZON_DAYS);

      return {
        eligible: false,
        nextEligibleAt: nextEligibleAt.toISOString(),
        reason: `Garmin publish horizon scaffold set to ${DEFAULT_GARMIN_PUBLISH_HORIZON_DAYS} days`,
      };
    }

    return {
      eligible: true,
      warnings: [
        "Garmin adapter is scaffold-only. Partner-specific publish behavior still needs implementation.",
      ],
    };
  }

  async publishResource(): Promise<ProviderPublishResult> {
    return {
      action: "noop",
      error: "Garmin planned workout publish is not implemented yet",
      success: false,
    };
  }

  async unsyncResource(): Promise<ProviderPublishResult> {
    return {
      action: "noop",
      error: "Garmin planned workout unsync is not implemented yet",
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
