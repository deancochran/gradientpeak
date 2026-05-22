import type { IntegrationProviderId } from "@repo/core";

export const PLANNED_WORKOUT_RESOURCE = "planned_workouts";

export type PlannedWorkoutSyncPolicy = {
  availabilityWindowDays: number | null;
  provider: IntegrationProviderId;
  syncMode: "push_windowed" | "push_immediate";
  updateMode: "recreate" | "update";
};

const policies: Partial<Record<IntegrationProviderId, PlannedWorkoutSyncPolicy>> = {
  wahoo: {
    availabilityWindowDays: 6,
    provider: "wahoo",
    syncMode: "push_windowed",
    updateMode: "recreate",
  },
};

export function getPlannedWorkoutSyncPolicy(
  provider: IntegrationProviderId,
): PlannedWorkoutSyncPolicy | null {
  return policies[provider] ?? null;
}

export function getPlannedWorkoutSyncLaneKey(input: {
  eventId: string;
  integrationId: string;
  provider: IntegrationProviderId;
}): string {
  return `${input.provider}:${input.integrationId}:planned_workout:${input.eventId}`;
}

export function getPlannedWorkoutJobType(input: {
  operation: "publish" | "unsync";
  provider: IntegrationProviderId;
}): string {
  return `${input.provider}.${input.operation}_event`;
}

export function getEarliestPlannedWorkoutRunAt(input: {
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
