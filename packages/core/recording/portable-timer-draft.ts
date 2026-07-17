import { z } from "zod";

import { recordingSessionSnapshotSchema } from "../schemas/recording-session";

export const PORTABLE_TIMER_RECORDING_DRAFT_SCHEMA_VERSION = 1;

const portableTimerRecordingTimingSchema = z
  .object({
    startedAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    elapsedMs: z.number().int().nonnegative(),
    movingMs: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((timing, context) => {
    if (Date.parse(timing.updatedAt) < Date.parse(timing.startedAt)) {
      context.addIssue({
        code: "custom",
        path: ["updatedAt"],
        message: "Updated timestamp must not precede the start timestamp.",
      });
    }

    if (timing.movingMs > timing.elapsedMs) {
      context.addIssue({
        code: "custom",
        path: ["movingMs"],
        message: "Moving milliseconds must not exceed elapsed milliseconds.",
      });
    }
  });

export const portableTimerRecordingDraftSchema = z
  .object({
    schemaVersion: z.literal(PORTABLE_TIMER_RECORDING_DRAFT_SCHEMA_VERSION),
    ownerId: z.string().min(1),
    sessionSnapshot: recordingSessionSnapshotSchema,
    lifecycle: z.enum(["recording", "paused"]),
    timing: portableTimerRecordingTimingSchema,
    revision: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((draft, context) => {
    const timestampElapsedMs =
      Date.parse(draft.timing.updatedAt) - Date.parse(draft.timing.startedAt);
    if (timestampElapsedMs !== draft.timing.elapsedMs) {
      context.addIssue({
        code: "custom",
        path: ["timing", "elapsedMs"],
        message: "Elapsed milliseconds must match the portable timer timestamps.",
      });
    }

    if (draft.revision !== draft.sessionSnapshot.identity.revision) {
      context.addIssue({
        code: "custom",
        path: ["revision"],
        message: "Draft revision must match the session snapshot revision.",
      });
    }
  });

export type PortableTimerRecordingDraft = z.infer<typeof portableTimerRecordingDraftSchema>;
