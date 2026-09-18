import { createHash, randomUUID } from "node:crypto";
import {
  ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
  addDaysDateOnlyUtc,
  DRAFT_PLAN_PROJECTION_ALGORITHM_VERSION,
  derivePlanGoalReadinessContext,
  ianaTimezoneSchema,
  MAX_PLAN_SIMULATION_SESSIONS,
  missingPlanningInputSchema,
  planSimulationResultSchema,
  prescriptionResolutionManifestSchema,
  resolutionFailureSchema,
  resolvePlanReadinessHorizon,
  resolvePrescription,
  scheduledDateTimeToIsoInstant,
  simulateTrainingPlan,
  trainingPlanCreateSchema,
  trainingPlanSchema,
} from "@repo/core";
import { stringifyCanonicalJson } from "@repo/core/athlete-intelligence";
import { plannedSessionIdempotencyKey, plannedSessionSchema } from "@repo/core/calendar";
import {
  activityPlans,
  profiles,
  schema,
  trainingPlanApplicationCommandReceipts,
  trainingPlans,
} from "@repo/db";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  type DrizzleQueryExecutor,
  type getRequiredDb,
  withProfileFencedRepeatableReadSnapshot,
} from "../../db";
import { createContentAccessPermissions } from "../../permissions/content-access";
import { toVerifiedResolverCandidates } from "../activity-plans/resolver-candidate";
import { activityPlanStructureHash } from "../activity-plans/structure-hash";
import { readAthleteReadModel } from "../athlete-intelligence/athlete-read-model";
import { loadPlanningBaseline } from "../athlete-intelligence/load-planning-baseline";

type DbClient = ReturnType<typeof getRequiredDb>;

export const resolveAuthoritativePlanReadinessHorizon = resolvePlanReadinessHorizon;

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const structureHashSchema = z.string().regex(/^v1:sha256:[0-9a-f]{64}$/);
const resolutionFingerprintSchema = z.string().regex(/^v1:sha256:[0-9a-f]{64}$/);
const contentVisibilitySchema = z.enum(["private", "followers", "public"]);
const operationIdSchema = z
  .string()
  .min(32)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

const trainingPlanPreviewSessionResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      sourceSessionId: z.string().uuid(),
      planningDate: dateKeySchema,
      status: z.literal("resolved"),
      manifest: prescriptionResolutionManifestSchema,
    })
    .strict(),
  z
    .object({
      sourceSessionId: z.string().uuid(),
      planningDate: dateKeySchema,
      status: z.literal("needs_input"),
      missing: z.array(missingPlanningInputSchema).min(1),
    })
    .strict(),
  z
    .object({
      sourceSessionId: z.string().uuid(),
      planningDate: dateKeySchema,
      status: z.literal("unsupported"),
      reasons: z.array(resolutionFailureSchema).min(1),
    })
    .strict(),
]);

const editableTemplateDraftSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    description: z.string().max(1000).nullable().optional(),
    contentVisibility: contentVisibilitySchema.optional(),
    structure: trainingPlanCreateSchema,
    previewStartDate: dateKeySchema,
  })
  .strict();

const updateTemplateDraftSchema = editableTemplateDraftSchema
  .extend({
    planId: z.string().uuid(),
    expectedRevision: z.number().int().positive(),
    expectedStructureHash: structureHashSchema,
  })
  .strict();

const duplicateTemplateDraftSchema = z
  .object({
    sourcePlanId: z.string().uuid(),
    name: z.string().trim().min(1).max(255).optional(),
    previewStartDate: dateKeySchema,
  })
  .strict();

const createOperationSchema = z.object({
  kind: z.literal("create"),
  draft: editableTemplateDraftSchema,
});
const updateOperationSchema = z.object({
  kind: z.literal("update"),
  draft: updateTemplateDraftSchema,
});
const duplicateOperationSchema = z.object({
  kind: z.literal("duplicate"),
  draft: duplicateTemplateDraftSchema,
});

export const trainingPlanPreviewInputSchema = z.discriminatedUnion("kind", [
  createOperationSchema.strict(),
  updateOperationSchema.strict(),
  duplicateOperationSchema.strict(),
]);

export const trainingPlanCommitInputSchema = z.discriminatedUnion("kind", [
  createOperationSchema
    .extend({
      operationId: operationIdSchema,
      basePublishedRevision: z.number().int().nonnegative().nullable(),
      previewFingerprint: resolutionFingerprintSchema,
    })
    .strict(),
  updateOperationSchema
    .extend({
      operationId: operationIdSchema,
      basePublishedRevision: z.number().int().nonnegative().nullable(),
      previewFingerprint: resolutionFingerprintSchema,
    })
    .strict(),
  duplicateOperationSchema
    .extend({
      operationId: operationIdSchema,
      basePublishedRevision: z.number().int().nonnegative().nullable(),
      previewFingerprint: resolutionFingerprintSchema,
    })
    .strict(),
]);

const planOperationStaleReasonSchema = z.enum([
  "state_revision",
  "plan_unavailable",
  "plan_revision",
  "plan_structure",
  "linked_plan_unavailable",
  "preview_drift",
]);

const planOperationStaleResultSchema = z
  .object({
    status: z.literal("stale"),
    reason: planOperationStaleReasonSchema,
    currentPublishedRevision: z.number().int().nonnegative().nullable(),
    currentPlanRevision: z.number().int().positive().nullable(),
    currentPlanStructureHash: structureHashSchema.nullable(),
  })
  .strict();

export const trainingPlanPreviewResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("available"),
      basePublishedRevision: z.number().int().nonnegative().nullable(),
      previewFingerprint: resolutionFingerprintSchema,
      simulation: planSimulationResultSchema,
      applicable: z.boolean(),
      sessionResults: z.array(trainingPlanPreviewSessionResultSchema),
      explanations: z.array(z.string().min(1).max(240)),
      unresolvedInputs: z.array(
        z
          .object({
            sourceSessionId: z.string().uuid(),
            status: z.enum(["needs_input", "unsupported"]),
            codes: z.array(z.string().min(1)),
            messages: z.array(z.string().min(1).max(240)),
          })
          .strict(),
      ),
    })
    .strict(),
  planOperationStaleResultSchema,
]);

export const trainingPlanCommitResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("saved"),
      kind: z.enum(["create", "update", "duplicate"]),
      planId: z.string().uuid(),
      planRevision: z.number().int().positive(),
      planStructureHash: structureHashSchema,
      publishedRevision: z.number().int().nonnegative().nullable(),
      previewFingerprint: resolutionFingerprintSchema,
      validatedAt: z.string().datetime({ offset: true }),
      simulation: planSimulationResultSchema,
    })
    .strict(),
  planOperationStaleResultSchema,
  z.object({ status: z.literal("operation_conflict") }).strict(),
]);

function commitRequestFingerprint(values: z.output<typeof trainingPlanCommitInputSchema>) {
  const { operationId: _operationId, ...request } = values;
  return `v1:sha256:${createHash("sha256").update(stringifyCanonicalJson(request)).digest("hex")}`;
}

type PlanOperationStaleResult = z.infer<typeof planOperationStaleResultSchema>;
type ResolvedDraft = {
  kind: "create" | "update" | "duplicate";
  planId: string;
  name: string;
  description: string | null;
  contentVisibility?: "private" | "followers" | "public";
  structure: z.infer<typeof trainingPlanSchema>;
  previewStartDate: string;
  currentPlanRevision: number | null;
  currentPlanStructureHash: string | null;
};

export function hasPublishedRevisionConflict(input: {
  currentPublishedRevision: number | null;
  expectedPublishedRevision: number | null | undefined;
}) {
  return (
    input.expectedPublishedRevision != null &&
    input.currentPublishedRevision !== input.expectedPublishedRevision
  );
}

function staleResult(input: {
  reason: z.infer<typeof planOperationStaleReasonSchema>;
  currentPublishedRevision?: number | null;
  currentPlanRevision?: number | null;
  currentPlanStructureHash?: string | null;
}): PlanOperationStaleResult {
  return planOperationStaleResultSchema.parse({
    status: "stale",
    currentPublishedRevision: null,
    currentPlanRevision: null,
    currentPlanStructureHash: null,
    ...input,
  });
}

async function readSourcePlan(input: {
  db: DrizzleQueryExecutor;
  profileId: string;
  sourcePlanId: string;
  lock?: boolean;
}) {
  await createContentAccessPermissions(input.db as never).requireRead(
    input.profileId,
    { type: "training_plan", id: input.sourcePlanId },
    "Training plan not found",
  );
  let query = input.db
    .select({
      id: trainingPlans.id,
      name: trainingPlans.name,
      description: trainingPlans.description,
      structure: trainingPlans.structure,
      revision: trainingPlans.revision,
      structureHash: trainingPlans.structure_hash,
    })
    .from(trainingPlans)
    .where(eq(trainingPlans.id, input.sourcePlanId))
    .limit(1);
  if (input.lock) query = query.for("share") as typeof query;
  return (await query)[0] ?? null;
}

async function resolveDraft(input: {
  db: DrizzleQueryExecutor;
  profileId: string;
  values: z.infer<typeof trainingPlanPreviewInputSchema>;
  lock?: boolean;
  createPlanId?: string;
}): Promise<ResolvedDraft | PlanOperationStaleResult> {
  if (input.values.kind === "duplicate") {
    const source = await readSourcePlan({
      db: input.db,
      profileId: input.profileId,
      sourcePlanId: input.values.draft.sourcePlanId,
      ...(input.lock === undefined ? {} : { lock: input.lock }),
    });
    if (!source) return staleResult({ reason: "plan_unavailable" });
    const parsed = trainingPlanSchema.safeParse(source.structure);
    if (!parsed.success) return staleResult({ reason: "plan_structure" });
    const { id: _sourceId, ...template } = parsed.data;
    const planId = input.createPlanId ?? "00000000-0000-4000-8000-000000000001";
    return {
      kind: "duplicate",
      planId,
      name: input.values.draft.name ?? `${source.name} (Copy)`,
      description: source.description,
      contentVisibility: "private",
      structure: trainingPlanSchema.parse({ ...template, id: planId }),
      previewStartDate: input.values.draft.previewStartDate,
      currentPlanRevision: source.revision,
      currentPlanStructureHash: source.structureHash,
    };
  }

  const planId =
    input.values.kind === "update"
      ? input.values.draft.planId
      : (input.createPlanId ?? "00000000-0000-4000-8000-000000000001");
  return {
    kind: input.values.kind,
    planId,
    name: input.values.draft.name,
    description: input.values.draft.description ?? null,
    ...(input.values.draft.contentVisibility === undefined
      ? {}
      : { contentVisibility: input.values.draft.contentVisibility }),
    structure: trainingPlanSchema.parse({ ...input.values.draft.structure, id: planId }),
    previewStartDate: input.values.draft.previewStartDate,
    currentPlanRevision:
      input.values.kind === "update" ? input.values.draft.expectedRevision : null,
    currentPlanStructureHash:
      input.values.kind === "update" ? input.values.draft.expectedStructureHash : null,
  };
}

async function deriveProjection(input: {
  db: DrizzleQueryExecutor;
  profileId: string;
  draft: ResolvedDraft;
  expectedPublishedRevision?: number | null;
  now: Date;
  lockAuthority: boolean;
}) {
  if (input.draft.structure.sessions.length > MAX_PLAN_SIMULATION_SESSIONS)
    return staleResult({ reason: "plan_structure" });
  const readModel = await readAthleteReadModel({
    db: input.db,
    profileId: input.profileId,
    sections: {
      publishedState: true,
      status: true,
      currentBaseline: { includePlanningContext: false },
    },
    now: input.now,
    lockStateForUpdate: input.lockAuthority,
  });
  if (
    hasPublishedRevisionConflict({
      currentPublishedRevision: readModel.publishedRevision,
      expectedPublishedRevision: input.expectedPublishedRevision,
    })
  )
    return staleResult({
      reason: "state_revision",
      currentPublishedRevision: readModel.publishedRevision,
      currentPlanRevision: input.draft.currentPlanRevision,
      currentPlanStructureHash: input.draft.currentPlanStructureHash,
    });
  const planningTimezone =
    ianaTimezoneSchema.safeParse(readModel.currentBaseline?.planningTimezone).data ?? "UTC";
  const baseline = await loadPlanningBaseline({
    db: input.db,
    profileId: input.profileId,
    now: input.now,
  });
  const explicitIds = new Set(
    input.draft.structure.sessions.flatMap((session) =>
      session.activity_plan_id ? [session.activity_plan_id] : [],
    ),
  );
  const hasAutomaticSelection = input.draft.structure.sessions.some(
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
      !hasAutomaticSelection && explicitIds.size > 0
        ? and(candidateScope, inArray(activityPlans.id, [...explicitIds]))
        : candidateScope,
    )
    .orderBy(activityPlans.id)
    .limit(1001);
  const lockableCandidateQuery = candidateQuery as typeof candidateQuery & {
    for?: (strength: "share") => typeof candidateQuery;
  };
  const rows = await (input.lockAuthority && lockableCandidateQuery.for
    ? lockableCandidateQuery.for("share")
    : candidateQuery);
  if (rows.length > 1000 || [...explicitIds].some((id) => !rows.some((row) => row.id === id)))
    return staleResult({
      reason: "linked_plan_unavailable",
      currentPublishedRevision: readModel.publishedRevision,
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
        adaptation: row.adaptation,
        trainingIntent: row.training_intent,
      })),
      [...explicitIds],
    );
  } catch {
    return staleResult({
      reason: "linked_plan_unavailable",
      currentPublishedRevision: readModel.publishedRevision,
    });
  }
  const simulatedSessions: Array<{
    kind: "projected";
    sourceId: string;
    scheduledAt: string;
    activityCategory: "bike" | "other" | "run" | "strength" | "swim";
    commonLoad: number;
  }> = [];
  const sessionResults: z.output<typeof trainingPlanPreviewSessionResultSchema>[] = [];
  for (const session of input.draft.structure.sessions) {
    const planningDate = addDaysDateOnlyUtc(input.draft.previewStartDate, session.offset_days);
    const resolution = resolvePrescription({
      demand: session.demand,
      activity_plan_id: session.activity_plan_id,
      preferences: input.draft.structure.plan_preferences,
      baseline,
      planning_weekday: new Date(
        `${addDaysDateOnlyUtc(input.draft.previewStartDate, session.offset_days)}T00:00:00.000Z`,
      ).getUTCDay(),
      candidates: session.activity_plan_id
        ? candidates.filter((candidate) => candidate.id === session.activity_plan_id)
        : candidates,
      provenance:
        input.draft.kind === "update" && input.draft.currentPlanRevision
          ? {
              training_plan_id: input.draft.planId,
              training_plan_revision: input.draft.currentPlanRevision + 1,
              training_plan_hash: activityPlanStructureHash(input.draft.structure),
            }
          : undefined,
    });
    if (resolution.status !== "resolved") {
      sessionResults.push({ sourceSessionId: session.id, planningDate, ...resolution });
      continue;
    }
    const prospectiveRevision =
      input.draft.kind === "update" ? (input.draft.currentPlanRevision ?? 0) + 1 : 1;
    plannedSessionSchema.parse({
      contractVersion: "planned-session-v1",
      id: session.id,
      profileId: input.profileId,
      sessionRevision: 1,
      planningDate,
      originalTargetDate: planningDate,
      source: {
        kind: "training_plan",
        trainingPlanId: input.draft.planId,
        trainingPlanRevision: prospectiveRevision,
        sourceSessionId: session.id,
      },
      idempotencyKey: plannedSessionIdempotencyKey({
        kind: "training_plan",
        trainingPlanId: input.draft.planId,
        trainingPlanRevision: prospectiveRevision,
        sourceSessionId: session.id,
      }),
      groupEventId: null,
      prescription: {
        resolutionManifest: resolution.manifest,
        capturedAt: input.now.toISOString(),
      },
      lifecycle: { status: "scheduled" },
    });
    sessionResults.push({
      sourceSessionId: session.id,
      planningDate,
      status: "resolved",
      manifest: resolution.manifest,
    });
    if (
      resolution.manifest.prescription_estimate.common_load.status === "complete" &&
      resolution.manifest.prescription_estimate.common_load.value !== null
    )
      simulatedSessions.push({
        kind: "projected",
        sourceId: session.id,
        scheduledAt: scheduledDateTimeToIsoInstant({
          scheduledDate: planningDate,
          time: session.event_overrides?.start_time ?? "00:00",
          timeZone: planningTimezone,
        }),
        activityCategory: session.demand.activity_category,
        commonLoad: resolution.manifest.prescription_estimate.common_load.value,
      });
  }
  const simulationBaseline = readModel.currentBaseline?.baseline ?? {
    contractVersion: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
    athleteId: input.profileId,
    stateRevision: 0,
    asOf: input.now.toISOString(),
    longTermLoad: 0,
    recentLoad: 0,
    loadBalance: 0,
    evidenceConfidence: 0,
    capabilities: [],
    athleteAgeYears: null,
  };
  const futureSimulatedSessions = simulatedSessions.filter(
    (session) => Date.parse(session.scheduledAt) >= Date.parse(simulationBaseline.asOf),
  );
  const goal = derivePlanGoalReadinessContext({
    planId: input.draft.planId,
    structure: input.draft.structure,
    planningTimezone,
    startDate: input.draft.previewStartDate,
  });
  const simulation = simulateTrainingPlan({
    baseline: simulationBaseline,
    plannedSessions: futureSimulatedSessions,
    simulationAt: resolveAuthoritativePlanReadinessHorizon({
      baselineAsOf: simulationBaseline.asOf,
      plannedSessions: futureSimulatedSessions,
      goal,
    }),
    planningTimezone,
    goal,
  });
  const { id: _draftPlanId, ...fingerprintedPlan } = input.draft.structure;
  const orderedSessionResults = sessionResults;
  const unresolvedInputs = orderedSessionResults.flatMap((result) =>
    result.status === "resolved"
      ? []
      : [
          {
            sourceSessionId: result.sourceSessionId,
            status: result.status,
            codes:
              result.status === "needs_input"
                ? result.missing.map((item) => item.code)
                : result.reasons.map((item) => item.code),
            messages:
              result.status === "needs_input"
                ? result.missing.map((item) => item.message)
                : result.reasons.map((item) => item.message),
          },
        ],
  );
  const explanations = unresolvedInputs.flatMap((result) => result.messages);
  const resolvedInputs = orderedSessionResults.flatMap((result) =>
    result.status === "resolved"
      ? [
          {
            sourceSessionId: result.sourceSessionId,
            planningDate: result.planningDate,
            activityPlanId: result.manifest.activity_plan_id,
            activityPlanRevision: result.manifest.activity_plan_revision,
            activityPlanSemanticHash: result.manifest.activity_plan_semantic_hash,
            prescriptionFingerprint: result.manifest.fingerprint,
          },
        ]
      : [],
  );
  const previewFingerprint = `v1:sha256:${createHash("sha256")
    .update(
      stringifyCanonicalJson({
        draft: {
          kind: input.draft.kind,
          name: input.draft.name,
          description: input.draft.description,
          contentVisibility: input.draft.contentVisibility ?? null,
          structure: fingerprintedPlan,
          previewStartDate: input.draft.previewStartDate,
          currentPlanRevision:
            input.draft.kind === "update" ? input.draft.currentPlanRevision : null,
          currentPlanStructureHash:
            input.draft.kind === "update" ? input.draft.currentPlanStructureHash : null,
        },
        publishedRevision: readModel.publishedRevision,
        baseline:
          baseline.status === "available"
            ? { status: baseline.status, revision: baseline.revision }
            : { status: baseline.status },
        resolvedInputs,
        unresolvedInputs,
      }),
    )
    .digest("hex")}`;
  return {
    status: "available" as const,
    publishedRevision: readModel.publishedRevision,
    simulation,
    previewFingerprint,
    applicable: unresolvedInputs.length === 0,
    sessionResults: orderedSessionResults,
    explanations,
    unresolvedInputs,
  };
}

export async function previewTrainingPlan(input: {
  db: DbClient;
  profileId: string;
  values: z.input<typeof trainingPlanPreviewInputSchema>;
  now?: Date;
}) {
  const values = trainingPlanPreviewInputSchema.parse(input.values);
  const draft = await resolveDraft({ db: input.db, profileId: input.profileId, values });
  if ("status" in draft) return draft;
  const projection = await deriveProjection({
    db: input.db,
    profileId: input.profileId,
    draft,
    now: input.now ?? new Date(),
    lockAuthority: false,
  });
  return projection.status === "available"
    ? trainingPlanPreviewResultSchema.parse({
        status: "available",
        basePublishedRevision: projection.publishedRevision,
        previewFingerprint: projection.previewFingerprint,
        simulation: projection.simulation,
        applicable: projection.applicable,
        sessionResults: projection.sessionResults,
        explanations: projection.explanations,
        unresolvedInputs: projection.unresolvedInputs,
      })
    : projection;
}

export async function commitTrainingPlan(input: {
  db: DbClient;
  profileId: string;
  values: z.input<typeof trainingPlanCommitInputSchema>;
  now?: Date;
}) {
  const values = trainingPlanCommitInputSchema.parse(input.values);
  const now = input.now ?? new Date();
  return withProfileFencedRepeatableReadSnapshot(
    input.db,
    // Establish the profile fence before PostgreSQL fixes the repeatable-read snapshot.
    input.profileId,
    async (tx) => {
      const requestFingerprint = commitRequestFingerprint(values);
      const [receipt] = await tx
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
      if (receipt) {
        if (receipt.requestFingerprint !== requestFingerprint)
          return trainingPlanCommitResultSchema.parse({ status: "operation_conflict" });
        return trainingPlanCommitResultSchema.parse(receipt.result);
      }
      let currentPlanRevision: number | null = null;
      let currentPlanStructureHash: string | null = null;
      if (values.kind === "update") {
        const [current] = await tx
          .select({ revision: trainingPlans.revision, structureHash: trainingPlans.structure_hash })
          .from(trainingPlans)
          .where(
            and(
              eq(trainingPlans.id, values.draft.planId),
              eq(trainingPlans.profile_id, input.profileId),
            ),
          )
          .limit(1)
          .for("update");
        if (!current) return staleResult({ reason: "plan_unavailable" });
        currentPlanRevision = current.revision;
        currentPlanStructureHash = current.structureHash;
        if (
          current.revision !== values.draft.expectedRevision ||
          current.structureHash !== values.draft.expectedStructureHash
        )
          return staleResult({
            reason:
              current.revision !== values.draft.expectedRevision
                ? "plan_revision"
                : "plan_structure",
            currentPlanRevision,
            currentPlanStructureHash,
          });
      }
      const operationValues = trainingPlanPreviewInputSchema.parse({
        kind: values.kind,
        draft: values.draft,
      });
      const draft = await resolveDraft({
        db: tx,
        profileId: input.profileId,
        values: operationValues,
        lock: true,
      });
      if ("status" in draft) return draft;
      draft.currentPlanRevision = currentPlanRevision ?? draft.currentPlanRevision;
      draft.currentPlanStructureHash = currentPlanStructureHash ?? draft.currentPlanStructureHash;
      const projection = await deriveProjection({
        db: tx,
        profileId: input.profileId,
        draft,
        expectedPublishedRevision: values.basePublishedRevision,
        now,
        lockAuthority: true,
      });
      if (projection.status !== "available") return projection;
      if (!projection.applicable)
        return staleResult({
          reason: "plan_structure",
          currentPublishedRevision: projection.publishedRevision,
          currentPlanRevision,
          currentPlanStructureHash,
        });
      if (values.previewFingerprint !== projection.previewFingerprint)
        return staleResult({
          reason: "preview_drift",
          currentPublishedRevision: projection.publishedRevision,
          currentPlanRevision,
          currentPlanStructureHash,
        });
      let structureHash = activityPlanStructureHash(draft.structure);
      let savedRevision: number;
      if (values.kind === "update") {
        const [saved] = await tx
          .update(trainingPlans)
          .set({
            name: draft.name,
            description: draft.description,
            ...(draft.contentVisibility === undefined
              ? {}
              : { content_visibility: draft.contentVisibility }),
            structure: draft.structure,
            structure_hash: structureHash,
            revision: sql`${trainingPlans.revision} + 1`,
            validated_state_revision: projection.publishedRevision,
            validated_at: now,
            projection_algorithm_version: DRAFT_PLAN_PROJECTION_ALGORITHM_VERSION,
            updated_at: now,
          })
          .where(
            and(
              eq(trainingPlans.id, draft.planId),
              eq(trainingPlans.profile_id, input.profileId),
              eq(trainingPlans.revision, values.draft.expectedRevision),
              eq(trainingPlans.structure_hash, values.draft.expectedStructureHash),
            ),
          )
          .returning({ revision: trainingPlans.revision });
        if (!saved)
          return staleResult({
            reason: "plan_revision",
            currentPublishedRevision: projection.publishedRevision,
            currentPlanRevision,
            currentPlanStructureHash,
          });
        savedRevision = saved.revision;
      } else {
        const persistedPlanId = randomUUID();
        const persistedStructure = trainingPlanSchema.parse({
          ...draft.structure,
          id: persistedPlanId,
        });
        const persistedStructureHash = activityPlanStructureHash(persistedStructure);
        let visibility = draft.contentVisibility;
        if (visibility === undefined) {
          const [profile] = await tx
            .select({ visibility: profiles.default_content_visibility })
            .from(profiles)
            .where(eq(profiles.id, input.profileId))
            .limit(1);
          if (!profile) throw new Error("Profile not found");
          visibility = profile.visibility;
        }
        const [saved] = await tx
          .insert(trainingPlans)
          .values({
            id: persistedPlanId,
            profile_id: input.profileId,
            name: draft.name,
            description: draft.description,
            content_visibility: visibility,
            structure: persistedStructure,
            structure_hash: persistedStructureHash,
            validated_state_revision: projection.publishedRevision,
            validated_at: now,
            projection_algorithm_version: DRAFT_PLAN_PROJECTION_ALGORITHM_VERSION,
            updated_at: now,
          })
          .returning({ revision: trainingPlans.revision });
        if (!saved) throw new Error("Failed to save training plan");
        savedRevision = saved.revision;
        draft.planId = persistedPlanId;
        draft.structure = persistedStructure;
        structureHash = persistedStructureHash;
      }
      const result = trainingPlanCommitResultSchema.parse({
        status: "saved",
        kind: values.kind,
        planId: draft.planId,
        planRevision: savedRevision,
        planStructureHash: structureHash,
        publishedRevision: projection.publishedRevision,
        previewFingerprint: projection.previewFingerprint,
        validatedAt: now.toISOString(),
        simulation: projection.simulation,
      });
      await tx.insert(trainingPlanApplicationCommandReceipts).values({
        profile_id: input.profileId,
        operation_id: values.operationId,
        command: "save_plan",
        request_fingerprint: requestFingerprint,
        application_id: null,
        result,
      });
      return result;
    },
  );
}

export async function getTrainingPlanEditorMetadata(input: {
  db: DrizzleQueryExecutor;
  profileId: string;
  plan: {
    id: string;
    profile_id: string | null;
    revision: number;
    structure: unknown;
    structure_hash: string;
    validated_state_revision: number | null;
    validated_at: Date | null;
    projection_algorithm_version: string | null;
  };
}) {
  if (input.plan.profile_id !== input.profileId) return null;
  const parsed = trainingPlanSchema.safeParse(input.plan.structure);
  const [nextPlannedSession] = await input.db
    .select({
      planningDate: schema.plannedSessions.planning_date,
      trainingPlanRevision: schema.plannedSessions.training_plan_revision,
    })
    .from(schema.plannedSessions)
    .where(
      and(
        eq(schema.plannedSessions.profile_id, input.profileId),
        eq(schema.plannedSessions.training_plan_id, input.plan.id),
        eq(schema.plannedSessions.status, "scheduled"),
      ),
    )
    .orderBy(asc(schema.plannedSessions.planning_date), asc(schema.plannedSessions.id))
    .limit(1);
  const readModel = await readAthleteReadModel({
    db: input.db,
    profileId: input.profileId,
    sections: { status: true },
  });
  const validationStatus =
    !readModel.publishedRevision || readModel.status?.freshness !== "fresh"
      ? "unavailable"
      : input.plan.validated_state_revision === null
        ? "unvalidated"
        : input.plan.validated_state_revision === readModel.publishedRevision &&
            input.plan.projection_algorithm_version === DRAFT_PLAN_PROJECTION_ALGORITHM_VERSION
          ? "current"
          : "stale";
  return {
    revision: input.plan.revision,
    structureHash: input.plan.structure_hash,
    validation: {
      status: validationStatus,
      validatedStateRevision: input.plan.validated_state_revision,
      validatedAt: input.plan.validated_at?.toISOString() ?? null,
      projectionAlgorithmVersion: input.plan.projection_algorithm_version,
      currentPublishedRevision: readModel.publishedRevision,
    },
    template: {
      sessionCount: parsed.success ? parsed.data.sessions.length : 0,
      spanDays: parsed.success
        ? parsed.data.sessions.length === 0
          ? 0
          : Math.max(...parsed.data.sessions.map((session) => session.offset_days)) + 1
        : 0,
      preferredWeekdays: parsed.success ? parsed.data.plan_preferences.preferred_weekdays : [],
    },
    schedule: {
      applicationReceipt: nextPlannedSession
        ? `${input.plan.id}:${nextPlannedSession.trainingPlanRevision}`
        : null,
      nextScheduledDate: nextPlannedSession?.planningDate ?? null,
    },
  };
}
