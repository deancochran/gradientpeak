import { z } from "zod";

export const activityFileIngestionStatusSchema = z.enum([
  "pending_upload",
  "uploaded",
  "processing",
  "ready",
  "failed",
]);

export type ActivityFileIngestionStatus = z.infer<typeof activityFileIngestionStatusSchema>;

export const activityFileIngestionSourceSchema = z.enum([
  "mobile_recording",
  "manual_import",
  "provider_sync",
]);

export type ActivityFileIngestionSource = z.infer<typeof activityFileIngestionSourceSchema>;

const allowedActivityFileIngestionStatusTransitions: Record<
  ActivityFileIngestionStatus,
  readonly ActivityFileIngestionStatus[]
> = {
  pending_upload: ["pending_upload", "uploaded", "failed"],
  uploaded: ["uploaded", "processing", "failed"],
  processing: ["processing", "ready", "failed"],
  ready: ["ready"],
  failed: ["failed", "pending_upload", "uploaded", "processing"],
};

export function canTransitionActivityFileIngestionStatus(
  from: ActivityFileIngestionStatus,
  to: ActivityFileIngestionStatus,
): boolean {
  return allowedActivityFileIngestionStatusTransitions[from].includes(to);
}
