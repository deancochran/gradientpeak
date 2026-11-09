import { z } from "zod";
import { assertRealRecordingExecution, realRecordingExecutionSchema } from "./execution-evidence";
import type { RecordingMetricSample } from "./samples";

export const MAX_MEASURED_NOTIFICATIONS = 20_000;
export const MEASURED_SOURCE_FRESHNESS_MS = 5_000;
export class MeasuredRecordingLimitError extends Error {}
const timestamp = z.string().datetime({ offset: true });
const sequence = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const source = z
  .object({
    sourceId: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9:_-]+$/),
    sourceType: z.enum([
      "heart_rate_sensor",
      "chest_strap",
      "optical",
      "trainer_passthrough",
      "power_meter",
      "trainer_power",
      "cadence_sensor",
      "trainer_cadence",
      "speed_sensor",
      "trainer_speed",
    ]),
    provenance: z.literal("actual"),
    adapterId: z.literal("web-bluetooth"),
  })
  .strict();
const common = { source, recordedAt: timestamp, sequenceNumber: sequence };
/** A runtime-validated subset of recording/samples, not recording-metrics' aggregate input. */
export const measuredMetricSampleSchema = z.discriminatedUnion("metricFamily", [
  z
    .object({
      ...common,
      metricFamily: z.literal("heart_rate"),
      unit: z.literal("bpm"),
      value: z.number().finite().positive().max(65534),
    })
    .strict(),
  z
    .object({
      ...common,
      metricFamily: z.literal("power"),
      unit: z.literal("watts"),
      value: z.number().finite().min(-32768).max(32767),
    })
    .strict(),
  z
    .object({
      ...common,
      metricFamily: z.literal("cadence"),
      unit: z.literal("rpm"),
      value: z.number().finite().nonnegative().max(32767.5),
    })
    .strict(),
  z
    .object({
      ...common,
      metricFamily: z.literal("speed"),
      unit: z.literal("meters_per_second"),
      value: z.number().finite().nonnegative().max(200),
    })
    .strict(),
  z
    .object({
      ...common,
      metricFamily: z.literal("distance"),
      unit: z.literal("meters"),
      value: z.number().finite().nonnegative().max(16777214),
    })
    .strict(),
]) satisfies z.ZodType<RecordingMetricSample>;

export const measuredNotificationSchema = z
  .object({
    origin: z.literal("bluetooth_notification"),
    sourceId: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9:_-]+$/),
    recordedAt: timestamp,
    sequenceNumber: sequence,
    samples: z.array(measuredMetricSampleSchema).max(5),
    // Energy is a cumulative BLE counter, not one of Core's metric families.
    caloriesCounterKcal: z.number().finite().nonnegative().max(65534).optional(),
  })
  .strict()
  .superRefine((notification, context) => {
    const families = new Set<string>();
    if (!notification.samples.length && notification.caloriesCounterKcal === undefined) {
      context.addIssue({ code: "custom", message: "An observation needs measured values." });
    }
    for (const sample of notification.samples) {
      if (
        families.has(sample.metricFamily) ||
        sample.source.sourceId !== notification.sourceId ||
        sample.recordedAt !== notification.recordedAt ||
        sample.sequenceNumber !== notification.sequenceNumber
      ) {
        context.addIssue({
          code: "custom",
          message: "Sample identity must match its unique notification.",
        });
      }
      families.add(sample.metricFamily);
    }
  });

export const measuredRecordingJournalSchema = z
  .object({
    version: z.literal(1),
    execution: realRecordingExecutionSchema.optional(),
    provenance: z.literal("measured"),
    windows: z
      .array(z.object({ startedAt: timestamp, endedAt: timestamp.nullable() }).strict())
      .max(2000),
    entries: z
      .array(
        z
          .object({
            sequenceNumber: sequence,
            windowIndex: z.number().int().nonnegative(),
            notification: measuredNotificationSchema,
          })
          .strict(),
      )
      .max(MAX_MEASURED_NOTIFICATIONS),
  })
  .strict()
  .superRefine((journal, context) => {
    let lastTimestamp = -Infinity;
    let lastWindow = 0;
    const cursors = new Map<string, number>();
    journal.windows.forEach((window, index) => {
      const previous = journal.windows[index - 1];
      if (
        (window.endedAt && Date.parse(window.endedAt) < Date.parse(window.startedAt)) ||
        (previous &&
          (!previous.endedAt || Date.parse(previous.endedAt) > Date.parse(window.startedAt)))
      ) {
        context.addIssue({
          code: "custom",
          message: "Measured capture windows must be ordered and non-overlapping.",
        });
      }
    });
    journal.entries.forEach((entry, index) => {
      const window = journal.windows[entry.windowIndex];
      const notification = entry.notification;
      const time = Date.parse(notification.recordedAt);
      if (
        entry.sequenceNumber !== index + 1 ||
        entry.windowIndex < lastWindow ||
        !window ||
        time < Date.parse(window.startedAt) ||
        (window.endedAt && time > Date.parse(window.endedAt)) ||
        time < lastTimestamp ||
        notification.sequenceNumber <= (cursors.get(notification.sourceId) ?? 0)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Measured evidence must be unique, ordered, and inside an active capture window.",
        });
      }
      cursors.set(notification.sourceId, notification.sequenceNumber);
      lastTimestamp = time;
      lastWindow = entry.windowIndex;
    });
  });

export type MeasuredMetricSample = z.infer<typeof measuredMetricSampleSchema>;
export type MeasuredNotification = z.infer<typeof measuredNotificationSchema>;
export type MeasuredRecordingJournal = z.infer<typeof measuredRecordingJournalSchema>;
export const measuredJournalHeaderSchema = z
  .object({
    version: measuredRecordingJournalSchema.shape.version,
    execution: measuredRecordingJournalSchema.shape.execution,
    provenance: measuredRecordingJournalSchema.shape.provenance,
    windows: measuredRecordingJournalSchema.shape.windows,
  })
  .strict();
export const measuredJournalEntrySchema = measuredRecordingJournalSchema.shape.entries.element;
export const MEASURED_BATCH_SIZE = 128;
export const measuredJournalBatchSchema = z
  .object({
    header: measuredJournalHeaderSchema,
    expectedCursor: z.number().int().nonnegative().max(MAX_MEASURED_NOTIFICATIONS),
    entries: z.array(measuredJournalEntrySchema).max(MEASURED_BATCH_SIZE),
  })
  .strict();
export type MeasuredJournalBatch = z.infer<typeof measuredJournalBatchSchema>;

/** Single-writer live collector. Re-index only when recovery supplies a new array;
 * admission validates one notification and appends in O(1), without cloning history.
 * Consumers capture a length alongside the array before awaiting any I/O.
 */
export class MeasuredNotificationAppender {
  private entries: MeasuredRecordingJournal["entries"] | null = null;
  private readonly cursors = new Map<string, number>();
  append(journal: MeasuredRecordingJournal, untrusted: unknown): boolean {
    assertRealRecordingExecution(journal);
    if (this.entries !== journal.entries) {
      this.entries = journal.entries;
      this.cursors.clear();
      for (const entry of journal.entries)
        this.cursors.set(entry.notification.sourceId, entry.notification.sequenceNumber);
    }
    const notification = measuredNotificationSchema.parse(untrusted);
    const window = journal.windows.at(-1);
    if (
      !window ||
      window.endedAt !== null ||
      Date.parse(notification.recordedAt) < Date.parse(window.startedAt)
    )
      return false;
    if (notification.sequenceNumber <= (this.cursors.get(notification.sourceId) ?? 0)) return false;
    if (journal.entries.length >= MAX_MEASURED_NOTIFICATIONS)
      throw new MeasuredRecordingLimitError(
        "The measured recording sample limit was reached. Restore local saving, then finish this recording.",
      );
    const last = journal.entries.at(-1);
    if (last && Date.parse(notification.recordedAt) < Date.parse(last.notification.recordedAt))
      throw new Error("The recording clock moved backwards.");
    journal.entries.push({
      sequenceNumber: journal.entries.length + 1,
      windowIndex: journal.windows.length - 1,
      notification,
    });
    this.cursors.set(notification.sourceId, notification.sequenceNumber);
    return true;
  }
}

export function emptyMeasuredJournal(): MeasuredRecordingJournal {
  return { version: 1, provenance: "measured", windows: [], entries: [] };
}
export function openMeasuredWindow(
  journal: MeasuredRecordingJournal,
  recordedAt: string,
): MeasuredRecordingJournal {
  if (journal.windows.at(-1)?.endedAt === null) return journal;
  if (journal.windows.length >= 2000)
    throw new MeasuredRecordingLimitError(
      "The measured recording window limit was reached. Restore local saving, then finish this recording.",
    );
  return { ...journal, windows: [...journal.windows, { startedAt: recordedAt, endedAt: null }] };
}
export function closeMeasuredWindow(
  journal: MeasuredRecordingJournal,
  recordedAt: string,
): MeasuredRecordingJournal {
  const last = journal.windows.at(-1);
  if (!last || last.endedAt !== null) return journal;
  return {
    ...journal,
    windows: [...journal.windows.slice(0, -1), { ...last, endedAt: recordedAt }],
  };
}
/** Immutable convenience for small/offline transformations. Live capture uses
 * MeasuredNotificationAppender so it never clones the growing entries array. */
export function appendMeasuredNotification(
  journal: MeasuredRecordingJournal,
  untrusted: unknown,
): MeasuredRecordingJournal {
  assertRealRecordingExecution(journal);
  const notification = measuredNotificationSchema.parse(untrusted);
  const window = journal.windows.at(-1);
  if (
    !window ||
    window.endedAt !== null ||
    Date.parse(notification.recordedAt) < Date.parse(window.startedAt)
  )
    return journal;
  let previous: MeasuredRecordingJournal["entries"][number] | undefined;
  for (let index = journal.entries.length - 1; index >= 0; index--) {
    const entry = journal.entries[index];
    if (entry?.notification.sourceId === notification.sourceId) {
      previous = entry;
      break;
    }
  }
  if (previous && notification.sequenceNumber <= previous.notification.sequenceNumber)
    return journal;
  if (journal.entries.length >= MAX_MEASURED_NOTIFICATIONS)
    throw new MeasuredRecordingLimitError(
      "The measured recording sample limit was reached. Restore local saving, then finish this recording before starting another.",
    );
  const last = journal.entries.at(-1);
  if (last && Date.parse(notification.recordedAt) < Date.parse(last.notification.recordedAt))
    throw new Error("The recording clock moved backwards.");
  return {
    ...journal,
    entries: [
      ...journal.entries,
      {
        sequenceNumber: journal.entries.length + 1,
        windowIndex: journal.windows.length - 1,
        notification,
      },
    ],
  };
}

/** No interpolation or carry-forward. Counter baselines reset across capture/source/gap boundaries. */
export function measuredRecordingPoints(journal: MeasuredRecordingJournal) {
  let distanceMeters: number | null = null;
  let calories: number | null = null;
  const counters = new Map<string, { value: number; generation: number }>();
  const sources = new Map<string, { at: number; window: number; generation: number }>();
  const points = journal.entries.map(({ notification, windowIndex }) => {
    const at = Date.parse(notification.recordedAt);
    const previousSource = sources.get(notification.sourceId);
    const continuous =
      previousSource &&
      previousSource.window === windowIndex &&
      at - previousSource.at <= MEASURED_SOURCE_FRESHNESS_MS;
    const generation = (previousSource?.generation ?? 0) + (continuous ? 0 : 1);
    sources.set(notification.sourceId, { at, window: windowIndex, generation });
    const values: Partial<Record<MeasuredMetricSample["metricFamily"], number>> = {};
    const increment = (metric: string, value: number): number | null => {
      const key = `${notification.sourceId}:${metric}`;
      const previous = counters.get(key);
      counters.set(key, { value, generation });
      return previous && previous.generation === generation && value >= previous.value
        ? value - previous.value
        : null;
    };
    for (const sample of notification.samples) {
      if (sample.metricFamily === "distance") {
        const delta = increment("distance", sample.value);
        if (delta !== null) {
          distanceMeters = (distanceMeters ?? 0) + delta;
          values.distance = distanceMeters;
        }
      } else values[sample.metricFamily] = sample.value;
    }
    if (notification.caloriesCounterKcal !== undefined) {
      const delta = increment("calories", notification.caloriesCounterKcal);
      if (delta !== null) calories = (calories ?? 0) + delta;
    }
    return {
      recordedAt: notification.recordedAt,
      sourceId: notification.sourceId,
      sequenceNumber: notification.sequenceNumber,
      windowIndex,
      values,
      rawDistanceMeters: notification.samples.find((sample) => sample.metricFamily === "distance")
        ?.value,
      caloriesCounterKcal: notification.caloriesCounterKcal,
    };
  });
  return { points, distanceMeters, calories };
}

export function measuredJournalWithinBounds(
  journal: MeasuredRecordingJournal,
  startedAt: string,
  endedAt: string,
  requireClosed: boolean,
): boolean {
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  return (
    journal.windows.every(
      (window) =>
        Date.parse(window.startedAt) >= start &&
        Date.parse(window.startedAt) <= end &&
        (window.endedAt ? Date.parse(window.endedAt) <= end : !requireClosed),
    ) && journal.entries.every((entry) => Date.parse(entry.notification.recordedAt) <= end)
  );
}
