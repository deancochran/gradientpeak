import type { IntegrationProviderId } from "@repo/core";

export const PLANNED_WORKOUT_RESOURCE = "planned_activities";

export type PlannedActivitySyncPolicy = {
  availabilityWindowDays: number | null;
  provider: IntegrationProviderId;
  syncMode: "push_windowed" | "push_immediate";
  updateMode: "recreate" | "update";
};

const policies: Partial<Record<IntegrationProviderId, PlannedActivitySyncPolicy>> = {
  wahoo: {
    availabilityWindowDays: 6,
    provider: "wahoo",
    syncMode: "push_windowed",
    updateMode: "recreate",
  },
};

export function getPlannedActivitySyncPolicy(
  provider: IntegrationProviderId,
): PlannedActivitySyncPolicy | null {
  return policies[provider] ?? null;
}

export function getPlannedActivitySyncLaneKey(input: {
  eventId: string;
  integrationId: string;
  provider: IntegrationProviderId;
}): string {
  // Wahoo plans may be shared by multiple dated events. Keep every planned-activity
  // mutation for one Wahoo account in a durable queue lane so the final unlink cannot
  // race another event that is creating, replacing, or removing the same remote plan.
  if (input.provider === "wahoo") {
    return `${input.provider}:${input.integrationId}:planned_activity`;
  }
  return `${input.provider}:${input.integrationId}:planned_activity:${input.eventId}`;
}

export function getPlannedActivityJobType(input: {
  operation: "publish" | "unsync";
  provider: IntegrationProviderId;
}): string {
  return `${input.provider}.${input.operation}_event`;
}

export function getEarliestPlannedActivityRunAt(input: {
  availabilityWindowDays: number | null;
  now: string;
  startsAt: string;
}): string {
  if (input.availabilityWindowDays === null) return input.now;

  const earliest = new Date(input.startsAt);
  earliest.setUTCDate(earliest.getUTCDate() - input.availabilityWindowDays);
  const earliestIso = earliest.toISOString();

  return earliestIso > input.now ? earliestIso : input.now;
}
