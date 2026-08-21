import { z } from "zod";

import { recordingSessionSnapshotSchema } from "../schemas/recording-session";

export const PORTABLE_TIMER_RECORDING_DRAFT_SCHEMA_VERSION = 1;

/**
 * Web recording has no independent personalization authority. Until Session
 * Flow owns an explicit handoff contract, portable drafts and exports must lock
 * the authored target representation.
 */
export const portableWebRecordingSessionSnapshotSchema = recordingSessionSnapshotSchema.superRefine(
  (snapshot, context) => {
    if (snapshot.planExecution?.personalizationEnabled) {
      context.addIssue({
        code: "custom",
        path: ["planExecution", "personalizationEnabled"],
        message: "Portable web recordings must retain authored plan targets",
      });
    }
  },
);

const portableTimerRecordingTimingSchema = z
  .object({
    startedAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    elapsedMs: z.number().int().nonnegative(),
    movingMs: z.number().int().nonnegative(),
    excludedElapsedMs: z.number().int().nonnegative().optional(),
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

export const portableWebRecordingLapSchema = z
  .object({
    lapNumber: z.number().int().positive(),
    timestamp: z.string().datetime({ offset: true }),
    elapsedMs: z.number().int().nonnegative(),
    movingMs: z.number().int().nonnegative(),
    occurrenceId: z.string().min(1).nullable(),
    occurrenceIndex: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const portableWebPlanExecutionStateSchema = z
  .object({
    currentOccurrenceIndex: z.number().int().nonnegative().nullable(),
    occurrenceStartedMovingMs: z.number().int().nonnegative(),
    completedOccurrenceIds: z.array(z.string().min(1)).max(2_000),
    skippedOccurrenceIds: z.array(z.string().min(1)).max(2_000),
    transitions: z
      .array(
        z
          .object({
            type: z.enum(["auto", "complete", "skip", "previous"]),
            timestamp: z.string().datetime({ offset: true }),
            elapsedMs: z.number().int().nonnegative(),
            movingMs: z.number().int().nonnegative(),
            fromOccurrenceId: z.string().min(1).nullable(),
            toOccurrenceId: z.string().min(1).nullable(),
          })
          .strict(),
      )
      .max(5_000),
    laps: z.array(portableWebRecordingLapSchema).max(1_000),
    checkpoints: z
      .array(
        z
          .object({
            timestamp: z.string().datetime({ offset: true }),
            currentOccurrenceIndex: z.number().int().nonnegative().nullable(),
            elapsedMs: z.number().int().nonnegative(),
            movingMs: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(7_000),
  })
  .strict()
  .superRefine((execution, context) => {
    execution.laps.forEach((lap, index) => {
      if (lap.lapNumber !== index + 1 || lap.movingMs > lap.elapsedMs) {
        context.addIssue({
          code: "custom",
          path: ["laps", index],
          message: "Laps must be contiguous and moving time cannot exceed elapsed time.",
        });
      }
    });
  });

export const portableTimerRecordingDraftSchema = z
  .object({
    schemaVersion: z.literal(PORTABLE_TIMER_RECORDING_DRAFT_SCHEMA_VERSION),
    ownerId: z.string().min(1),
    sessionSnapshot: portableWebRecordingSessionSnapshotSchema,
    lifecycle: z.enum(["recording", "paused"]),
    timing: portableTimerRecordingTimingSchema,
    planExecution: portableWebPlanExecutionStateSchema.optional(),
    revision: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((draft, context) => {
    const timestampElapsedMs =
      Date.parse(draft.timing.updatedAt) -
      Date.parse(draft.timing.startedAt) -
      (draft.timing.excludedElapsedMs ?? 0);
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
export type PortableWebPlanExecutionState = z.infer<typeof portableWebPlanExecutionStateSchema>;
export type PortableWebRecordingLap = z.infer<typeof portableWebRecordingLapSchema>;
