import { randomUUID } from "node:crypto";
import {
  DRAFT_PLAN_PROJECTION_ALGORITHM_VERSION,
  deriveDraftPlanProjection,
  derivePlanGoalReadinessContext,
  deriveProjectedPlanStimuli,
  ianaTimezoneSchema,
  MAX_PLAN_SIMULATION_SESSIONS,
  type ProjectedTrainingStimulus,
  planSimulationResultSchema,
  resolvePlanReadinessHorizon,
  trainingPlanCreateSchema,
  trainingPlanSchema,
} from "@repo/core";
import { activityPlans, events, profiles, trainingPlans } from "@repo/db";
import { and, asc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  type DrizzleQueryExecutor,
  type DrizzleTransactionClient,
  type getRequiredDb,
  withProfileFencedRepeatableReadSnapshot,
} from "../../db";
import { createContentAccessPermissions } from "../../permissions/content-access";
import { estimateActivityPlans } from "../activity-plans/estimate-activity-plans";
import { activityPlanStructureHash } from "../activity-plans/structure-hash";
import { readAthleteReadModel } from "../athlete-intelligence/athlete-read-model";
import { requirePublishedLinkedActivityPlans } from "./mutationUseCases";

type DbClient = ReturnType<typeof getRequiredDb>;

export const resolveAuthoritativePlanReadinessHorizon = resolvePlanReadinessHorizon;

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const structureHashSchema = z.string().regex(/^v1:sha256:[0-9a-f]{64}$/);
const contentVisibilitySchema = z.enum(["private", "followers", "public"]);

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
  createOperationSchema.extend({ basePublishedRevision: z.number().int().nonnegative() }).strict(),
  updateOperationSchema.extend({ basePublishedRevision: z.number().int().nonnegative() }).strict(),
  duplicateOperationSchema
    .extend({ basePublishedRevision: z.number().int().nonnegative() })
    .strict(),
]);

const planOperationStaleReasonSchema = z.enum([
  "state_unavailable",
  "state_revision",
  "plan_unavailable",
  "plan_revision",
  "plan_structure",
  "linked_plan_unavailable",
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
      basePublishedRevision: z.number().int().nonnegative(),
      simulation: planSimulationResultSchema,
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
      publishedRevision: z.number().int().nonnegative(),
      validatedAt: z.string().datetime({ offset: true }),
      simulation: planSimulationResultSchema,
    })
    .strict(),
  planOperationStaleResultSchema,
]);

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

type PersistedPlanStimuliDerivation =
  | {
      status: "available";
      sessions: ProjectedTrainingStimulus[];
      planningTimezone: string;
      activityPlans: Array<{
        activityPlanId: string;
        activityCategory: "bike" | "other" | "run" | "strength" | "swim";
        commonLoad: number;
      }>;
    }
  | {
      status: "unavailable";
      reason:
        | "too_many_sessions"
        | "missing_profile"
        | "missing_schedule"
        | "missing_activity_plan"
        | "activity_plan_structure"
        | "load_unavailable";
    };

export async function derivePersistedPlanStimuli(input: {
  db: DrizzleQueryExecutor;
  profileId: string;
  planId: string;
  structure: z.infer<typeof trainingPlanSchema>;
  startDate: string;
  baselineAsOf: string;
  now: Date;
  planningTimezone?: string;
}): Promise<PersistedPlanStimuliDerivation> {
  if (input.structure.sessions.length > MAX_PLAN_SIMULATION_SESSIONS)
    return { status: "unavailable", reason: "too_many_sessions" };
  let planningTimezone = input.planningTimezone;
  if (!planningTimezone) {
    const [profile] = await input.db
      .select({ planningTimezone: profiles.planning_timezone })
      .from(profiles)
      .where(eq(profiles.id, input.profileId))
      .limit(1);
    if (!profile) return { status: "unavailable", reason: "missing_profile" };
    const parsedTimezone = ianaTimezoneSchema.safeParse(profile.planningTimezone);
    planningTimezone = parsedTimezone.success ? parsedTimezone.data : "UTC";
  }
  const activityPlanIds = [
    ...new Set(input.structure.sessions.map((session) => session.activity_plan_id)),
  ];
  const rows = await input.db
    .select()
    .from(activityPlans)
    .where(inArray(activityPlans.id, activityPlanIds));
  if (rows.length !== activityPlanIds.length)
    return { status: "unavailable", reason: "missing_activity_plan" };
  if (rows.some((row) => activityPlanStructureHash(row.structure) !== row.structure_hash))
    return { status: "unavailable", reason: "activity_plan_structure" };
  const estimated = await estimateActivityPlans(rows, input.db, input.profileId, {
    asOf: input.now,
  });
  const facts = estimated.map((plan) => {
    const load = plan.prescriptionQuantification.summary.commonLoad;
    if (load.status !== "complete") return null;
    return {
      activityPlanId: plan.id,
      activityCategory:
        plan.prescriptionQuantification.members[0]?.activity_category ?? ("other" as const),
      commonLoad: load.load,
    };
  });
  if (facts.some((fact) => fact === null))
    return { status: "unavailable", reason: "load_unavailable" };
  const activityPlanFacts = facts.filter((fact): fact is NonNullable<typeof fact> => fact !== null);
  const derivation = deriveProjectedPlanStimuli({
    planId: input.planId,
    structure: input.structure,
    activityPlans: activityPlanFacts,
    planningTimezone,
    startDate: input.startDate,
    notBefore: new Date(
      Math.max(input.now.getTime(), Date.parse(input.baselineAsOf)),
    ).toISOString(),
  });
  return derivation.status === "available"
    ? { ...derivation, planningTimezone, activityPlans: activityPlanFacts }
    : { status: "unavailable", reason: derivation.reason };
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

async function lockReferencedActivityPlans(input: {
  tx: DrizzleTransactionClient;
  profileId: string;
  structure: z.infer<typeof trainingPlanSchema>;
}) {
  const ids = [...new Set(input.structure.sessions.map((session) => session.activity_plan_id))];
  const rows = await input.tx
    .select({
      gpsRecordingEnabled: activityPlans.gps_recording_enabled,
      id: activityPlans.id,
      isSystemTemplate: activityPlans.is_system_template,
      structure: activityPlans.structure,
      structureHash: activityPlans.structure_hash,
    })
    .from(activityPlans)
    .where(
      and(
        inArray(activityPlans.id, ids),
        or(
          eq(activityPlans.profile_id, input.profileId),
          eq(activityPlans.content_visibility, "public"),
          eq(activityPlans.is_system_template, true),
        ),
      ),
    )
    .orderBy(activityPlans.id)
    .for("share");
  requirePublishedLinkedActivityPlans({
    rows: rows.map((row) => ({ ...row, activityCategory: "other" })),
    structure: input.structure,
  });
}

async function deriveProjection(input: {
  db: DrizzleQueryExecutor;
  profileId: string;
  draft: ResolvedDraft;
  expectedPublishedRevision?: number;
  now: Date;
  lockAuthority: boolean;
}) {
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
  const baseline = readModel.currentBaseline?.baseline;
  const status = readModel.status;
  if (!baseline || !status || !readModel.currentBaseline)
    return staleResult({
      reason: "state_unavailable",
      currentPublishedRevision: readModel.publishedRevision,
      currentPlanRevision: input.draft.currentPlanRevision,
      currentPlanStructureHash: input.draft.currentPlanStructureHash,
    });
  if (
    status.freshness !== "fresh" ||
    readModel.publishedRevision === null ||
    (input.expectedPublishedRevision !== undefined &&
      (readModel.publishedRevision !== input.expectedPublishedRevision ||
        status.sourceRevision !== input.expectedPublishedRevision))
  )
    return staleResult({
      reason: "state_revision",
      currentPublishedRevision: readModel.publishedRevision,
      currentPlanRevision: input.draft.currentPlanRevision,
      currentPlanStructureHash: input.draft.currentPlanStructureHash,
    });
  if (input.lockAuthority) {
    try {
      await lockReferencedActivityPlans({
        tx: input.db as DrizzleTransactionClient,
        profileId: input.profileId,
        structure: input.draft.structure,
      });
    } catch {
      return staleResult({
        reason: "linked_plan_unavailable",
        currentPublishedRevision: readModel.publishedRevision,
        currentPlanRevision: input.draft.currentPlanRevision,
        currentPlanStructureHash: input.draft.currentPlanStructureHash,
      });
    }
  }
  const derivation = await derivePersistedPlanStimuli({
    db: input.db,
    profileId: input.profileId,
    planId: input.draft.planId,
    structure: input.draft.structure,
    startDate: input.draft.previewStartDate,
    baselineAsOf: baseline.asOf,
    now: input.now,
    planningTimezone: readModel.currentBaseline.planningTimezone,
  });
  if (derivation.status === "unavailable")
    return staleResult({
      reason:
        derivation.reason === "missing_activity_plan" ||
        derivation.reason === "activity_plan_structure"
          ? "linked_plan_unavailable"
          : "plan_structure",
      currentPublishedRevision: readModel.publishedRevision,
      currentPlanRevision: input.draft.currentPlanRevision,
      currentPlanStructureHash: input.draft.currentPlanStructureHash,
    });
  const projection = deriveDraftPlanProjection({
    baseline,
    planId: input.draft.planId,
    structure: input.draft.structure,
    activityPlans: derivation.activityPlans,
    planningTimezone: derivation.planningTimezone,
    startDate: input.draft.previewStartDate,
    simulationAt: resolveAuthoritativePlanReadinessHorizon({
      baselineAsOf: baseline.asOf,
      plannedSessions: derivation.sessions,
      goal: derivePlanGoalReadinessContext({
        planId: input.draft.planId,
        structure: input.draft.structure,
        planningTimezone: derivation.planningTimezone,
        startDate: input.draft.previewStartDate,
      }),
    }),
  });
  return projection.status === "available"
    ? ({
        status: "available" as const,
        publishedRevision: readModel.publishedRevision,
        simulation: projection.simulation,
      } as const)
    : staleResult({
        reason: "plan_structure",
        currentPublishedRevision: readModel.publishedRevision,
        currentPlanRevision: input.draft.currentPlanRevision,
        currentPlanStructureHash: input.draft.currentPlanStructureHash,
      });
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
        simulation: projection.simulation,
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
        ...(values.kind === "create" || values.kind === "duplicate"
          ? { createPlanId: randomUUID() }
          : {}),
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
      const structureHash = activityPlanStructureHash(draft.structure);
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
            id: draft.planId,
            profile_id: input.profileId,
            name: draft.name,
            description: draft.description,
            content_visibility: visibility,
            structure: draft.structure,
            structure_hash: structureHash,
            validated_state_revision: projection.publishedRevision,
            validated_at: now,
            projection_algorithm_version: DRAFT_PLAN_PROJECTION_ALGORITHM_VERSION,
            updated_at: now,
          })
          .returning({ revision: trainingPlans.revision });
        if (!saved) throw new Error("Failed to save training plan");
        savedRevision = saved.revision;
      }
      return trainingPlanCommitResultSchema.parse({
        status: "saved",
        kind: values.kind,
        planId: draft.planId,
        planRevision: savedRevision,
        planStructureHash: structureHash,
        publishedRevision: projection.publishedRevision,
        validatedAt: now.toISOString(),
        simulation: projection.simulation,
      });
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
  const [nextEvent] = await input.db
    .select({
      scheduleBatchId: events.schedule_batch_id,
      scheduledDate: events.scheduled_date,
    })
    .from(events)
    .where(
      and(
        eq(events.profile_id, input.profileId),
        eq(events.training_plan_id, input.plan.id),
        eq(events.status, "scheduled"),
        isNotNull(events.schedule_batch_id),
      ),
    )
    .orderBy(asc(events.scheduled_date), asc(events.id))
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
      preferredWeekdays: parsed.success
        ? (parsed.data.builder_planning_snapshot?.scheduling.preferred_weekdays ?? [])
        : [],
    },
    schedule: {
      activeScheduleBatchId: nextEvent?.scheduleBatchId ?? null,
      nextScheduledDate: nextEvent?.scheduledDate ?? null,
    },
  };
}
