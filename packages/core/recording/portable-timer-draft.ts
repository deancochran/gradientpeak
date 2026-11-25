import { z } from "zod";
import { compileActivityPlan } from "../activity-plan/compile";
import {
  recordingPlanExecutionSnapshotSchema,
  recordingSessionSnapshotSchema,
} from "../schemas/recording-session";
import { realRecordingExecutionSchema } from "./execution-evidence";
import { measuredJournalWithinBounds, measuredRecordingJournalSchema } from "./measured-journal";

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

/** Append-only session guidance. It never replaces the immutable session snapshot. */
export const recordingGuidanceTimelineSchema = z
  .object({
    version: z.literal(1),
    revisions: z
      .array(
        z
          .object({
            revision: z.number().int().nonnegative(),
            kind: z.enum(["initial", "plan", "route", "intensity"]),
            timestamp: z.string().datetime({ offset: true }),
            elapsedMs: z.number().int().nonnegative(),
            activeMs: z.number().int().nonnegative(),
            plan: recordingPlanExecutionSnapshotSchema.nullable(),
            routeId: z.string().uuid().nullable(),
            intensityScale: z.number().finite().min(0.5).max(1.5),
            /** Present on a plan change only: closes the prior epoch without losing visits. */
            closedExecution: portableWebPlanExecutionStateSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(64),
  })
  .strict()
  .superRefine((timeline, context) => {
    timeline.revisions.forEach((revision, index) => {
      const previous = timeline.revisions[index - 1];
      if (
        revision.revision !== index ||
        revision.activeMs > revision.elapsedMs ||
        revision.elapsedMs >
          Date.parse(revision.timestamp) -
            Date.parse(timeline.revisions[0]?.timestamp ?? revision.timestamp) ||
        (index === 0 &&
          (revision.kind !== "initial" || revision.elapsedMs !== 0 || revision.activeMs !== 0)) ||
        (index > 0 && revision.kind === "initial") ||
        (previous &&
          (revision.elapsedMs < previous.elapsedMs ||
            revision.activeMs < previous.activeMs ||
            Date.parse(revision.timestamp) < Date.parse(previous.timestamp))) ||
        (revision.kind !== "plan" && revision.closedExecution !== undefined)
      ) {
        context.addIssue({
          code: "custom",
          path: ["revisions", index],
          message: "Guidance revisions must be contiguous, chronological session evidence.",
        });
      }
      if (
        previous &&
        revision.kind !== "plan" &&
        JSON.stringify(revision.plan) !== JSON.stringify(previous.plan)
      ) {
        context.addIssue({
          code: "custom",
          path: ["revisions", index, "plan"],
          message: "Only a plan transition may change the prescription.",
        });
      }
      if (
        (previous && revision.kind !== "route" && revision.routeId !== previous.routeId) ||
        (revision.kind === "plan" &&
          (!revision.closedExecution ||
            revision.plan?.plannedSession ||
            revision.plan?.scheduledEventId))
      ) {
        context.addIssue({
          code: "custom",
          path: ["revisions", index],
          message:
            "Guidance changes must retain closed execution and their original scheduled provenance.",
        });
      }
      if (revision.kind === "plan" && previous && revision.closedExecution) {
        const execution = revision.closedExecution;
        const previousPlan = previous.plan;
        const occurrenceIds = new Set(
          previousPlan
            ? compileActivityPlan(previousPlan.structure).occurrences.map(
                (occurrence) => occurrence.occurrenceId,
              )
            : [],
        );
        const ids = [
          ...execution.completedOccurrenceIds,
          ...execution.skippedOccurrenceIds,
          ...execution.transitions.flatMap((transition) => [
            transition.fromOccurrenceId,
            transition.toOccurrenceId,
          ]),
          ...(execution.currentOccurrenceIndex === null || !previousPlan
            ? []
            : [
                compileActivityPlan(previousPlan.structure).occurrences[
                  execution.currentOccurrenceIndex
                ]?.occurrenceId,
              ]),
        ].filter((id): id is string => Boolean(id));
        // Route and intensity revisions keep the same plan epoch. Closing that
        // epoch must validate against when this plan was attached, not merely the
        // immediately preceding non-plan revision.
        let planEpoch = previous;
        for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
          const candidate = timeline.revisions[cursor];
          if (
            candidate?.kind === "plan" &&
            JSON.stringify(candidate.plan) === JSON.stringify(previousPlan)
          ) {
            planEpoch = candidate;
            break;
          }
        }
        const startMs = planEpoch.elapsedMs;
        const startActiveMs = planEpoch.activeMs;
        const valid =
          (previousPlan ? ids.every((id) => occurrenceIds.has(id)) : ids.length === 0) &&
          (execution.currentOccurrenceIndex === null ||
            Boolean(
              previousPlan &&
                occurrenceIds.has(
                  compileActivityPlan(previousPlan.structure).occurrences[
                    execution.currentOccurrenceIndex
                  ]?.occurrenceId ?? "",
                ),
            )) &&
          execution.occurrenceStartedMovingMs >= startActiveMs &&
          execution.occurrenceStartedMovingMs <= revision.activeMs &&
          execution.transitions.every((transition, transitionIndex, transitions) => {
            const prior = transitions[transitionIndex - 1];
            return (
              transition.elapsedMs >= startMs &&
              transition.elapsedMs <= revision.elapsedMs &&
              transition.movingMs >= startActiveMs &&
              transition.movingMs <= revision.activeMs &&
              Date.parse(transition.timestamp) >= Date.parse(previous.timestamp) &&
              Date.parse(transition.timestamp) <= Date.parse(revision.timestamp) &&
              (!prior ||
                (transition.elapsedMs >= prior.elapsedMs &&
                  transition.movingMs >= prior.movingMs &&
                  Date.parse(transition.timestamp) >= Date.parse(prior.timestamp)))
            );
          });
        if (!valid)
          context.addIssue({
            code: "custom",
            path: ["revisions", index, "closedExecution"],
            message:
              "Closed plan visits must belong to the preceding prescription and its epoch bounds.",
          });
      }
    });
    if (JSON.stringify(timeline).length > 1_000_000) {
      context.addIssue({
        code: "custom",
        message: "Guidance history exceeds the durable size limit.",
      });
    }
  });
export type RecordingGuidanceTimeline = z.infer<typeof recordingGuidanceTimelineSchema>;

export const portableTimerRecordingDraftSchema = z
  .object({
    schemaVersion: z.literal(PORTABLE_TIMER_RECORDING_DRAFT_SCHEMA_VERSION),
    execution: realRecordingExecutionSchema.optional(),
    ownerId: z.string().min(1),
    sessionSnapshot: portableWebRecordingSessionSnapshotSchema,
    lifecycle: z.enum(["recording", "paused"]),
    timing: portableTimerRecordingTimingSchema,
    planExecution: portableWebPlanExecutionStateSchema.optional(),
    guidance: recordingGuidanceTimelineSchema.optional(),
    measuredJournal: measuredRecordingJournalSchema.optional(),
    revision: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((draft, context) => {
    const guidance = draft.guidance;
    const initial = guidance?.revisions[0];
    const last = guidance?.revisions.at(-1);
    if (
      guidance &&
      (!initial ||
        !last ||
        last.elapsedMs > draft.timing.elapsedMs ||
        last.activeMs > draft.timing.movingMs ||
        initial.timestamp !== draft.sessionSnapshot.identity.startedAt ||
        initial.routeId !== draft.sessionSnapshot.activity.routeId ||
        JSON.stringify(initial.plan) !==
          JSON.stringify(draft.sessionSnapshot.planExecution ?? null) ||
        guidance.revisions.some(
          (revision) =>
            revision.plan &&
            revision.plan.structure.activity_category !==
              draft.sessionSnapshot.activity.activity_category,
        ))
    ) {
      context.addIssue({
        code: "custom",
        path: ["guidance"],
        message: "Guidance must stay within its immutable recording session.",
      });
    }
    if (
      draft.measuredJournal &&
      !measuredJournalWithinBounds(
        draft.measuredJournal,
        draft.timing.startedAt,
        draft.timing.updatedAt,
        draft.lifecycle === "paused",
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["measuredJournal"],
        message: "Measured evidence must be inside the saved recording boundary.",
      });
    }
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
