import { createHash, randomUUID } from "node:crypto";
import {
  formatDateOnlyInTimeZone,
  ianaTimezoneSchema,
  persistedTrainingPlanStructureSchema,
  resolvePrescription,
} from "@repo/core";
import { stringifyCanonicalJson } from "@repo/core/athlete-intelligence";
import {
  PLANNED_SESSION_CONTRACT_VERSION,
  plannedSessionIdempotencyKey,
  plannedSessionSchema,
} from "@repo/core/calendar";
import { prescriptionResolutionManifestSchema, type ResolutionManifest } from "@repo/core/plan";
import {
  activityPlans,
  schema,
  trainingPlanApplicationCommandReceipts,
  trainingPlanApplications,
  trainingPlans,
} from "@repo/db";
import type { DrizzleDbClient } from "@repo/db/client";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  PLANNED_SESSION_CACHE_TAGS,
  plannedSessionCacheTagsSchema,
} from "../../contracts/cache-receipts";
import { type DrizzleQueryExecutor, withProfileFencedRepeatableReadSnapshot } from "../../db";
import { createDrizzlePlannedSessionRepository } from "../../infrastructure/repositories";
import { enqueueWahooPlannedSessionSyncAfterMutation } from "../../lib/provider-sync/planned-activities";
import { toVerifiedResolverCandidates } from "../activity-plans/resolver-candidate";
import { loadPlanningBaseline } from "../athlete-intelligence/load-planning-baseline";
import { cancelPlannedSession } from "../calendar/cancel-planned-session";
import { createPlannedSession } from "../calendar/create-planned-session";
import { materializeAppliedTrainingPlan } from "./schedulingUtils";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hashSchema = z.string().regex(/^v1:sha256:[0-9a-f]{64}$/);
const applicationOptionsSchema = z
  .object({
    trainingPlanId: z.string().uuid(),
    applicationMode: z.enum(["full", "remaining"]).default("full"),
    startDate: dateSchema.optional(),
    targetDate: dateSchema.optional(),
    replacesApplicationId: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.startDate && value.targetDate)
      ctx.addIssue({
        code: "custom",
        path: ["targetDate"],
        message: "Choose a start date or target date, not both.",
      });
    if (value.applicationMode === "remaining" && !value.targetDate)
      ctx.addIssue({
        code: "custom",
        path: ["targetDate"],
        message: "Remaining application requires a target date.",
      });
  });

export const trainingPlanApplicationPreviewInputSchema = applicationOptionsSchema;
export const trainingPlanApplicationApplyInputSchema = applicationOptionsSchema
  .extend({
    operationId: z
      .string()
      .min(32)
      .max(128)
      .regex(/^[A-Za-z0-9_-]+$/),
    expectedPlanRevision: z.number().int().positive(),
    expectedPlanHash: hashSchema,
    basePublishedRevision: z.number().int().nonnegative().nullable(),
    previewFingerprint: hashSchema,
  })
  .strict();

const resolvedSessionSchema = z
  .object({
    sourceSessionId: z.string().uuid(),
    planningDate: dateSchema,
    manifest: prescriptionResolutionManifestSchema,
  })
  .strict();
const applicationStaleSchema = z
  .object({
    status: z.literal("stale"),
    reason: z.enum([
      "plan_unavailable",
      "plan_revision",
      "plan_hash",
      "state_revision",
      "activity_plan_unavailable",
      "preview_drift",
      "not_applicable",
    ]),
    currentPlanRevision: z.number().int().positive().nullable(),
    currentPlanHash: hashSchema.nullable(),
    currentPublishedRevision: z.number().int().nonnegative().nullable(),
  })
  .strict();
export const trainingPlanApplicationPreviewResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("available"),
      planRevision: z.number().int().positive(),
      planHash: hashSchema,
      basePublishedRevision: z.number().int().nonnegative().nullable(),
      previewFingerprint: hashSchema,
      applicable: z.boolean(),
      sessions: z.array(resolvedSessionSchema),
      unresolved: z.array(
        z
          .object({
            sourceSessionId: z.string().uuid(),
            status: z.enum(["needs_input", "unsupported"]),
          })
          .strict(),
      ),
      replacement: z
        .object({
          applicationId: z.string().uuid(),
          applicationRevision: z.number().int().positive(),
          affected: z.array(
            z
              .object({ id: z.string().uuid(), sessionRevision: z.number().int().positive() })
              .strict(),
          ),
        })
        .nullable(),
    })
    .strict(),
  applicationStaleSchema,
]);
export const trainingPlanApplicationApplyResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("applied"),
      applicationId: z.string().uuid(),
      applicationReceipt: z.string().min(1),
      plannedSessionIds: z.array(z.string().uuid()),
      created: z.number().int().nonnegative(),
      replayed: z.number().int().nonnegative(),
      replaced: z.number().int().nonnegative(),
      cacheTags: plannedSessionCacheTagsSchema,
    })
    .strict(),
  z.object({ status: z.literal("operation_conflict") }).strict(),
  applicationStaleSchema,
]);

type ApplicationOptions = z.output<typeof applicationOptionsSchema>;
type StaleReason = z.output<typeof applicationStaleSchema>["reason"];

function applicationCommandFingerprint(
  values: z.output<typeof trainingPlanApplicationApplyInputSchema>,
): string {
  const { operationId: _operationId, ...request } = values;
  return `v1:sha256:${createHash("sha256").update(stringifyCanonicalJson(request)).digest("hex")}`;
}
function stale(
  reason: StaleReason,
  current: {
    revision?: number | null;
    hash?: string | null;
    publishedRevision?: number | null;
  } = {},
) {
  return applicationStaleSchema.parse({
    status: "stale",
    reason,
    currentPlanRevision: current.revision ?? null,
    currentPlanHash: current.hash ?? null,
    currentPublishedRevision: current.publishedRevision ?? null,
  });
}

async function deriveApplication(input: {
  db: DrizzleQueryExecutor;
  profileId: string;
  values: ApplicationOptions;
  now: Date;
  lock: boolean;
  expected?: z.output<typeof trainingPlanApplicationApplyInputSchema>;
}) {
  const planQuery = input.db
    .select({
      id: trainingPlans.id,
      revision: trainingPlans.revision,
      structure: trainingPlans.structure,
      structureHash: trainingPlans.structure_hash,
    })
    .from(trainingPlans)
    .where(
      and(
        eq(trainingPlans.id, input.values.trainingPlanId),
        or(
          eq(trainingPlans.profile_id, input.profileId),
          eq(trainingPlans.is_system_template, true),
          eq(trainingPlans.content_visibility, "public"),
        ),
      ),
    )
    .limit(1);
  const plan = input.lock ? (await planQuery.for("share"))[0] : (await planQuery)[0];
  if (!plan) return stale("plan_unavailable");
  if (input.expected) {
    if (plan.revision !== input.expected.expectedPlanRevision)
      return stale("plan_revision", { revision: plan.revision, hash: plan.structureHash });
    if (plan.structureHash !== input.expected.expectedPlanHash)
      return stale("plan_hash", { revision: plan.revision, hash: plan.structureHash });
  }
  const structure = persistedTrainingPlanStructureSchema.safeParse(plan.structure);
  if (!structure.success)
    return stale("plan_unavailable", { revision: plan.revision, hash: plan.structureHash });
  const [profile] = await input.db
    .select({ planningTimezone: schema.profiles.planning_timezone })
    .from(schema.profiles)
    .where(eq(schema.profiles.id, input.profileId))
    .limit(1);
  const timezone = ianaTimezoneSchema.safeParse(profile?.planningTimezone);
  if (!timezone.success)
    throw new Error("A valid planning timezone is required before applying a training plan.");
  const today = formatDateOnlyInTimeZone(input.now, timezone.data);
  const materialized = materializeAppliedTrainingPlan({
    applicationMode: input.values.applicationMode,
    planningTimezone: timezone.data,
    ...(input.values.startDate === undefined ? {} : { startDate: input.values.startDate }),
    ...(input.values.targetDate === undefined ? {} : { targetDate: input.values.targetDate }),
    structure: structure.data,
    todayDate: today,
  });
  const included = new Map(
    materialized.materializedSessions.map((session) => [
      session.source_path,
      session.scheduled_date,
    ]),
  );
  const baseline = await loadPlanningBaseline({
    db: input.db,
    profileId: input.profileId,
    now: input.now,
  });
  const explicitIds = structure.data.sessions.flatMap((session) =>
    session.activity_plan_id ? [session.activity_plan_id] : [],
  );
  const hasAutomaticSelection = structure.data.sessions.some(
    (session) => session.activity_plan_id === null,
  );
  const candidateScope = or(
    eq(activityPlans.profile_id, input.profileId),
    eq(activityPlans.content_visibility, "public"),
    eq(activityPlans.is_system_template, true),
  );
  const candidateQuery = input.db
    .select()
    .from(activityPlans)
    .where(
      !hasAutomaticSelection && explicitIds.length > 0
        ? and(candidateScope, inArray(activityPlans.id, explicitIds))
        : candidateScope,
    )
    .orderBy(asc(activityPlans.id))
    .limit(1001);
  const rows = input.lock ? await candidateQuery.for("share") : await candidateQuery;
  if (rows.length > 1000 || explicitIds.some((id) => !rows.some((row) => row.id === id)))
    return stale("activity_plan_unavailable", {
      revision: plan.revision,
      hash: plan.structureHash,
    });
  let candidates: ReturnType<typeof toVerifiedResolverCandidates>;
  try {
    candidates = toVerifiedResolverCandidates(
      rows.map((row) => ({
        id: row.id,
        revision: row.revision,
        structure: row.structure,
        structureHash: row.structure_hash,
        semanticHash: row.semantic_hash,
        trainingIntent: row.training_intent,
      })),
      explicitIds,
    );
  } catch {
    return stale("activity_plan_unavailable", {
      revision: plan.revision,
      hash: plan.structureHash,
    });
  }
  const sessions: Array<{
    sourceSessionId: string;
    planningDate: string;
    manifest: ResolutionManifest;
  }> = [];
  const unresolved: Array<{ sourceSessionId: string; status: "needs_input" | "unsupported" }> = [];
  for (const [index, source] of structure.data.sessions.entries()) {
    const planningDate = included.get(`sessions.${index}`);
    if (!planningDate) continue;
    const result = resolvePrescription({
      demand: source.demand,
      activity_plan_id: source.activity_plan_id,
      preferences: structure.data.plan_preferences,
      baseline,
      planning_weekday: new Date(`${planningDate}T00:00:00.000Z`).getUTCDay(),
      candidates: source.activity_plan_id
        ? candidates.filter((candidate) => candidate.id === source.activity_plan_id)
        : candidates,
      provenance: {
        training_plan_id: plan.id,
        training_plan_revision: plan.revision,
        training_plan_hash: plan.structureHash,
      },
    });
    if (result.status === "resolved")
      sessions.push({ sourceSessionId: source.id, planningDate, manifest: result.manifest });
    else unresolved.push({ sourceSessionId: source.id, status: result.status });
  }
  const replacementApplicationId = input.values.replacesApplicationId;
  const replacement = replacementApplicationId
    ? await (async (applicationId: string) => {
        const applicationQuery = input.db
          .select({ applicationRevision: trainingPlanApplications.application_revision })
          .from(trainingPlanApplications)
          .where(
            and(
              eq(trainingPlanApplications.id, applicationId),
              eq(trainingPlanApplications.profile_id, input.profileId),
            ),
          )
          .limit(1);
        const [application] = input.lock
          ? await applicationQuery.for("share")
          : await applicationQuery;
        if (!application) return undefined;
        const rows = await input.db
          .select({
            id: schema.plannedSessions.id,
            sessionRevision: schema.plannedSessions.session_revision,
          })
          .from(schema.plannedSessions)
          .where(
            and(
              eq(schema.plannedSessions.profile_id, input.profileId),
              eq(schema.plannedSessions.training_plan_application_id, applicationId),
              eq(schema.plannedSessions.status, "scheduled"),
              sql`${schema.plannedSessions.planning_date} > ${today}`,
            ),
          )
          .orderBy(asc(schema.plannedSessions.planning_date), asc(schema.plannedSessions.id));
        return {
          applicationId,
          applicationRevision: application.applicationRevision,
          affected: rows,
        };
      })(replacementApplicationId)
    : null;
  if (replacement === undefined)
    return stale("plan_unavailable", { revision: plan.revision, hash: plan.structureHash });
  const replacementAwareFingerprint = `v1:sha256:${createHash("sha256")
    .update(
      stringifyCanonicalJson({
        plan: { id: plan.id, revision: plan.revision, hash: plan.structureHash },
        basePublishedRevision: baseline.status === "available" ? baseline.revision : null,
        materialized: materialized.materializedSessions,
        sessions,
        unresolved,
        replacement,
      }),
    )
    .digest("hex")}`;
  return trainingPlanApplicationPreviewResultSchema.parse({
    status: "available",
    planRevision: plan.revision,
    planHash: plan.structureHash,
    basePublishedRevision: baseline.status === "available" ? baseline.revision : null,
    previewFingerprint: replacementAwareFingerprint,
    applicable: unresolved.length === 0,
    sessions,
    unresolved,
    replacement,
  });
}

export async function previewTrainingPlanApplication(input: {
  db: DrizzleDbClient;
  profileId: string;
  values: z.input<typeof trainingPlanApplicationPreviewInputSchema>;
  now?: Date;
}) {
  return deriveApplication({
    db: input.db,
    profileId: input.profileId,
    values: trainingPlanApplicationPreviewInputSchema.parse(input.values),
    now: input.now ?? new Date(),
    lock: false,
  });
}

export async function applyTrainingPlanApplication(input: {
  db: DrizzleDbClient;
  profileId: string;
  values: z.input<typeof trainingPlanApplicationApplyInputSchema>;
  now?: Date;
}) {
  const values = trainingPlanApplicationApplyInputSchema.parse(input.values);
  const now = input.now ?? new Date();
  return withProfileFencedRepeatableReadSnapshot(input.db, input.profileId, async (tx) => {
    const requestFingerprint = applicationCommandFingerprint(values);
    const [priorReceipt] = await tx
      .select({
        requestFingerprint: trainingPlanApplicationCommandReceipts.request_fingerprint,
        result: trainingPlanApplicationCommandReceipts.result,
      })
      .from(trainingPlanApplicationCommandReceipts)
      .where(
        and(
          eq(trainingPlanApplicationCommandReceipts.profile_id, input.profileId),
          eq(trainingPlanApplicationCommandReceipts.operation_id, values.operationId),
        ),
      )
      .limit(1);
    if (priorReceipt) {
      if (priorReceipt.requestFingerprint !== requestFingerprint)
        return trainingPlanApplicationApplyResultSchema.parse({ status: "operation_conflict" });
      return trainingPlanApplicationApplyResultSchema.parse(priorReceipt.result);
    }
    const preview = await deriveApplication({
      db: tx,
      profileId: input.profileId,
      values,
      now,
      lock: true,
      expected: values,
    });
    if (preview.status !== "available") return preview;
    if (values.basePublishedRevision !== preview.basePublishedRevision)
      return stale("state_revision", {
        revision: preview.planRevision,
        hash: preview.planHash,
        publishedRevision: preview.basePublishedRevision,
      });
    if (!preview.applicable)
      return stale("not_applicable", {
        revision: preview.planRevision,
        hash: preview.planHash,
        publishedRevision: preview.basePublishedRevision,
      });
    if (values.previewFingerprint !== preview.previewFingerprint)
      return stale("preview_drift", {
        revision: preview.planRevision,
        hash: preview.planHash,
        publishedRevision: preview.basePublishedRevision,
      });
    const repository = createDrizzlePlannedSessionRepository(tx);
    const [profile] = await tx
      .select({ planningTimezone: schema.profiles.planning_timezone })
      .from(schema.profiles)
      .where(eq(schema.profiles.id, input.profileId))
      .limit(1);
    const timezone = ianaTimezoneSchema.safeParse(profile?.planningTimezone);
    if (!timezone.success)
      throw new Error("A valid planning timezone is required before applying a training plan.");
    const today = formatDateOnlyInTimeZone(now, timezone.data);
    const [application] = await tx
      .insert(trainingPlanApplications)
      .values({
        profile_id: input.profileId,
        training_plan_id: values.trainingPlanId,
        source_revision: preview.planRevision,
        start_date: values.startDate ?? preview.sessions[0]?.planningDate ?? today,
        planning_timezone: timezone.data,
      })
      .returning({ id: trainingPlanApplications.id });
    if (!application) throw new Error("Unable to create training-plan application");
    let created = 0;
    let replayed = 0;
    const cancelledIds: string[] = [];
    if (preview.replacement)
      for (const session of preview.replacement.affected) {
        const cancelled = await cancelPlannedSession({
          repository,
          profileId: input.profileId,
          sessionId: session.id,
          expectedRevision: session.sessionRevision,
          reason: "plan_replaced",
          cancelledAt: now.toISOString(),
        });
        cancelledIds.push(cancelled.id);
      }
    const publishIds: string[] = [];
    const appliedIds: string[] = [];
    for (const item of preview.sessions) {
      const source = {
        kind: "training_plan" as const,
        applicationId: application.id,
        trainingPlanId: values.trainingPlanId,
        trainingPlanRevision: preview.planRevision,
        sourceSessionId: item.sourceSessionId,
      };
      const result = await createPlannedSession({
        repository,
        profileId: input.profileId,
        session: plannedSessionSchema.parse({
          contractVersion: PLANNED_SESSION_CONTRACT_VERSION,
          id: randomUUID(),
          profileId: input.profileId,
          sessionRevision: 1,
          planningDate: item.planningDate,
          originalTargetDate: item.planningDate,
          source,
          idempotencyKey: plannedSessionIdempotencyKey(source),
          groupEventId: null,
          activityPlanId: item.manifest.activity_plan_id,
          prescription: { resolutionManifest: item.manifest, capturedAt: now.toISOString() },
          lifecycle: { status: "scheduled" },
        }),
      });
      appliedIds.push(result.session.id);
      if (result.status === "created") {
        created += 1;
        publishIds.push(result.session.id);
      } else replayed += 1;
    }
    const publish = await enqueueWahooPlannedSessionSyncAfterMutation({
      db: input.db,
      transaction: tx,
      plannedSessionIds: publishIds,
      operation: "publish",
      profileId: input.profileId,
    });
    if (publish?.success === false)
      throw new Error("Unable to durably enqueue planned-session provider publication");
    const unsync = await enqueueWahooPlannedSessionSyncAfterMutation({
      db: input.db,
      transaction: tx,
      plannedSessionIds: cancelledIds,
      operation: "unsync",
      profileId: input.profileId,
    });
    if (unsync?.success === false)
      throw new Error("Unable to durably enqueue planned-session provider cleanup");
    const result = trainingPlanApplicationApplyResultSchema.parse({
      status: "applied",
      applicationId: application.id,
      applicationReceipt: application.id,
      plannedSessionIds: appliedIds,
      created,
      replayed,
      replaced: cancelledIds.length,
      cacheTags: PLANNED_SESSION_CACHE_TAGS,
    });
    await tx.insert(trainingPlanApplicationCommandReceipts).values({
      profile_id: input.profileId,
      operation_id: values.operationId,
      command: values.replacesApplicationId ? "update" : "apply",
      request_fingerprint: requestFingerprint,
      application_id: application.id,
      result,
    });
    return result;
  });
}
