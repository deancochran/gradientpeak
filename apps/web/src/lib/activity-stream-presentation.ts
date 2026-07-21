type UnknownRecord = Record<string, unknown>;

export type WebActivityStreamRecord = {
  timestamp?: Date | string;
  distance?: number;
  heartRate?: number;
  power?: number;
  cadence?: number;
  speed?: number;
  altitude?: number;
};

export type ActivityStreamSeries = {
  key: "heartRate" | "power" | "speed" | "altitude";
  label: string;
  unit: string;
  values: Array<{ x: number; y: number }>;
};

export type ActivityLapDisplay = {
  index: number;
  elapsedSeconds: number | null;
  distanceMeters: number | null;
  averageHeartRate: number | null;
  averagePower: number | null;
};

const SERIES = [
  { key: "heartRate", label: "Heart rate", unit: "bpm" },
  { key: "power", label: "Power", unit: "W" },
  { key: "speed", label: "Speed", unit: "m/s" },
  { key: "altitude", label: "Elevation", unit: "m" },
] as const;

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function field(record: UnknownRecord, ...names: string[]): number | null {
  for (const name of names) {
    const value = finiteNumber(record[name]);
    if (value !== null) return value;
  }
  return null;
}

export function buildActivityStreamSeries(
  records: readonly WebActivityStreamRecord[] | null | undefined,
): ActivityStreamSeries[] {
  if (!records?.length) return [];

  return SERIES.flatMap(({ key, label, unit }) => {
    const values = records.flatMap((record, index) => {
      const value = finiteNumber(record[key]);
      if (value === null) return [];
      const timestamp = record.timestamp ? new Date(record.timestamp).getTime() : Number.NaN;
      return [{ x: Number.isFinite(timestamp) ? timestamp : index, y: value }];
    });
    return values.length > 1 ? [{ key, label, unit, values }] : [];
  });
}

export function buildChartPolyline(values: readonly { x: number; y: number }[]): string {
  if (values.length < 2) return "";
  const minX = Math.min(...values.map((point) => point.x));
  const maxX = Math.max(...values.map((point) => point.x));
  const minY = Math.min(...values.map((point) => point.y));
  const maxY = Math.max(...values.map((point) => point.y));
  const xRange = Math.max(maxX - minX, 1);
  const yRange = Math.max(maxY - minY, 1);
  return values
    .map((point) => {
      const x = ((point.x - minX) / xRange) * 100;
      const y = 100 - ((point.y - minY) / yRange) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function normalizeWebActivityLaps(laps: readonly unknown[] | null | undefined) {
  return (laps ?? []).flatMap((lap, position): ActivityLapDisplay[] => {
    if (!lap || typeof lap !== "object") return [];
    const row = lap as UnknownRecord;
    return [
      {
        index: field(row, "messageIndex", "message_index") ?? position,
        elapsedSeconds: field(row, "totalElapsedTime", "total_elapsed_time"),
        distanceMeters: field(row, "totalDistance", "total_distance"),
        averageHeartRate: field(row, "avgHeartRate", "averageHeartRate", "avg_heart_rate"),
        averagePower: field(row, "avgPower", "averagePower", "avg_power"),
      },
    ];
  });
}

export function summarizeSwimDetails(input: {
  summary?: UnknownRecord | null;
  lengths?: readonly unknown[] | null;
}) {
  const summary = input.summary ?? {};
  const activeLengths = (input.lengths ?? []).filter((length) => {
    if (!length || typeof length !== "object") return false;
    const type = (length as UnknownRecord).lengthType ?? (length as UnknownRecord).length_type;
    return type === 1 || type === "active";
  }).length;
  return {
    poolLength: field(summary, "poolLength", "pool_length"),
    poolLengthUnit: typeof summary.poolLengthUnit === "string" ? summary.poolLengthUnit : "meters",
    totalStrokes: field(summary, "totalStrokes", "total_strokes"),
    averageStrokeDistance: field(summary, "avgStrokeDistance", "avg_stroke_distance"),
    lengths: input.lengths?.length ?? 0,
    activeLengths,
  };
}
