import {
  checkInOccurrences,
  checkInSchedules,
  checkInSubmissions,
  checkInTemplateVersions,
  coachingEngagements,
  organizations,
} from "@repo/db";
import { and, desc, eq, lt, or } from "drizzle-orm";
import type { DrizzleQueryExecutor } from "../db";

/** All private check-in queries are constrained by the authenticated athlete profile. */
export function createAthleteCheckInRepository(db: DrizzleQueryExecutor) {
  const owned = (athleteProfileId: string) =>
    eq(checkInSubmissions.athlete_profile_id, athleteProfileId);
  return {
    lockOccurrenceForAthlete: (occurrenceId: string, athleteProfileId: string) =>
      db
        .select({
          occurrenceId: checkInOccurrences.id,
          organizationId: checkInOccurrences.organization_id,
          scheduleId: checkInOccurrences.schedule_id,
          engagementId: checkInOccurrences.engagement_id,
          athleteProfileId: checkInOccurrences.athlete_profile_id,
          templateVersionId: checkInOccurrences.template_version_id,
          periodStartDate: checkInOccurrences.period_start_date,
          scheduledLocalTime: checkInOccurrences.scheduled_local_time,
          timeZone: checkInOccurrences.time_zone,
          weekday: checkInSchedules.weekday,
          scheduleLocalTime: checkInSchedules.local_time,
          scheduleTimeZone: checkInSchedules.time_zone,
          engagementPausedAt: coachingEngagements.paused_at,
          engagementEndedAt: coachingEngagements.ended_at,
          organizationSuspendedAt: organizations.suspended_at,
          organizationClosedAt: organizations.closed_at,
          templateId: checkInTemplateVersions.template_id,
          versionNumber: checkInTemplateVersions.version_number,
          templateName: checkInTemplateVersions.name,
          questions: checkInTemplateVersions.questions,
        })
        .from(checkInOccurrences)
        .innerJoin(
          checkInSchedules,
          and(
            eq(checkInSchedules.organization_id, checkInOccurrences.organization_id),
            eq(checkInSchedules.id, checkInOccurrences.schedule_id),
          ),
        )
        .innerJoin(
          coachingEngagements,
          and(
            eq(coachingEngagements.organization_id, checkInOccurrences.organization_id),
            eq(coachingEngagements.id, checkInOccurrences.engagement_id),
          ),
        )
        .innerJoin(organizations, eq(organizations.id, checkInOccurrences.organization_id))
        .innerJoin(
          checkInTemplateVersions,
          and(
            eq(checkInTemplateVersions.organization_id, checkInOccurrences.organization_id),
            eq(checkInTemplateVersions.id, checkInOccurrences.template_version_id),
          ),
        )
        .where(
          and(
            eq(checkInOccurrences.id, occurrenceId),
            eq(checkInOccurrences.athlete_profile_id, athleteProfileId),
          ),
        )
        .for("update")
        .limit(1),
    findSubmissionByIdempotencyKey: (athleteProfileId: string, idempotencyKey: string) =>
      db
        .select({
          submissionId: checkInSubmissions.id,
          occurrenceId: checkInSubmissions.occurrence_id,
          actorProfileId: checkInSubmissions.athlete_profile_id,
          templateVersionId: checkInSubmissions.template_version_id,
          answers: checkInSubmissions.answers,
          revision: checkInSubmissions.submission_revision,
        })
        .from(checkInSubmissions)
        .where(and(owned(athleteProfileId), eq(checkInSubmissions.idempotency_key, idempotencyKey)))
        .for("update")
        .limit(1),
    findSubmissionForOccurrence: (occurrenceId: string, athleteProfileId: string) =>
      db
        .select({ id: checkInSubmissions.id, revision: checkInSubmissions.submission_revision })
        .from(checkInSubmissions)
        .where(and(eq(checkInSubmissions.occurrence_id, occurrenceId), owned(athleteProfileId)))
        .for("update")
        .limit(1),
    insertSubmission: (input: {
      organizationId: string;
      occurrenceId: string;
      engagementId: string;
      athleteProfileId: string;
      templateVersionId: string;
      revision: number;
      idempotencyKey: string;
      answers: unknown;
    }) =>
      db
        .insert(checkInSubmissions)
        .values({
          organization_id: input.organizationId,
          occurrence_id: input.occurrenceId,
          engagement_id: input.engagementId,
          athlete_profile_id: input.athleteProfileId,
          template_version_id: input.templateVersionId,
          submission_revision: input.revision,
          idempotency_key: input.idempotencyKey,
          answers: input.answers,
        })
        .onConflictDoNothing()
        .returning({ id: checkInSubmissions.id, revision: checkInSubmissions.submission_revision }),
    listOwnedOccurrences: (input: {
      athleteProfileId: string;
      limit: number;
      cursor: { periodStartDate: string; id: string } | null;
    }) =>
      db
        .select({
          occurrenceId: checkInOccurrences.id,
          scheduleId: checkInOccurrences.schedule_id,
          templateVersionId: checkInOccurrences.template_version_id,
          periodStartDate: checkInOccurrences.period_start_date,
          scheduledLocalTime: checkInOccurrences.scheduled_local_time,
          timeZone: checkInOccurrences.time_zone,
          submissionId: checkInSubmissions.id,
          revision: checkInSubmissions.submission_revision,
          submittedAt: checkInSubmissions.submitted_at,
          reviewedAt: checkInSubmissions.reviewed_at,
          reviewedByProfileId: checkInSubmissions.reviewed_by_profile_id,
          templateId: checkInTemplateVersions.template_id,
          versionNumber: checkInTemplateVersions.version_number,
          templateName: checkInTemplateVersions.name,
          questions: checkInTemplateVersions.questions,
        })
        .from(checkInOccurrences)
        .innerJoin(
          checkInTemplateVersions,
          and(
            eq(checkInTemplateVersions.organization_id, checkInOccurrences.organization_id),
            eq(checkInTemplateVersions.id, checkInOccurrences.template_version_id),
          ),
        )
        .leftJoin(
          checkInSubmissions,
          and(
            eq(checkInSubmissions.occurrence_id, checkInOccurrences.id),
            eq(checkInSubmissions.athlete_profile_id, input.athleteProfileId),
          ),
        )
        .where(
          and(
            eq(checkInOccurrences.athlete_profile_id, input.athleteProfileId),
            ...(input.cursor
              ? [
                  or(
                    lt(checkInOccurrences.period_start_date, input.cursor.periodStartDate),
                    and(
                      eq(checkInOccurrences.period_start_date, input.cursor.periodStartDate),
                      lt(checkInOccurrences.id, input.cursor.id),
                    ),
                  ),
                ]
              : []),
          ),
        )
        .orderBy(desc(checkInOccurrences.period_start_date), desc(checkInOccurrences.id))
        .limit(input.limit + 1),
    readOwnedOccurrence: (occurrenceId: string, athleteProfileId: string) =>
      db
        .select({
          occurrenceId: checkInOccurrences.id,
          scheduleId: checkInOccurrences.schedule_id,
          templateVersionId: checkInOccurrences.template_version_id,
          periodStartDate: checkInOccurrences.period_start_date,
          scheduledLocalTime: checkInOccurrences.scheduled_local_time,
          timeZone: checkInOccurrences.time_zone,
          organizationSuspendedAt: organizations.suspended_at,
          organizationClosedAt: organizations.closed_at,
          engagementPausedAt: coachingEngagements.paused_at,
          engagementEndedAt: coachingEngagements.ended_at,
          submissionId: checkInSubmissions.id,
          revision: checkInSubmissions.submission_revision,
          answers: checkInSubmissions.answers,
          submittedAt: checkInSubmissions.submitted_at,
          reviewedAt: checkInSubmissions.reviewed_at,
          reviewedByProfileId: checkInSubmissions.reviewed_by_profile_id,
          templateId: checkInTemplateVersions.template_id,
          versionNumber: checkInTemplateVersions.version_number,
          templateName: checkInTemplateVersions.name,
          questions: checkInTemplateVersions.questions,
        })
        .from(checkInOccurrences)
        .innerJoin(
          coachingEngagements,
          and(
            eq(coachingEngagements.organization_id, checkInOccurrences.organization_id),
            eq(coachingEngagements.id, checkInOccurrences.engagement_id),
          ),
        )
        .innerJoin(organizations, eq(organizations.id, checkInOccurrences.organization_id))
        .innerJoin(
          checkInTemplateVersions,
          and(
            eq(checkInTemplateVersions.organization_id, checkInOccurrences.organization_id),
            eq(checkInTemplateVersions.id, checkInOccurrences.template_version_id),
          ),
        )
        .leftJoin(
          checkInSubmissions,
          and(
            eq(checkInSubmissions.occurrence_id, checkInOccurrences.id),
            eq(checkInSubmissions.athlete_profile_id, athleteProfileId),
          ),
        )
        .where(
          and(
            eq(checkInOccurrences.id, occurrenceId),
            eq(checkInOccurrences.athlete_profile_id, athleteProfileId),
          ),
        )
        .limit(1),
  };
}
