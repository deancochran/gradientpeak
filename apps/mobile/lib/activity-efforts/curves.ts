import {
  activityEffortDefinitions,
  formatActivityEffortValue,
  formatEffortDuration,
  getActivityEffortDefinitionId,
  getActivityEffortObservationStatus as getCoreActivityEffortObservationStatus,
  paceSecondsFromSpeedMetersPerSecond,
} from "@repo/core/athlete-inputs";

export function formatActivityEffortPresentationValue(record: ActivityEffortCurveRow) {
  if (record.effort_type === "speed" && Number.isFinite(record.value) && record.value > 0) {
    const distanceUnitMeters = record.activity_category === "swim" ? 100 : 1_000;
    const seconds = Math.round(
      paceSecondsFromSpeedMetersPerSecond({
        distanceUnitMeters,
        speedMetersPerSecond: record.value,
      }) ?? 0,
    );
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}/${distanceUnitMeters === 100 ? "100m" : "km"}`;
  }
  return formatActivityEffortValue(record);
}

export type ActivityEffortCurveRow = {
  id: string;
  activity_id: string | null;
  activity_category: string;
  duration_seconds: number;
  effort_type: string;
  method?: string | null;
  provenance?: unknown;
  recorded_at: string | Date;
  source?: string | null;
  unit: string;
  value: number;
};

export type ActivityEffortCurvePoint = {
  effortId: string;
  label: string;
  duration: number;
  value: number;
};

export type ActivityEffortCurve = {
  id: string;
  title: string;
  unit: string;
  records: ActivityEffortCurveRow[];
  points: ActivityEffortCurvePoint[];
};

export function getActivityEffortObservationStatus(
  record: ActivityEffortCurveRow,
): ReturnType<typeof getCoreActivityEffortObservationStatus> {
  const definitionId = getActivityEffortDefinitionId(record);
  const definition = activityEffortDefinitions.find((candidate) => candidate.id === definitionId);
  if (!definition) return "invalid";

  return getCoreActivityEffortObservationStatus({
    activityId: record.activity_id,
    activityCategory: definition.activityCategory,
    effortType: definition.effortType,
    durationSeconds: record.duration_seconds,
    value: record.value,
    unit: record.unit,
    source: record.source,
    method: record.method,
    provenance: record.provenance,
  });
}

export function getObservedActivityEffortRecords(records: ActivityEffortCurveRow[]) {
  return records.filter((record) => getActivityEffortObservationStatus(record) === "observed");
}

export function buildBestActivityEffortCurve(
  records: ActivityEffortCurveRow[],
): ActivityEffortCurvePoint[] {
  const bestByDuration = new Map<number, ActivityEffortCurveRow>();
  for (const record of getObservedActivityEffortRecords(records)) {
    const current = bestByDuration.get(record.duration_seconds);
    if (!current || record.value > current.value)
      bestByDuration.set(record.duration_seconds, record);
  }

  return [...bestByDuration.values()]
    .sort((left, right) => left.duration_seconds - right.duration_seconds)
    .map((record) => ({
      effortId: record.id,
      label: formatEffortDuration(record.duration_seconds),
      duration: record.duration_seconds,
      value: Number(record.value),
    }));
}

export function buildActivityEffortCurves(
  efforts: ActivityEffortCurveRow[],
): ActivityEffortCurve[] {
  const recordsByDefinition = new Map<string, ActivityEffortCurveRow[]>();
  for (const effort of efforts) {
    const definitionId = getActivityEffortDefinitionId(effort);
    if (!definitionId) continue;
    recordsByDefinition.set(definitionId, [
      ...(recordsByDefinition.get(definitionId) ?? []),
      effort,
    ]);
  }

  return activityEffortDefinitions.map((definition) => {
    const records = recordsByDefinition.get(definition.id) ?? [];
    const sorted = [...records].sort(
      (left, right) => new Date(right.recorded_at).getTime() - new Date(left.recorded_at).getTime(),
    );
    return {
      id: definition.id,
      title: `${definition.effortType === "speed" ? `${definition.activityCategory === "swim" ? "Swim" : "Run"} pace` : definition.label} curve`,
      unit: definition.unit,
      records: sorted,
      points: buildBestActivityEffortCurve(sorted),
    } satisfies ActivityEffortCurve;
  });
}

export function getActivityEffortCurveBest(records: ActivityEffortCurveRow[]) {
  return getObservedActivityEffortRecords(records).reduce<ActivityEffortCurveRow | null>(
    (best, record) => (!best || record.value > best.value ? record : best),
    null,
  );
}
