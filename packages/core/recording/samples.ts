import type {
  MetricFamily,
  MetricProvenance,
  MetricSourceType,
} from "../schemas/recording-session";

export type RecordingMetricUnit =
  | "bpm"
  | "watts"
  | "rpm"
  | "meters_per_second"
  | "meters"
  | "meters_per_second_squared"
  | "percent"
  | "kcal"
  | "count"
  | "unknown";

export interface RecordingSampleSource {
  sourceId: string | null;
  sourceType: MetricSourceType;
  provenance: MetricProvenance;
  adapterId?: string;
  deviceId?: string;
}

export interface RecordingMetricSample {
  metricFamily: MetricFamily;
  value: number;
  unit: RecordingMetricUnit;
  source: RecordingSampleSource;
  recordedAt: string;
  sequenceNumber: number;
}

export function createMetricSample(
  params: Pick<RecordingMetricSample, "metricFamily" | "value" | "unit" | "source" | "recordedAt">,
  sequenceNumber: number,
): RecordingMetricSample {
  return { ...params, sequenceNumber };
}
