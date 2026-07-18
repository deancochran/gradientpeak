import {
  type ActivityEffortCategory,
  type ActivityEffortObservationStatus,
  type ActivityEffortType,
  formatEffortDuration,
  getActivityEffortObservationStatus,
  paceSecondsFromSpeedMetersPerSecond,
} from "@repo/core/athlete-inputs";

export type ActivityEffortPresentationRow = {
  activity_category: ActivityEffortCategory;
  activity_id?: string | null;
  duration_seconds: number;
  effort_type: ActivityEffortType;
  id: string;
  method?: string | null;
  provenance?: unknown;
  recorded_at: Date | string;
  source?: string | null;
  unit?: string | null;
  value: number;
};

export type DurationCurvePoint = {
  durationSeconds: number;
  id: string;
  label: string;
  value: number;
};

export function getEffortStatus(
  effort: ActivityEffortPresentationRow,
): ActivityEffortObservationStatus {
  return getActivityEffortObservationStatus({
    activityCategory: effort.activity_category,
    activityId: effort.activity_id,
    durationSeconds: effort.duration_seconds,
    effortType: effort.effort_type,
    method: effort.method,
    provenance: effort.provenance,
    source: effort.source,
    unit: effort.unit,
    value: effort.value,
  });
}

export function buildObservedDurationCurve(
  efforts: readonly ActivityEffortPresentationRow[],
): DurationCurvePoint[] {
  const bestByDuration = new Map<number, ActivityEffortPresentationRow>();

  for (const effort of efforts) {
    if (getEffortStatus(effort) !== "observed") continue;
    const current = bestByDuration.get(effort.duration_seconds);
    if (!current || effort.value > current.value)
      bestByDuration.set(effort.duration_seconds, effort);
  }

  return [...bestByDuration.values()]
    .sort((left, right) => left.duration_seconds - right.duration_seconds)
    .map((effort) => ({
      durationSeconds: effort.duration_seconds,
      id: effort.id,
      label: formatEffortDuration(effort.duration_seconds),
      value: effort.value,
    }));
}

export function getEffortHistoryForDuration<T extends ActivityEffortPresentationRow>(
  efforts: readonly T[],
  durationSeconds: number,
): T[] {
  return efforts
    .filter((effort) => effort.duration_seconds === durationSeconds)
    .sort(
      (left, right) => new Date(right.recorded_at).getTime() - new Date(left.recorded_at).getTime(),
    );
}

export function formatActivityEffortDisplayValue(
  effort: Pick<
    ActivityEffortPresentationRow,
    "activity_category" | "effort_type" | "unit" | "value"
  >,
): string {
  if (effort.effort_type === "speed" && effort.value > 0) {
    const distanceUnitMeters = effort.activity_category === "swim" ? 100 : 1_000;
    const paceSeconds = Math.round(
      paceSecondsFromSpeedMetersPerSecond({
        distanceUnitMeters,
        speedMetersPerSecond: effort.value,
      }) ?? 0,
    );
    const minutes = Math.floor(paceSeconds / 60);
    return `${minutes}:${String(paceSeconds % 60).padStart(2, "0")} /${distanceUnitMeters === 100 ? "100m" : "km"}`;
  }

  const unit = effort.effort_type === "power" ? "W" : "m/s";
  const decimals = effort.effort_type === "power" ? 0 : 2;
  return `${Number(effort.value.toFixed(decimals))} ${unit}`;
}

export function getActivityEffortCurveValue(
  activityCategory: ActivityEffortCategory,
  effortType: ActivityEffortType,
  value: number,
): number {
  if (effortType !== "speed") return value;
  return (
    paceSecondsFromSpeedMetersPerSecond({
      distanceUnitMeters: activityCategory === "swim" ? 100 : 1_000,
      speedMetersPerSecond: value,
    }) ?? value
  );
}
