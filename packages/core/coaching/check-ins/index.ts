import { z } from "zod";

import { dateOnlySchema } from "../../schemas/date-only";
import { isValidIanaTimeZone, scheduledDateTimeToIsoInstant } from "../../utils/schedule-date";

const uuidSchema = z.string().uuid();
const localTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must use HH:mm in 24-hour time");
const nonEmptyTextSchema = z.string().trim().min(1).max(2_000);

const checkInQuestionBaseSchema = z
  .object({
    questionId: uuidSchema,
    label: z.string().trim().min(1).max(240),
    helpText: z.string().trim().min(1).max(1_000).nullable(),
    required: z.boolean(),
    /** A declaration only; consent and assignment scope are enforced by the server. */
    audience: z.literal("athlete_and_assigned_coaches").default("athlete_and_assigned_coaches"),
  })
  .strict();

const checkInChoiceSchema = z
  .object({ choiceId: uuidSchema, label: z.string().trim().min(1).max(160) })
  .strict()
  .readonly();

/** The three answer forms specified by the fixed weekly check-in experience. */
export const checkInQuestionSchema = z.discriminatedUnion("kind", [
  checkInQuestionBaseSchema
    .extend({ kind: z.literal("scale_1_to_10") })
    .strict()
    .readonly(),
  checkInQuestionBaseSchema
    .extend({
      kind: z.literal("single_select"),
      choices: z.array(checkInChoiceSchema).min(2).max(12).readonly(),
    })
    .strict()
    .superRefine((question, ctx) => {
      const choiceIds = new Set<string>();
      for (const choice of question.choices) {
        if (choiceIds.has(choice.choiceId)) {
          ctx.addIssue({ code: "custom", message: "Choice IDs must be unique" });
          return;
        }
        choiceIds.add(choice.choiceId);
      }
    })
    .readonly(),
  checkInQuestionBaseSchema
    .extend({ kind: z.literal("long_text") })
    .strict()
    .readonly(),
]);
export type CheckInQuestion = z.infer<typeof checkInQuestionSchema>;

/** A published version is a snapshot: future template edits must create another version. */
export const publishedCheckInTemplateVersionSchema = z
  .object({
    templateId: uuidSchema,
    versionId: uuidSchema,
    versionNumber: z.number().int().positive(),
    name: z.string().trim().min(1).max(120),
    questions: z.array(checkInQuestionSchema).min(1).max(20).readonly(),
  })
  .strict()
  .superRefine((version, ctx) => {
    const questionIds = new Set<string>();
    for (const question of version.questions) {
      if (questionIds.has(question.questionId)) {
        ctx.addIssue({ code: "custom", message: "Question IDs must be unique within a version" });
        return;
      }
      questionIds.add(question.questionId);
    }
  })
  .readonly();
export type PublishedCheckInTemplateVersion = z.infer<typeof publishedCheckInTemplateVersionSchema>;

/** Schema parsing returns an independent, deeply frozen published snapshot. */
export function publishCheckInTemplateVersion(
  input: z.input<typeof publishedCheckInTemplateVersionSchema>,
): PublishedCheckInTemplateVersion {
  return publishedCheckInTemplateVersionSchema.parse(input);
}

export const weeklyCheckInScheduleSchema = z
  .object({
    scheduleId: uuidSchema,
    templateVersionId: uuidSchema,
    engagementId: uuidSchema,
    weekday: z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]),
    localTime: localTimeSchema,
    timeZone: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .refine(isValidIanaTimeZone, "Invalid IANA time zone"),
  })
  .strict();
export type WeeklyCheckInSchedule = z.infer<typeof weeklyCheckInScheduleSchema>;

/**
 * Identity for one scheduled local period. This module validates the supplied civil time,
 * but deliberately does not expand recurrences or choose a scheduler implementation.
 */
export const scheduledCheckInOccurrenceSchema = z
  .object({
    occurrenceId: uuidSchema,
    scheduleId: uuidSchema,
    templateVersionId: uuidSchema,
    engagementId: uuidSchema,
    periodStartDate: dateOnlySchema,
    scheduledLocalTime: localTimeSchema,
    timeZone: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .refine(isValidIanaTimeZone, "Invalid IANA time zone"),
  })
  .strict()
  .superRefine((occurrence, ctx) => {
    try {
      scheduledDateTimeToIsoInstant({
        scheduledDate: occurrence.periodStartDate,
        time: occurrence.scheduledLocalTime,
        timeZone: occurrence.timeZone,
      });
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Invalid local civil date and time",
      });
    }
  });
export type ScheduledCheckInOccurrence = z.infer<typeof scheduledCheckInOccurrenceSchema>;

/**
 * Converts one already-selected local occurrence to an instant without silently shifting it.
 * Recurrence expansion remains outside this core contract.
 */
export function materializeCheckInOccurrence(input: {
  periodStartDate: string;
  scheduledLocalTime: string;
  timeZone: string;
}):
  | { readonly outcome: "materialized"; readonly scheduledFor: string }
  | {
      readonly outcome: "needs_reschedule";
      readonly reason: "nonexistent_local_time" | "ambiguous_local_time";
      readonly message: string;
    } {
  try {
    return {
      outcome: "materialized",
      scheduledFor: scheduledDateTimeToIsoInstant({
        scheduledDate: input.periodStartDate,
        time: input.scheduledLocalTime,
        timeZone: input.timeZone,
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid local civil date and time";
    if (message.includes("does not exist")) {
      return {
        outcome: "needs_reschedule",
        reason: "nonexistent_local_time",
        message:
          "This local time does not occur because of daylight saving time. Choose another time.",
      };
    }
    if (message.includes("ambiguous")) {
      return {
        outcome: "needs_reschedule",
        reason: "ambiguous_local_time",
        message:
          "This local time occurs twice because of daylight saving time. Choose another time.",
      };
    }
    throw error;
  }
}

/** Ensures a materialized weekly occurrence still belongs to its versioned schedule. */
export function validateCheckInOccurrenceBinding(input: {
  schedule: WeeklyCheckInSchedule;
  occurrence: ScheduledCheckInOccurrence;
}):
  | { readonly outcome: "valid" }
  | {
      readonly outcome: "invalid";
      readonly reason: "schedule_mismatch" | "period_weekday_mismatch";
    } {
  const { schedule, occurrence } = input;
  if (
    occurrence.scheduleId !== schedule.scheduleId ||
    occurrence.templateVersionId !== schedule.templateVersionId ||
    occurrence.engagementId !== schedule.engagementId ||
    occurrence.scheduledLocalTime !== schedule.localTime ||
    occurrence.timeZone !== schedule.timeZone
  ) {
    return { outcome: "invalid", reason: "schedule_mismatch" };
  }
  const weekday = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ] as const;
  const periodWeekday =
    weekday[new Date(`${occurrence.periodStartDate}T00:00:00.000Z`).getUTCDay()];
  return periodWeekday === schedule.weekday
    ? { outcome: "valid" }
    : { outcome: "invalid", reason: "period_weekday_mismatch" };
}

export const checkInAnswerSchema = z.discriminatedUnion("kind", [
  z
    .object({
      questionId: uuidSchema,
      kind: z.literal("scale_1_to_10"),
      value: z.number().int().min(1).max(10),
    })
    .strict(),
  z
    .object({ questionId: uuidSchema, kind: z.literal("single_select"), choiceId: uuidSchema })
    .strict(),
  z
    .object({ questionId: uuidSchema, kind: z.literal("long_text"), text: nonEmptyTextSchema })
    .strict(),
]);
export type CheckInAnswer = z.infer<typeof checkInAnswerSchema>;

export const checkInDraftSchema = z
  .object({ templateVersionId: uuidSchema, answers: z.array(checkInAnswerSchema).max(20) })
  .strict();
export type CheckInDraft = z.infer<typeof checkInDraftSchema>;

export type CheckInDraftValidation =
  | {
      readonly outcome: "valid";
      readonly completeness: "complete" | "incomplete";
      readonly draft: CheckInDraft;
    }
  | {
      readonly outcome: "invalid";
      readonly reason:
        | "template_version_mismatch"
        | "unknown_question"
        | "answer_kind_mismatch"
        | "invalid_choice"
        | "duplicate_answer"
        | "malformed_answer";
    };

type CheckInDraftInvalidReason = Extract<CheckInDraftValidation, { outcome: "invalid" }>["reason"];

/**
 * Validates a version-bound draft. Missing required answers keep a draft incomplete rather
 * than discarding it; submission separately requires completeness.
 */
export function validateCheckInDraft(input: {
  templateVersion: PublishedCheckInTemplateVersion;
  draft: unknown;
}): CheckInDraftValidation {
  const draftResult = checkInDraftSchema.safeParse(input.draft);
  if (!draftResult.success) return { outcome: "invalid", reason: "malformed_answer" };
  const draft = draftResult.data;
  if (draft.templateVersionId !== input.templateVersion.versionId) {
    return { outcome: "invalid", reason: "template_version_mismatch" };
  }

  const questions = new Map(
    input.templateVersion.questions.map((question) => [question.questionId, question]),
  );
  const answeredQuestionIds = new Set<string>();
  for (const answer of draft.answers) {
    const question = questions.get(answer.questionId);
    if (!question) return { outcome: "invalid", reason: "unknown_question" };
    if (answeredQuestionIds.has(answer.questionId))
      return { outcome: "invalid", reason: "duplicate_answer" };
    answeredQuestionIds.add(answer.questionId);
    if (answer.kind !== question.kind)
      return { outcome: "invalid", reason: "answer_kind_mismatch" };
    if (answer.kind === "single_select" && question.kind === "single_select") {
      if (!question.choices.some((choice) => choice.choiceId === answer.choiceId)) {
        return { outcome: "invalid", reason: "invalid_choice" };
      }
    }
  }

  return {
    outcome: "valid",
    completeness: input.templateVersion.questions.some(
      (question) => question.required && !answeredQuestionIds.has(question.questionId),
    )
      ? "incomplete"
      : "complete",
    draft: {
      templateVersionId: draft.templateVersionId,
      answers: normalizeAnswers(input.templateVersion, draft.answers),
    },
  };
}

export type CheckInSubmissionDecision =
  | { readonly outcome: "submit"; readonly answers: readonly CheckInAnswer[] }
  | { readonly outcome: "replay"; readonly submissionId: string }
  | {
      readonly outcome: "conflict";
      readonly reason:
        | "stale_revision"
        | "idempotency_payload_mismatch"
        | "existing_submission_identity_mismatch";
    }
  | {
      readonly outcome: "invalid";
      readonly reason:
        | CheckInDraftInvalidReason
        | "required_answer_missing"
        | "invalid_existing_evidence";
    };

/** Durable submission evidence used only for idempotent-retry comparison. */
export const existingCheckInSubmissionSchema = z
  .object({
    submissionId: uuidSchema,
    occurrenceId: uuidSchema,
    actorProfileId: uuidSchema,
    templateVersionId: uuidSchema,
    answers: z.unknown(),
  })
  .strict();
export type ExistingCheckInSubmission = z.infer<typeof existingCheckInSubmissionSchema>;

/**
 * Pure submission decision only. The server must authoritatively check actor/engagement
 * authorization and persist the revision/idempotency guarantee in one transaction.
 */
export function decideCheckInSubmission(input: {
  templateVersion: PublishedCheckInTemplateVersion;
  occurrence: ScheduledCheckInOccurrence;
  actorProfileId: string;
  expectedRevision: number;
  currentRevision: number;
  draft: unknown;
  existingSubmission?: unknown;
}): CheckInSubmissionDecision {
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    !Number.isSafeInteger(input.currentRevision) ||
    input.expectedRevision < 0 ||
    input.currentRevision < 0
  ) {
    return { outcome: "invalid", reason: "malformed_answer" };
  }
  if (input.occurrence.templateVersionId !== input.templateVersion.versionId) {
    return { outcome: "invalid", reason: "template_version_mismatch" };
  }
  if (!uuidSchema.safeParse(input.actorProfileId).success)
    return { outcome: "invalid", reason: "malformed_answer" };

  const validation = validateCheckInDraft({
    templateVersion: input.templateVersion,
    draft: input.draft,
  });
  if (validation.outcome === "invalid") return validation;
  if (validation.completeness === "incomplete")
    return { outcome: "invalid", reason: "required_answer_missing" };
  if (input.existingSubmission !== undefined) {
    const existingEvidence = existingCheckInSubmissionSchema.safeParse(input.existingSubmission);
    if (!existingEvidence.success)
      return { outcome: "invalid", reason: "invalid_existing_evidence" };
    const existing = existingEvidence.data;
    if (
      existing.occurrenceId !== input.occurrence.occurrenceId ||
      existing.actorProfileId !== input.actorProfileId ||
      existing.templateVersionId !== input.templateVersion.versionId
    ) {
      return { outcome: "conflict", reason: "existing_submission_identity_mismatch" };
    }
    const existingValidation = validateCheckInDraft({
      templateVersion: input.templateVersion,
      draft: { templateVersionId: existing.templateVersionId, answers: existing.answers },
    });
    if (
      existingValidation.outcome === "invalid" ||
      existingValidation.completeness === "incomplete"
    ) {
      return { outcome: "invalid", reason: "invalid_existing_evidence" };
    }
    return answersEqual(existingValidation.draft.answers, validation.draft.answers)
      ? { outcome: "replay", submissionId: existing.submissionId }
      : { outcome: "conflict", reason: "idempotency_payload_mismatch" };
  }
  if (input.expectedRevision !== input.currentRevision)
    return { outcome: "conflict", reason: "stale_revision" };
  return { outcome: "submit", answers: validation.draft.answers };
}

export const submittedCheckInSchema = z
  .object({
    submissionId: uuidSchema,
    revision: z.number().int().nonnegative(),
    reviewedAt: z.string().datetime({ offset: true }).nullable(),
    reviewedByProfileId: uuidSchema.nullable(),
  })
  .strict()
  .superRefine((submission, ctx) => {
    if ((submission.reviewedAt === null) !== (submission.reviewedByProfileId === null)) {
      ctx.addIssue({
        code: "custom",
        message: "Review timestamp and reviewer must be recorded together",
      });
    }
  });
export type SubmittedCheckIn = z.infer<typeof submittedCheckInSchema>;

export function getCheckInReviewState(submission: SubmittedCheckIn): "submitted" | "reviewed" {
  return submission.reviewedAt === null ? "submitted" : "reviewed";
}

export function markCheckInReviewed(input: {
  submission: SubmittedCheckIn;
  reviewerProfileId: string;
  reviewedAt: string;
}): SubmittedCheckIn {
  return submittedCheckInSchema.parse({
    ...input.submission,
    reviewedByProfileId: input.reviewerProfileId,
    reviewedAt: input.reviewedAt,
  });
}

/** Creating a follow-up deliberately returns no review-state transition. */
export function createCheckInFollowUp(input: {
  submissionId: string;
  taskId: string;
  assignedCoachProfileId: string;
  dueDate: string;
  title: string;
}) {
  return z
    .object({
      submissionId: uuidSchema,
      taskId: uuidSchema,
      assignedCoachProfileId: uuidSchema,
      dueDate: dateOnlySchema,
      title: z.string().trim().min(1).max(240),
    })
    .strict()
    .parse(input);
}

function normalizeAnswers(
  templateVersion: PublishedCheckInTemplateVersion,
  answers: readonly CheckInAnswer[],
): CheckInAnswer[] {
  const answerByQuestionId = new Map(answers.map((answer) => [answer.questionId, answer]));
  return templateVersion.questions.flatMap((question) => {
    const answer = answerByQuestionId.get(question.questionId);
    return answer ? [{ ...answer }] : [];
  });
}

function answersEqual(left: readonly CheckInAnswer[], right: readonly CheckInAnswer[]): boolean {
  return (
    left.length === right.length &&
    left.every((answer, index) => {
      const comparison = right[index];
      if (
        !comparison ||
        answer.questionId !== comparison.questionId ||
        answer.kind !== comparison.kind
      ) {
        return false;
      }
      switch (answer.kind) {
        case "scale_1_to_10":
          return comparison.kind === "scale_1_to_10" && answer.value === comparison.value;
        case "single_select":
          return comparison.kind === "single_select" && answer.choiceId === comparison.choiceId;
        case "long_text":
          return comparison.kind === "long_text" && answer.text === comparison.text;
        default:
          return false;
      }
    })
  );
}
