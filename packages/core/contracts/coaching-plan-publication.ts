import { z } from "zod";

import { ianaTimezoneSchema } from "../athlete-intelligence/planning-context";
import { formatDateOnlyInTimeZone } from "../plan/dateOnlyUtc";
import { plannedTrainingSessionSchema } from "../plan/planningSessions";
import { dateOnlySchema } from "../schemas/date-only";

const uuidSchema = z.string().uuid();
const instantSchema = z.string().datetime({ offset: true });
const positiveRevisionSchema = z.number().int().positive();
const fingerprintSchema = z.string().trim().min(1).max(256);

/**
 * An explicit athlete-specific planning grant. This is deliberately separate
 * from organization roles, invitations, and athlete read-consent records.
 */
export const athletePlanEditGrantSchema = z
  .object({
    grantId: uuidSchema,
    organizationId: uuidSchema,
    athleteProfileId: uuidSchema,
    coachMembershipId: uuidSchema,
    grantedAt: instantSchema,
    expiresAt: instantSchema.nullable(),
    revokedAt: instantSchema.nullable(),
  })
  .strict()
  .superRefine((grant, context) => {
    const grantedAt = Date.parse(grant.grantedAt);
    if (grant.expiresAt !== null && Date.parse(grant.expiresAt) < grantedAt) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "A plan-edit grant cannot expire before it is granted.",
      });
    }
    if (grant.revokedAt !== null && Date.parse(grant.revokedAt) < grantedAt) {
      context.addIssue({
        code: "custom",
        path: ["revokedAt"],
        message: "A plan-edit grant cannot be revoked before it is granted.",
      });
    }
  })
  .readonly();
export type AthletePlanEditGrant = z.infer<typeof athletePlanEditGrantSchema>;

export const coachingPlanSessionStateSchema = z.enum(["draft", "published", "completed"]);
export type CoachingPlanSessionState = z.infer<typeof coachingPlanSessionStateSchema>;

/** A dated planning-session draft; published and completed rows are protected history. */
export const coachingPlanDraftSessionSchema = plannedTrainingSessionSchema
  .extend({
    planningDate: dateOnlySchema,
    state: coachingPlanSessionStateSchema,
  })
  .strict()
  .readonly();
export type CoachingPlanDraftSession = z.infer<typeof coachingPlanDraftSessionSchema>;

export const coachingPlanDraftVersionSchema = z
  .object({
    organizationId: uuidSchema,
    athleteProfileId: uuidSchema,
    trainingPlanId: uuidSchema,
    revision: positiveRevisionSchema,
    authorMembershipId: uuidSchema,
    audience: z.literal("athlete"),
    sessions: z.array(coachingPlanDraftSessionSchema).max(366).readonly(),
  })
  .strict()
  .superRefine((draft, context) => {
    const sessionIds = new Set<string>();
    for (const [index, session] of draft.sessions.entries()) {
      if (sessionIds.has(session.id)) {
        context.addIssue({
          code: "custom",
          path: ["sessions", index, "id"],
          message: "A draft version cannot contain the same session ID more than once.",
        });
      }
      sessionIds.add(session.id);
    }
  })
  .readonly();
export type CoachingPlanDraftVersion = z.infer<typeof coachingPlanDraftVersionSchema>;

export const coachingPlanPublishScopeSchema = z
  .object({
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
    athleteTimezone: ianaTimezoneSchema,
    recipientProfileIds: z.array(uuidSchema).length(1).readonly(),
    recipientsFingerprint: fingerprintSchema,
  })
  .strict()
  .superRefine((scope, context) => {
    if (scope.startDate > scope.endDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "The publish range must end on or after its start date.",
      });
    }
  })
  .readonly();
export type CoachingPlanPublishScope = z.infer<typeof coachingPlanPublishScopeSchema>;

export const coachingPlanPublishPreviewInputSchema = z
  .object({
    grant: athletePlanEditGrantSchema,
    draft: coachingPlanDraftVersionSchema,
    actorMembershipId: uuidSchema,
    expectedRevision: positiveRevisionSchema,
    scope: coachingPlanPublishScopeSchema,
    previewFingerprint: fingerprintSchema,
    evaluatedAt: instantSchema,
  })
  .strict()
  .readonly();
export type CoachingPlanPublishPreviewInput = z.infer<typeof coachingPlanPublishPreviewInputSchema>;

export const coachingPlanPublishPreviewResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("ready"),
      eligibleDraftSessionIds: z.array(uuidSchema).readonly(),
      protectedHistorySessionIds: z.array(uuidSchema).readonly(),
      expectedRevision: positiveRevisionSchema,
      scope: coachingPlanPublishScopeSchema,
      previewFingerprint: fingerprintSchema,
    })
    .strict()
    .readonly(),
  z
    .object({
      status: z.literal("denied"),
      reason: z.enum([
        "grant_scope_mismatch",
        "grant_not_effective",
        "grant_expired",
        "grant_revoked",
      ]),
    })
    .strict()
    .readonly(),
  z
    .object({
      status: z.literal("stale_revision"),
      expectedRevision: positiveRevisionSchema,
      currentRevision: positiveRevisionSchema,
    })
    .strict()
    .readonly(),
  z
    .object({ status: z.literal("no_eligible_draft_sessions") })
    .strict()
    .readonly(),
]);
export type CoachingPlanPublishPreviewResult = z.infer<
  typeof coachingPlanPublishPreviewResultSchema
>;

/**
 * Produces a reviewable publish selection only. It neither writes data nor
 * proves authority: persistence must recheck grant, revision, and scope under
 * its transaction before it changes future draft sessions.
 */
export function previewCoachingPlanPublication(
  input: CoachingPlanPublishPreviewInput,
): CoachingPlanPublishPreviewResult {
  const parsed = coachingPlanPublishPreviewInputSchema.parse(input);
  const now = Date.parse(parsed.evaluatedAt);
  const grant = parsed.grant;

  if (
    grant.organizationId !== parsed.draft.organizationId ||
    grant.athleteProfileId !== parsed.draft.athleteProfileId ||
    grant.coachMembershipId !== parsed.actorMembershipId ||
    parsed.scope.recipientProfileIds[0] !== parsed.draft.athleteProfileId
  ) {
    return { status: "denied", reason: "grant_scope_mismatch" };
  }
  if (Date.parse(grant.grantedAt) > now) {
    return { status: "denied", reason: "grant_not_effective" };
  }
  if (grant.revokedAt !== null && Date.parse(grant.revokedAt) <= now) {
    return { status: "denied", reason: "grant_revoked" };
  }
  if (grant.expiresAt !== null && Date.parse(grant.expiresAt) <= now) {
    return { status: "denied", reason: "grant_expired" };
  }
  if (parsed.expectedRevision !== parsed.draft.revision) {
    return {
      status: "stale_revision",
      expectedRevision: parsed.expectedRevision,
      currentRevision: parsed.draft.revision,
    };
  }

  const athleteToday = formatDateOnlyInTimeZone(
    new Date(parsed.evaluatedAt),
    parsed.scope.athleteTimezone,
  );
  const inScope = (session: CoachingPlanDraftSession) =>
    session.planningDate >= parsed.scope.startDate && session.planningDate <= parsed.scope.endDate;
  const eligibleDraftSessionIds = parsed.draft.sessions
    .filter(
      (session) =>
        session.state === "draft" && session.planningDate >= athleteToday && inScope(session),
    )
    .map((session) => session.id);
  const protectedHistorySessionIds = parsed.draft.sessions
    .filter((session) => session.state !== "draft" && inScope(session))
    .map((session) => session.id);

  if (eligibleDraftSessionIds.length === 0) return { status: "no_eligible_draft_sessions" };

  return {
    status: "ready",
    eligibleDraftSessionIds,
    protectedHistorySessionIds,
    expectedRevision: parsed.expectedRevision,
    scope: parsed.scope,
    previewFingerprint: parsed.previewFingerprint,
  };
}

export const coachingPlanPublishConfirmationSchema = z
  .object({
    idempotencyKey: z.string().trim().min(1).max(128),
    previewFingerprint: fingerprintSchema,
    scopeFingerprint: fingerprintSchema,
    confirmationId: uuidSchema,
  })
  .strict()
  .readonly();
export type CoachingPlanPublishConfirmation = z.infer<typeof coachingPlanPublishConfirmationSchema>;

export const coachingPlanPublishConfirmationInputSchema = z
  .object({
    preview: coachingPlanPublishPreviewResultSchema,
    idempotencyKey: z.string().trim().min(1).max(128),
    scopeFingerprint: fingerprintSchema,
    confirmationId: uuidSchema,
    existingConfirmation: coachingPlanPublishConfirmationSchema.nullable(),
  })
  .strict()
  .readonly();

export const coachingPlanPublishConfirmationResultSchema = z.discriminatedUnion("status", [
  z
    .object({ status: z.literal("confirmed"), confirmation: coachingPlanPublishConfirmationSchema })
    .strict()
    .readonly(),
  z
    .object({
      status: z.literal("idempotent_replay"),
      confirmation: coachingPlanPublishConfirmationSchema,
    })
    .strict()
    .readonly(),
  z
    .object({ status: z.literal("idempotency_conflict") })
    .strict()
    .readonly(),
  z
    .object({ status: z.literal("preview_not_ready") })
    .strict()
    .readonly(),
]);
export type CoachingPlanPublishConfirmationResult = z.infer<
  typeof coachingPlanPublishConfirmationResultSchema
>;

/**
 * Models retry classification after a reviewed preview. The durable transaction
 * is responsible for storing and replaying this confirmation exactly once.
 */
export function confirmCoachingPlanPublication(
  input: z.input<typeof coachingPlanPublishConfirmationInputSchema>,
): CoachingPlanPublishConfirmationResult {
  const parsed = coachingPlanPublishConfirmationInputSchema.parse(input);
  if (parsed.preview.status !== "ready") return { status: "preview_not_ready" };

  const candidate = coachingPlanPublishConfirmationSchema.parse({
    idempotencyKey: parsed.idempotencyKey,
    previewFingerprint: parsed.preview.previewFingerprint,
    scopeFingerprint: parsed.scopeFingerprint,
    confirmationId: parsed.confirmationId,
  });
  if (parsed.existingConfirmation === null) return { status: "confirmed", confirmation: candidate };

  const sameIntent =
    parsed.existingConfirmation.idempotencyKey === candidate.idempotencyKey &&
    parsed.existingConfirmation.previewFingerprint === candidate.previewFingerprint &&
    parsed.existingConfirmation.scopeFingerprint === candidate.scopeFingerprint;
  return sameIntent
    ? { status: "idempotent_replay", confirmation: parsed.existingConfirmation }
    : { status: "idempotency_conflict" };
}
