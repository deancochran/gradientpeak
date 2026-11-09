import {
  checkInAnswerSchema,
  decideCheckInSubmission,
  publishedCheckInTemplateVersionSchema,
  scheduledCheckInOccurrenceSchema,
  validateCheckInOccurrenceBinding,
} from "@repo/core/coaching/check-ins";
import type { DrizzleDbClient } from "@repo/db/client";
import { createAthleteCheckInRepository } from "../repositories/athlete-check-in-repository";

export class AthleteCheckInError extends Error {
  constructor(readonly reason: "forbidden" | "not_found" | "conflict" | "invalid") {
    super(reason);
    this.name = "AthleteCheckInError";
  }
}

function snapshot(row: {
  templateId: string;
  templateVersionId: string;
  versionNumber: number;
  templateName: string;
  questions: unknown;
}) {
  return publishedCheckInTemplateVersionSchema.parse({
    templateId: row.templateId,
    versionId: row.templateVersionId,
    versionNumber: row.versionNumber,
    name: row.templateName,
    questions: row.questions,
  });
}

function occurrenceDto(row: {
  occurrenceId: string;
  scheduleId: string;
  templateVersionId: string;
  periodStartDate: string;
  scheduledLocalTime: string;
  timeZone: string;
  templateId: string;
  versionNumber: number;
  templateName: string;
  questions: unknown;
  submissionId: string | null;
  revision: number | null;
  answers?: unknown;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  reviewedByProfileId: string | null;
}) {
  const common = {
    occurrenceId: row.occurrenceId,
    scheduleId: row.scheduleId,
    templateVersionId: row.templateVersionId,
    periodStartDate: row.periodStartDate,
    scheduledLocalTime: row.scheduledLocalTime,
    timeZone: row.timeZone,
    templateVersion: snapshot(row),
  };
  if (!row.submissionId || row.revision === null || !row.submittedAt)
    return { ...common, state: "pending" as const, submission: null };
  const submission = {
    submissionId: row.submissionId,
    revision: row.revision,
    submittedAt: row.submittedAt,
    ...(row.answers === undefined
      ? {}
      : { answers: checkInAnswerSchema.array().parse(row.answers) }),
  };
  return row.reviewedAt && row.reviewedByProfileId
    ? {
        ...common,
        state: "reviewed" as const,
        submission,
        reviewedAt: row.reviewedAt,
        reviewedByProfileId: row.reviewedByProfileId,
      }
    : { ...common, state: "submitted" as const, submission };
}

export async function submitAthleteCheckIn(input: {
  db: DrizzleDbClient;
  athleteProfileId: string;
  occurrenceId: string;
  templateVersionId: string;
  expectedRevision: number;
  idempotencyKey: string;
  draft: unknown;
}) {
  return input.db.transaction(async (tx) => {
    const repo = createAthleteCheckInRepository(tx);
    const occurrence = (
      await repo.lockOccurrenceForAthlete(input.occurrenceId, input.athleteProfileId)
    )[0];
    if (!occurrence) throw new AthleteCheckInError("not_found");
    const templateVersion = snapshot(occurrence);
    const coreOccurrence = scheduledCheckInOccurrenceSchema.parse({
      occurrenceId: occurrence.occurrenceId,
      scheduleId: occurrence.scheduleId,
      templateVersionId: occurrence.templateVersionId,
      engagementId: occurrence.engagementId,
      periodStartDate: occurrence.periodStartDate,
      scheduledLocalTime: occurrence.scheduledLocalTime,
      timeZone: occurrence.timeZone,
    });
    if (
      validateCheckInOccurrenceBinding({
        schedule: {
          scheduleId: occurrence.scheduleId,
          templateVersionId: occurrence.templateVersionId,
          engagementId: occurrence.engagementId,
          weekday: occurrence.weekday,
          localTime: occurrence.scheduleLocalTime,
          timeZone: occurrence.scheduleTimeZone,
        },
        occurrence: coreOccurrence,
      }).outcome !== "valid"
    )
      throw new AthleteCheckInError("conflict");
    const idempotent = (
      await repo.findSubmissionByIdempotencyKey(input.athleteProfileId, input.idempotencyKey)
    )[0];
    const decide = (currentRevision: number, existingSubmission?: unknown) =>
      decideCheckInSubmission({
        templateVersion,
        occurrence: coreOccurrence,
        actorProfileId: input.athleteProfileId,
        expectedRevision: input.expectedRevision,
        currentRevision,
        draft: { templateVersionId: input.templateVersionId, answers: input.draft },
        ...(existingSubmission === undefined ? {} : { existingSubmission }),
      });
    if (idempotent) {
      const decision = decide(0, {
        submissionId: idempotent.submissionId,
        occurrenceId: idempotent.occurrenceId,
        actorProfileId: idempotent.actorProfileId,
        templateVersionId: idempotent.templateVersionId,
        answers: idempotent.answers,
      });
      if (decision.outcome === "invalid") throw new AthleteCheckInError("invalid");
      if (decision.outcome === "conflict") throw new AthleteCheckInError("conflict");
      if (decision.outcome !== "replay") throw new AthleteCheckInError("conflict");
      return {
        submissionId: decision.submissionId,
        revision: idempotent.revision,
        replayed: true,
      };
    }
    if (
      occurrence.organizationSuspendedAt ||
      occurrence.organizationClosedAt ||
      occurrence.engagementPausedAt ||
      occurrence.engagementEndedAt
    )
      throw new AthleteCheckInError("forbidden");
    const existingForOccurrence = (
      await repo.findSubmissionForOccurrence(input.occurrenceId, input.athleteProfileId)
    )[0];
    const decision = decide(existingForOccurrence?.revision ?? 0);
    if (decision.outcome === "invalid") throw new AthleteCheckInError("invalid");
    if (decision.outcome === "conflict") throw new AthleteCheckInError("conflict");
    if (decision.outcome === "replay") throw new AthleteCheckInError("conflict");
    if (existingForOccurrence) throw new AthleteCheckInError("conflict");
    const inserted = await repo.insertSubmission({
      organizationId: occurrence.organizationId,
      occurrenceId: occurrence.occurrenceId,
      engagementId: occurrence.engagementId,
      athleteProfileId: input.athleteProfileId,
      templateVersionId: occurrence.templateVersionId,
      revision: input.expectedRevision + 1,
      idempotencyKey: input.idempotencyKey,
      answers: decision.answers,
    });
    const created = inserted[0];
    if (!created) throw new AthleteCheckInError("conflict");
    return { submissionId: created.id, revision: created.revision, replayed: false };
  });
}

export async function listAthleteCheckIns(input: {
  db: DrizzleDbClient;
  athleteProfileId: string;
  limit: number;
  cursor: { periodStartDate: string; id: string } | null;
}) {
  const rows = await createAthleteCheckInRepository(input.db).listOwnedOccurrences(input);
  const page = rows.slice(0, input.limit);
  const tail = page.at(-1);
  return {
    items: page.map(occurrenceDto),
    nextCursor:
      rows.length > input.limit && tail
        ? { periodStartDate: tail.periodStartDate, id: tail.occurrenceId }
        : null,
  };
}

export async function readAthleteCheckIn(input: {
  db: DrizzleDbClient;
  athleteProfileId: string;
  occurrenceId: string;
}) {
  const row = (
    await createAthleteCheckInRepository(input.db).readOwnedOccurrence(
      input.occurrenceId,
      input.athleteProfileId,
    )
  )[0];
  if (!row) throw new AthleteCheckInError("not_found");
  const dto = occurrenceDto(row);
  const unavailable: "organization_inactive" | "engagement_paused" | "engagement_ended" | null =
    row.organizationSuspendedAt || row.organizationClosedAt
      ? "organization_inactive"
      : row.engagementPausedAt
        ? "engagement_paused"
        : row.engagementEndedAt
          ? "engagement_ended"
          : null;
  return {
    ...dto,
    canSubmit: dto.state === "pending" && unavailable === null,
    unavailableReason: unavailable,
  };
}
