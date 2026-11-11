import { z } from "zod";
import { PLAYBACK_EXECUTION, playbackExecutionSchema } from "./execution-evidence";
import { advanceVirtualClock } from "./virtual-clock";

export const PLAYBACK_METRICS = [
  "heartRate",
  "power",
  "cadence",
  "speed",
  "distance",
  "altitude",
  "temperature",
] as const;
export const PLAYBACK_SPEEDS = [0.5, 1, 2, 4] as const;
export const PLAYBACK_MAX_SAMPLE_AGE_MS = 5_000;
export const PLAYBACK_MAX_RECORDS = 200_000;
export const playbackMetricSchema = z.enum(PLAYBACK_METRICS);
export type PlaybackMetric = z.infer<typeof playbackMetricSchema>;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];
const timestampSchema = z
  .union([
    z.date().transform((value) => value.getTime()),
    z
      .string()
      .datetime({ offset: true })
      .transform((value) => Date.parse(value)),
    z.number(), // Numeric timestamps are epoch milliseconds, never guessed seconds/indexes.
  ])
  .pipe(z.number().finite().int().positive().max(8_640_000_000_000_000));
const inputSchema = z
  .object({
    timestamp: z.unknown(),
    metrics: z.record(z.string(), z.unknown()).optional(),
    position: z
      .object({ latitude: z.unknown(), longitude: z.unknown() })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();
export const playbackPositionSchema = z
  .object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  })
  .strict();
const metricObservationSchema = z.object({
  timestampMs: z.number(),
  value: z.number().finite().nullable(),
});
const positionObservationSchema = z.object({
  timestampMs: z.number(),
  value: playbackPositionSchema.nullable(),
});
export const playbackIndexSchema = z.object({
  execution: playbackExecutionSchema,
  startMs: z.number().nullable(),
  endMs: z.number().nullable(),
  durationMs: z.number().nonnegative(),
  metrics: z.record(playbackMetricSchema, z.array(metricObservationSchema)),
  positions: z.array(positionObservationSchema),
  timestampCount: z.number().int().nonnegative(),
  rejectedRecords: z.number().int().nonnegative(),
  duplicateTimestamps: z.number().int().nonnegative(),
});
export type PlaybackIndex = z.infer<typeof playbackIndexSchema>;
export type PlaybackPosition = z.infer<typeof playbackPositionSchema>;

export function playbackTimestampMs(value: unknown): number | null {
  // Epoch zero is also the accepted file parser's unavailable-time sentinel.
  const parsed = timestampSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Stable duplicate policy: last supplied field wins; absence never overwrites.
 * Invalid supplied fields create null barriers. Coordinates always stay a pair.
 * Input metrics use bpm, W, rpm, m/s and meters; no aliases or unit guessing.
 */
export function buildPlaybackIndex(input: readonly unknown[]): PlaybackIndex {
  if (input.length > PLAYBACK_MAX_RECORDS)
    throw new Error(
      "This stream is too large for local playback. Choose a smaller recorded segment.",
    );
  let rejectedRecords = 0;
  const records = input
    .flatMap((value, order) => {
      const parsed = inputSchema.safeParse(value);
      const timestampMs = parsed.success ? playbackTimestampMs(parsed.data.timestamp) : null;
      if (!parsed.success || timestampMs === null) {
        rejectedRecords++;
        return [];
      }
      return [{ ...parsed.data, timestampMs, order }];
    })
    .sort((left, right) => left.timestampMs - right.timestampMs || left.order - right.order);
  const metrics: PlaybackIndex["metrics"] = {
    heartRate: [],
    power: [],
    cadence: [],
    speed: [],
    distance: [],
    altitude: [],
    temperature: [],
  };
  const positions: PlaybackIndex["positions"] = [];
  let duplicateTimestamps = 0;
  let previousTime: number | undefined;
  for (const record of records) {
    if (record.timestampMs === previousTime) duplicateTimestamps++;
    previousTime = record.timestampMs;
    for (const metric of PLAYBACK_METRICS) {
      const raw = record.metrics?.[metric];
      if (raw === undefined) continue;
      const finite = typeof raw === "number" && Number.isFinite(raw);
      const valid =
        finite &&
        (metric === "heartRate"
          ? raw > 0
          : metric === "power" || metric === "altitude" || metric === "temperature" || raw >= 0);
      const observation = { timestampMs: record.timestampMs, value: valid ? raw : null };
      const series = metrics[metric];
      if (series.at(-1)?.timestampMs === record.timestampMs)
        series[series.length - 1] = observation;
      else series.push(observation);
    }
    if (record.position !== undefined) {
      const parsed = playbackPositionSchema.safeParse(record.position);
      const observation = {
        timestampMs: record.timestampMs,
        value: parsed.success ? parsed.data : null,
      };
      if (positions.at(-1)?.timestampMs === record.timestampMs)
        positions[positions.length - 1] = observation;
      else positions.push(observation);
    }
  }
  const startMs = records[0]?.timestampMs ?? null;
  const endMs = records.at(-1)?.timestampMs ?? null;
  return {
    execution: PLAYBACK_EXECUTION,
    startMs,
    endMs,
    durationMs: startMs === null || endMs === null ? 0 : endMs - startMs,
    metrics,
    positions,
    timestampCount: records.length - duplicateTimestamps,
    duplicateTimestamps,
    rejectedRecords,
  };
}

export function clampPlaybackElapsed(elapsedMs: number, durationMs: number): number {
  return Math.min(
    Math.max(0, Number.isFinite(durationMs) ? durationMs : 0),
    Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0),
  );
}
export function advancePlayback(
  elapsedMs: number,
  wallDeltaMs: number,
  speed: PlaybackSpeed,
  durationMs: number,
): number {
  if (!PLAYBACK_SPEEDS.includes(speed)) throw new RangeError("Unsupported playback speed");
  return advanceVirtualClock(elapsedMs, wallDeltaMs, speed, durationMs);
}

function observationAt<T>(
  series: readonly { timestampMs: number; value: T | null }[],
  timestampMs: number,
  maxAgeMs: number,
): { value: T; sampledAtMs: number; ageMs: number } | null {
  let low = 0;
  let high = series.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((series[middle]?.timestampMs ?? Infinity) <= timestampMs) low = middle + 1;
    else high = middle;
  }
  const candidate = series[low - 1];
  if (!candidate || candidate.value === null || timestampMs - candidate.timestampMs > maxAgeMs)
    return null;
  return {
    value: candidate.value,
    sampledAtMs: candidate.timestampMs,
    ageMs: timestampMs - candidate.timestampMs,
  };
}
export function playbackFrameAt(
  index: PlaybackIndex,
  elapsedMs: number,
  maxAgeMs = PLAYBACK_MAX_SAMPLE_AGE_MS,
) {
  if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0)
    throw new RangeError("Invalid playback sample age");
  const cursor = clampPlaybackElapsed(elapsedMs, index.durationMs);
  const timestampMs = index.startMs === null ? null : index.startMs + cursor;
  return {
    elapsedMs: cursor,
    timestampMs,
    metrics: PLAYBACK_METRICS.map((key) => ({
      key,
      sample:
        timestampMs === null ? null : observationAt(index.metrics[key], timestampMs, maxAgeMs),
    })),
    position: timestampMs === null ? null : observationAt(index.positions, timestampMs, maxAgeMs),
  };
}
