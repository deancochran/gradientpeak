import {
  activityEffortDefinitions,
  formatEffortDuration,
  getActivityEffortDefinitionId,
} from "@repo/core/athlete-inputs";

export type ActivityEffortCurveRow = {
  id: string;
  activity_category: string;
  duration_seconds: number;
  effort_type: string;
  recorded_at: string | Date;
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

export function buildBestActivityEffortCurve(
  records: ActivityEffortCurveRow[],
): ActivityEffortCurvePoint[] {
  const bestByDuration = new Map<number, ActivityEffortCurveRow>();
  for (const record of records) {
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
      title: `${definition.label} curve`,
      unit: definition.unit,
      records: sorted,
      points: buildBestActivityEffortCurve(sorted),
    } satisfies ActivityEffortCurve;
  });
}

export function getActivityEffortCurveBest(records: ActivityEffortCurveRow[]) {
  return records.reduce<ActivityEffortCurveRow | null>(
    (best, record) => (!best || record.value > best.value ? record : best),
    null,
  );
}
