export const PLANNED_WORKOUT_RESOURCE = "planned_activities";
// Lower queue values run first. User-visible planned-activity mutations must not
// wait behind best-effort staging cleanup when both are already due.
export const PLANNED_ACTIVITY_JOB_PRIORITY = 50;

export type WahooPlannedActivitySyncPolicy = {
  availabilityWindowDays: number | null;
  provider: "wahoo";
  syncMode: "push_windowed" | "push_immediate";
  updateMode: "recreate" | "update";
};

const wahooPolicy: WahooPlannedActivitySyncPolicy = {
  availabilityWindowDays: 6,
  provider: "wahoo",
  syncMode: "push_windowed",
  updateMode: "recreate",
};

export function getWahooPlannedActivitySyncPolicy(): WahooPlannedActivitySyncPolicy {
  return wahooPolicy;
}

export function getWahooPlannedActivitySyncLaneKey(input: {
  plannedSessionId: string;
  integrationId: string;
}): string {
  // Wahoo plans may be shared by multiple dated events. Keep every planned-activity
  // mutation for one Wahoo account in a durable queue lane so the final unlink cannot
  // race another event that is creating, replacing, or removing the same remote plan.
  return `wahoo:${input.integrationId}:planned_session`;
}

export function getWahooPlannedActivityJobType(input: { operation: "publish" | "unsync" }): string {
  return `wahoo.${input.operation}_planned_session`;
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
