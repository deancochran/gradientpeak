import {
  MAX_MEASURED_NOTIFICATIONS,
  type MeasuredJournalBatch,
  measuredJournalBatchSchema,
  measuredJournalHeaderSchema,
} from "@repo/core/recording/measured-journal";
import { z } from "zod";

export const storedMeasuredCursorSchema = z
  .object({
    header: measuredJournalHeaderSchema,
    cursor: z.number().int().nonnegative().max(MAX_MEASURED_NOTIFICATIONS),
    lastRecordedAt: z.string().datetime({ offset: true }).nullable(),
    lastWindowIndex: z.number().int().nonnegative(),
    sources: z
      .array(
        z.tuple([
          z.string().min(1).max(100),
          z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
        ]),
      )
      .max(512),
  })
  .strict();
export type StoredMeasuredCursor = z.infer<typeof storedMeasuredCursorSchema>;

/** Validates only bounded metadata and the new batch, never the committed history. */
export function nextMeasuredCursor(
  previous: StoredMeasuredCursor | null,
  input: MeasuredJournalBatch,
  startedAt: string,
  updatedAt: string,
  requireClosed = false,
): StoredMeasuredCursor {
  const batch = measuredJournalBatchSchema.parse(input);
  if ((previous?.cursor ?? 0) !== batch.expectedCursor)
    throw new Error("Measured cursor conflict; reload the committed recording before retrying.");
  if (previous?.lastRecordedAt && Date.parse(previous.lastRecordedAt) > Date.parse(updatedAt))
    throw new Error("A measured checkpoint cannot precede its committed samples.");
  const windows = batch.header.windows;
  windows.forEach((window, index) => {
    const before = windows[index - 1];
    const stored = previous?.header.windows[index];
    if (
      (requireClosed && window.endedAt === null) ||
      Date.parse(window.startedAt) < Date.parse(startedAt) ||
      Date.parse(window.startedAt) > Date.parse(updatedAt) ||
      (window.endedAt &&
        (Date.parse(window.endedAt) < Date.parse(window.startedAt) ||
          Date.parse(window.endedAt) > Date.parse(updatedAt))) ||
      (before && (!before.endedAt || Date.parse(before.endedAt) > Date.parse(window.startedAt))) ||
      (stored &&
        (stored.startedAt !== window.startedAt ||
          (stored.endedAt !== null && stored.endedAt !== window.endedAt)))
    )
      throw new Error("Invalid measured capture window transition.");
  });
  if (windows.length < (previous?.header.windows.length ?? 0))
    throw new Error("Measured capture windows cannot be removed.");
  let lastRecordedAt = previous?.lastRecordedAt ?? null;
  let lastWindowIndex = previous?.lastWindowIndex ?? 0;
  const sources = new Map(previous?.sources ?? []);
  for (const [offset, entry] of batch.entries.entries()) {
    const notification = entry.notification;
    const window = windows[entry.windowIndex];
    const at = Date.parse(notification.recordedAt);
    if (
      entry.sequenceNumber !== batch.expectedCursor + offset + 1 ||
      entry.windowIndex < lastWindowIndex ||
      !window ||
      at < Date.parse(window.startedAt) ||
      at > Date.parse(updatedAt) ||
      (window.endedAt && at > Date.parse(window.endedAt)) ||
      (lastRecordedAt && at < Date.parse(lastRecordedAt)) ||
      notification.sequenceNumber <= (sources.get(notification.sourceId) ?? 0)
    )
      throw new Error("Invalid measured append sequence or timing.");
    sources.set(notification.sourceId, notification.sequenceNumber);
    lastRecordedAt = notification.recordedAt;
    lastWindowIndex = entry.windowIndex;
  }
  return storedMeasuredCursorSchema.parse({
    header: batch.header,
    cursor: batch.expectedCursor + batch.entries.length,
    lastRecordedAt,
    lastWindowIndex,
    sources: [...sources],
  });
}
