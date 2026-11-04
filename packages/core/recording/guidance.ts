import type { RecordingPlanExecutionSnapshot } from "../schemas/recording-session";
import { recordingSessionOverrideSchema } from "../schemas/recording-session";
import {
  type RecordingGuidanceTimeline,
  recordingGuidanceTimelineSchema,
} from "./portable-timer-draft";

export { type RecordingGuidanceTimeline, recordingGuidanceTimelineSchema };
export type RecordingGuidanceCommand =
  | { type: "plan"; plan: RecordingPlanExecutionSnapshot | null }
  | { type: "route"; routeId: string | null }
  | { type: "intensity"; scale: number };

export function currentRecordingGuidance(timeline: RecordingGuidanceTimeline) {
  const current = timeline.revisions.at(-1);
  if (!current) throw new Error("Guidance requires its initial revision.");
  return current;
}

/** Same session-scale override as the shared recording resolver, with a bounded UI contract. */
export function validateRecordingIntensityScale(value: number, recordedAt: string) {
  recordingSessionOverrideSchema.parse({
    type: "intensity_scale",
    value,
    scope: "until_changed",
    recordedAt,
  });
  if (!Number.isFinite(value) || value < 0.5 || value > 1.5) {
    throw new Error("Session intensity must be between 50% and 150%.");
  }
  return value;
}

/** Primary association is the original plan, otherwise the first attached plan. */
export function primaryRecordingGuidancePlan(timeline: RecordingGuidanceTimeline) {
  return timeline.revisions.find((revision) => revision.plan !== null)?.plan ?? null;
}
export function primaryRecordingGuidanceRoute(timeline: RecordingGuidanceTimeline) {
  return timeline.revisions.find((revision) => revision.routeId !== null)?.routeId ?? null;
}

export function recordingGuidanceWasModified(timeline: RecordingGuidanceTimeline | undefined) {
  // Route context does not change the prescribed work. Plan replacement,
  // detachment, or intensity scaling does, so scheduled completion is partial.
  return Boolean(
    timeline?.revisions.some(
      (revision) => revision.kind === "plan" || revision.kind === "intensity",
    ),
  );
}

/** Reads only our bounded JSON extension, never interprets XML entities or external resources. */
export function recordingGuidanceFromTcx(text: string): RecordingGuidanceTimeline | undefined {
  const encoded = /<GradientPeakExecution\b[^>]*>([\s\S]*?)<\/GradientPeakExecution>/.exec(
    text,
  )?.[1];
  if (!encoded) return undefined;
  if (encoded.length > 8_000_000) throw new Error("Recording metadata exceeds its bound.");
  const decoded = encoded.replace(/&(quot|apos|lt|gt|amp);/g, (_match, entity: string) => {
    return { quot: '"', apos: "'", lt: "<", gt: ">", amp: "&" }[entity] ?? "";
  });
  const data: unknown = JSON.parse(decoded);
  if (!data || typeof data !== "object" || !("guidance" in data)) return undefined;
  return recordingGuidanceTimelineSchema.parse(data.guidance);
}
