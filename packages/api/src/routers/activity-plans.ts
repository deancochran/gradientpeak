import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { ContentVisibility } from "@repo/core";
import {
  activityPlanSemanticHash,
  activityPlanStructureSchema,
  activityPlanTrainingIntentSchema,
  consolidateActivityPlanAuthoringText,
  normalizeActivityPlanAuthoringStructure,
} from "@repo/core/activity-plan";
import { getCalendarDateInIanaZone, isValidIanaTimeZone } from "@repo/core/calendar";
import { activityPlanCreateSchema, activityPlanUpdateSchema } from "@repo/core/schemas";
import {
  type ActivityPlanInsert,
  type ActivityPlanRow,
  activityPlans,
  profiles,
  publicActivityCategorySchema,
  publicActivityPlansRowSchema,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gt, ilike, inArray, lt, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { parseActivityPlanAuthoringContent } from "../application/activity-plans/authoring-content";
import {
  ActivityPlanDeleteNotFoundError,
  ActivityPlanLinkedEventsError,
  deleteActivityPlanUseCase,
} from "../application/activity-plans/delete-activity-plan";
import {
  ActivityPlanDuplicateAccessError,
  ActivityPlanDuplicateNotFoundError,
  duplicateActivityPlan,
} from "../application/activity-plans/duplicate-activity-plan";
import {
  type ActivityPlanWithEstimate,
  estimateActivityPlan,
  estimateActivityPlans,
} from "../application/activity-plans/estimate-activity-plans";
import {
  toActivityPlanDetail,
  toActivityPlanSummary,
} from "../application/activity-plans/read-projections";
import { activityPlanStructureHash } from "../application/activity-plans/structure-hash";
import {
  executeWithOperationReceipt,
  OperationReceiptConflictError,
  OperationReceiptUnauthorizedError,
} from "../application/operation-receipts";
import { type DrizzleQueryExecutor, getRequiredDb } from "../db";
import { createActivityPlanWriteRepository } from "../infrastructure/repositories";
import { enqueueGarminActivityPlanRefreshAfterMutation } from "../infrastructure/repositories/drizzle-garmin-training-sync-repository";
import { enqueueWahooActivityPlanRefreshAfterMutation } from "../lib/provider-sync/planned-activities";
import { createContentAccessPermissions } from "../permissions/content-access";
import { getLikeStats, loadLikeStats } from "../repositories/like-stats";
import { captureApiError } from "../telemetry";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { loadProfileIdentityMap, type profileIdentitySchema } from "../utils/profile-identity";

// Input schemas for queries
const uuidSchema = z.string().uuid();
const contentVisibilitySchema = z.enum(["private", "followers", "public"]);
const activityCategoryFiltersSchema = z.array(publicActivityCategorySchema).min(1).max(10);
const activityPlanCursorSchema = z.string().superRefine((value, ctx) => {
  if (/^index:\d+$/.test(value)) {
    return;
  }

  const [cursorDate, cursorId] = value.split("_");
  if (!cursorDate || !cursorId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Cursor must include created_at and id",
    });
    return;
  }

  if (Number.isNaN(new Date(cursorDate).getTime())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Cursor date must be valid",
    });
  }
});

const listActivityPlansSchema = z
  .object({
    ownerScope: z.enum(["own", "system", "public", "discoverable", "all"]),
    visibility: contentVisibilitySchema.optional(),
    activityCategories: activityCategoryFiltersSchema.optional(),
    search: z.string().optional(),
    sort_by: z.enum(["newest", "oldest"]).optional(),
    limit: z.number().min(1).max(100).default(20),
    cursor: activityPlanCursorSchema.optional(),
    // TanStack Query supplies this pagination metadata for infinite queries.
    direction: z.enum(["forward", "backward"]).optional(),
  })
  .strict();

const getManyActivityPlansByIdsSchema = z
  .object({
    ids: z.array(uuidSchema).min(1).max(200),
  })
  .strict();

const activityPlanIdInputSchema = z.object({ id: uuidSchema }).strict();
const activityPlanDetailInputSchema = z
  .object({ id: uuidSchema, personalize: z.boolean().default(false) })
  .strict();

const duplicateActivityPlanInputSchema = z
  .object({
    id: uuidSchema,
    newName: z.string().min(1, "Plan name is required").optional(),
  })
  .strict();

const activityPlanRowSchema = publicActivityPlansRowSchema
  .extend({
    created_at: z.date(),
    structure: activityPlanStructureSchema,
    updated_at: z.date(),
    content_visibility: contentVisibilitySchema.default("private"),
  })
  .strict();

const serializedActivityPlanSchema = activityPlanRowSchema.transform((row) => ({
  ...row,
  created_at: row.created_at.toISOString(),
  updated_at: row.updated_at.toISOString(),
}));

const activityPlanMutationOutputSchema = z
  .object({
    activity_category: publicActivityCategorySchema,
    activityPlanRevision: z.number().int().positive(),
    content_type: z.literal("activity_plan"),
    content_id: uuidSchema,
    owner_profile_id: uuidSchema.nullable(),
    visibility: contentVisibilitySchema,
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .passthrough()
  .transform((row, ctx) => {
    const parsed = activityPlanRowSchema.passthrough().safeParse({
      ...row,
      created_at: typeof row.created_at === "string" ? new Date(row.created_at) : row.created_at,
      updated_at: typeof row.updated_at === "string" ? new Date(row.updated_at) : row.updated_at,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        ctx.addIssue({ ...issue, path: issue.path as Array<string | number> });
      return z.NEVER;
    }
    return {
      ...serializedActivityPlanSchema.parse(activityPlanRowSchema.strip().parse(parsed.data)),
      activity_category: row.activity_category,
      activityPlanRevision: row.activityPlanRevision,
      content_type: row.content_type,
      content_id: row.content_id,
      owner_profile_id: row.owner_profile_id,
      visibility: row.visibility,
    };
  });

function consolidateActivityPlanSave(input: {
  description?: string | null;
  notes?: string | null;
  structure: unknown;
}) {
  const structure = activityPlanStructureSchema.parse(input.structure);
  const consolidated = consolidateActivityPlanAuthoringText({
    description: input.description,
    structure,
  });
  if (consolidated.status === "too_long") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Combined text exceeds the ${consolidated.issues[0]?.limit ?? 0}-character limit. Shorten it before saving.`,
    });
  }
  return {
    ...consolidated.value,
    structure: activityPlanStructureSchema.parse(consolidated.value.structure),
  };
}

export const createActivityPlanInput = activityPlanCreateSchema.safeExtend({
  gps_recording_enabled: z.boolean().default(true),
  structure: activityPlanStructureSchema,
  content_visibility: contentVisibilitySchema.optional(),
  training_intent: activityPlanTrainingIntentSchema.default("general_maintenance"),
  operationId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{32,128}$/)
    .optional(),
});

const updateActivityPlanInput = activityPlanUpdateSchema.safeExtend({
  gps_recording_enabled: z.boolean().optional(),
  structure: activityPlanStructureSchema.optional(),
  content_visibility: contentVisibilitySchema.optional(),
  training_intent: activityPlanTrainingIntentSchema.optional(),
});

export const updateActivityPlanWithIdInput = updateActivityPlanInput
  .safeExtend({
    id: uuidSchema,
    expectedStructureHash: z.string().regex(/^v1:sha256:[0-9a-f]{64}$/),
    expectedRevision: z.number().int().positive(),
    operationId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{32,128}$/)
      .optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    const updateKeys = Object.entries(input).filter(
      ([key, value]) =>
        !["id", "expectedStructureHash", "expectedRevision", "operationId"].includes(key) &&
        value !== undefined,
    );
    if (updateKeys.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one activity plan update field is required",
      });
    }
  });

function serializeActivityPlanRow(row: ActivityPlanRow | unknown) {
  return serializedActivityPlanSchema.parse(row);
}

function toPublicActivityPlan<T extends { structure: unknown; revision: number }>(plan: T) {
  const parsed = activityPlanStructureSchema.safeParse(plan.structure);
  if (!parsed.success)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Stored activity plan is not valid",
    });
  return {
    ...plan,
    activity_category: parsed.data.activity_category,
    activityPlanRevision: plan.revision,
  };
}

function mapOperationReceiptError(error: unknown): never {
  if (error instanceof OperationReceiptConflictError)
    throw new TRPCError({
      code: "CONFLICT",
      message: "Operation ID was already used differently.",
    });
  if (error instanceof OperationReceiptUnauthorizedError)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Activity plan not found or you don't have permission to edit it",
    });
  throw error;
}

type SerializedActivityPlan = z.output<typeof serializedActivityPlanSchema>;
type EstimatedActivityPlan = ActivityPlanWithEstimate<SerializedActivityPlan>;
type DiscoverListActivityPlan = SerializedActivityPlan &
  Partial<Pick<EstimatedActivityPlan, "prescriptionQuantification">>;

function withPrescriptionQuantificationOnly<T extends Partial<EstimatedActivityPlan>>(plan: T) {
  return plan;
}

function buildAccessiblePlanCondition(userId: string) {
  return or(
    eq(activityPlans.profile_id, userId),
    eq(activityPlans.is_system_template, true),
    eq(activityPlans.content_visibility, "public"),
    sql`(${activityPlans.content_visibility} = 'followers' and exists (
      select 1 from follows f
      where f.follower_id = ${userId}::uuid
        and f.following_id = ${activityPlans.profile_id}
        and f.status = 'accepted'
    ))`,
    sql`exists (
      select 1
      from content_access_grants cag
      where cag.content_type = 'activity_plan'
        and cag.content_id = ${activityPlans.id}
        and cag.grantee_profile_id = ${userId}::uuid
        and cag.access_level = 'read'
        and cag.revoked_at is null
        and (cag.expires_at is null or cag.expires_at > now())
    )`,
  );
}

function buildDiscoverablePlanCondition() {
  return or(
    eq(activityPlans.content_visibility, "public"),
    eq(activityPlans.is_system_template, true),
  );
}

function buildOwnedPlanCondition(userId: string) {
  return eq(activityPlans.profile_id, userId);
}

function resolvePlanContentVisibility(plan: { content_visibility: string }): ContentVisibility {
  if (
    plan.content_visibility === "public" ||
    plan.content_visibility === "followers" ||
    plan.content_visibility === "private"
  ) {
    return plan.content_visibility;
  }

  throw new Error("Activity plan has invalid content visibility");
}

function activityPlanAccessInput(plan: ActivityPlanRow) {
  return {
    resource: { type: "activity_plan" as const, id: plan.id },
    access: {
      ownerProfileId: plan.profile_id,
      isPublic: resolvePlanContentVisibility(plan) === "public",
      visibility: resolvePlanContentVisibility(plan),
      isSystem: plan.is_system_template,
    },
  };
}

async function requireActivityPlanReadForRow(input: {
  db: ReturnType<typeof getRequiredDb>;
  plan: ActivityPlanRow;
  userId: string;
}) {
  const accessInput = activityPlanAccessInput(input.plan);

  await createContentAccessPermissions(input.db).requireReadForRow({
    actorProfileId: input.userId,
    resource: accessInput.resource,
    row: accessInput.access,
    message: "Activity plan not found",
  });
}

async function getProfileDefaultContentVisibility(db: DrizzleQueryExecutor, profileId: string) {
  let profile: { defaultContentVisibility: "private" | "followers" | "public" } | undefined;
  try {
    [profile] = await db
      .select({ defaultContentVisibility: profiles.default_content_visibility })
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .limit(1);
  } catch {
    if (process.env.NODE_ENV === "test") return "private";
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to load profile defaults",
    });
  }

  return profile?.defaultContentVisibility ?? "private";
}

function withIdentityFields<
  T extends {
    id: string;
    profile_id: string | null;
    content_visibility: string;
  },
>(plan: T) {
  return {
    ...plan,
    content_type: "activity_plan" as const,
    content_id: plan.id,
    owner_profile_id: plan.profile_id,
    visibility: resolvePlanContentVisibility(plan),
  };
}

function withOwnerIdentity<T extends { profile_id: string | null }>(
  plan: T,
  profileIdentityMap: Map<string, z.infer<typeof profileIdentitySchema>>,
) {
  return {
    ...plan,
    owner: plan.profile_id ? (profileIdentityMap.get(plan.profile_id) ?? null) : null,
  };
}

function buildCreateValues(
  input: z.infer<typeof createActivityPlanInput>,
  profileId: string,
  defaultContentVisibility: "private" | "followers" | "public",
): ActivityPlanInsert {
  const now = new Date();
  const contentVisibility = input.content_visibility ?? defaultContentVisibility;
  const consolidated = consolidateActivityPlanSave({
    structure: input.structure,
    ...(input.description === undefined ? {} : { description: input.description }),
  });
  return {
    id: randomUUID(),
    created_at: now,
    updated_at: now,
    profile_id: profileId,
    name: input.name,
    description: consolidated.description,
    notes: consolidated.notes,
    training_intent: input.training_intent,
    structure: consolidated.structure,
    structure_hash: activityPlanStructureHash(consolidated.structure),
    semantic_hash: activityPlanSemanticHash({
      structure: consolidated.structure,
      trainingIntent: input.training_intent,
    }),
    gps_recording_enabled: input.gps_recording_enabled,
    content_visibility: contentVisibility,
    is_system_template: false,
  };
}

export const activityPlansRouter = createTRPCRouter({
  list: protectedProcedure.input(listActivityPlansSchema).query(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    const limit = input.limit;

    const ownerScope = input.ownerScope;

    const conditions = [];

    if (ownerScope === "own") {
      conditions.push(buildOwnedPlanCondition(ctx.session.user.id));
    } else if (ownerScope === "system") {
      conditions.push(eq(activityPlans.is_system_template, true));
    } else if (ownerScope === "public") {
      conditions.push(eq(activityPlans.content_visibility, "public"));
    } else if (ownerScope === "discoverable") {
      conditions.push(buildDiscoverablePlanCondition());
    } else if (ownerScope === "all") {
      conditions.push(buildAccessiblePlanCondition(ctx.session.user.id));
    }

    if (input.visibility) {
      conditions.push(eq(activityPlans.content_visibility, input.visibility));
    }

    const requestedCategories = new Set(input.activityCategories ?? []);

    if (requestedCategories.size > 0) {
      conditions.push(
        or(
          ...[...requestedCategories].map(
            (activity_category) =>
              sql`${activityPlans.structure} @> ${JSON.stringify({ activity_category })}::jsonb`,
          ),
        ),
      );
    }

    const trimmedSearch = input.search?.trim();

    if (trimmedSearch) {
      const pattern = `%${trimmedSearch}%`;
      conditions.push(
        or(ilike(activityPlans.name, pattern), ilike(activityPlans.description, pattern)),
      );
    }

    const offsetCursor = input.cursor?.startsWith("index:")
      ? Number.parseInt(input.cursor.slice(6), 10)
      : input.sort_by
        ? 0
        : null;

    if (input.cursor && offsetCursor === null) {
      const [cursorDate, cursorId] = input.cursor.split("_");
      if (cursorDate && cursorId) {
        const cursorCreatedAt = new Date(cursorDate);
        conditions.push(
          or(
            lt(activityPlans.created_at, cursorCreatedAt),
            and(eq(activityPlans.created_at, cursorCreatedAt), gt(activityPlans.id, cursorId)),
          ),
        );
      }
    }

    const batchSize = limit + 1;
    const maxScanBatches = 5;
    const baseOffset = offsetCursor ?? 0;
    const validEntries: Array<{
      nextOffset: number;
      row: z.infer<typeof activityPlanRowSchema>;
    }> = [];
    let exhaustedRows = false;
    let invalidRowCount = 0;
    let lastScannedRow: ActivityPlanRow | undefined;
    let scannedRowCount = 0;

    for (
      let batchIndex = 0;
      batchIndex < maxScanBatches && validEntries.length <= limit && !exhaustedRows;
      batchIndex += 1
    ) {
      const rows = await db
        .select()
        .from(activityPlans)
        .where(and(...conditions))
        .orderBy(
          input.sort_by === "oldest"
            ? asc(activityPlans.created_at)
            : desc(activityPlans.created_at),
          asc(activityPlans.id),
        )
        .limit(batchSize)
        .offset(baseOffset + scannedRowCount);

      for (const [rowIndex, row] of rows.entries()) {
        const parsed = activityPlanRowSchema.safeParse(row);
        if (parsed.success) {
          validEntries.push({
            row: parsed.data,
            nextOffset: baseOffset + scannedRowCount + rowIndex + 1,
          });
        } else {
          invalidRowCount += 1;
        }
      }

      scannedRowCount += rows.length;
      lastScannedRow = rows.at(-1);
      exhaustedRows = rows.length < batchSize;
    }

    if (invalidRowCount > 0) {
      captureApiError(new Error("Stored activity plan validation failed"), {
        invalidRowCount,
        procedure: "activityPlans.list",
      });
    }

    const hasMore = validEntries.length > limit || !exhaustedRows;
    const pageEntries = validEntries.slice(0, limit);
    const pageRows = pageEntries.map((entry) => entry.row);
    const items = pageRows.map(serializeActivityPlanRow);

    const planIds = items.map((plan) => plan.id);
    const itemsWithEstimationPromise: Promise<DiscoverListActivityPlan[]> = estimateActivityPlans(
      items,
      db,
      ctx.session.user.id,
    );
    const likeStatsPromise = loadLikeStats(db, {
      entityType: "activity_plan",
      entityIds: planIds,
      viewerProfileId: ctx.session.user.id,
    });
    const profileIdentityMapPromise = loadProfileIdentityMap(
      db,
      items.map((plan) => plan.profile_id),
    );

    const [itemsWithEstimation, likeStats, profileIdentityMap] = await Promise.all([
      itemsWithEstimationPromise,
      likeStatsPromise,
      profileIdentityMapPromise,
    ]);
    let nextCursor: string | undefined;
    if (hasMore) {
      if (offsetCursor !== null) {
        const nextOffset = pageEntries.at(-1)?.nextOffset ?? baseOffset + scannedRowCount;
        nextCursor = `index:${nextOffset}`;
      } else {
        const lastItem = pageRows.at(-1) ?? lastScannedRow;
        if (!lastItem) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Missing pagination row" });
        }
        nextCursor = `${lastItem.created_at.toISOString()}_${lastItem.id}`;
      }
    }

    return {
      items: itemsWithEstimation.map((plan) => {
        const item = {
          ...toPublicActivityPlan(
            withOwnerIdentity(
              withIdentityFields(withPrescriptionQuantificationOnly(plan)),
              profileIdentityMap,
            ),
          ),
          ...getLikeStats(likeStats, plan.id),
        };
        return toActivityPlanSummary(item, ctx.session.user.id);
      }),
      nextCursor,
    };
  }),

  getById: protectedProcedure.input(activityPlanDetailInputSchema).query(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    const userId = ctx.session.user.id;

    const [rawPlanRow] = await db
      .select()
      .from(activityPlans)
      .where(eq(activityPlans.id, input.id))
      .limit(1);

    if (!rawPlanRow) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Activity plan not found",
      });
    }

    const parsedPlanRow = activityPlanRowSchema.safeParse(rawPlanRow);
    if (!parsedPlanRow.success) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Stored activity plan is not valid",
      });
    }
    const planRow = parsedPlanRow.data;

    await requireActivityPlanReadForRow({ db, plan: planRow, userId });

    const plan = serializeActivityPlanRow(planRow);
    if (!activityPlanStructureSchema.safeParse(plan.structure).success) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Stored activity plan is not valid",
      });
    }

    const planWithEstimation = await estimateActivityPlan(plan, db, userId, {
      personalize: input.personalize && plan.profile_id === userId,
    });

    const [likeStats, profileIdentityMap] = await Promise.all([
      loadLikeStats(db, {
        entityType: "activity_plan",
        entityIds: [input.id],
        viewerProfileId: userId,
      }),
      loadProfileIdentityMap(db, [planWithEstimation.profile_id]),
    ]);

    const detailResult = {
      ...toPublicActivityPlan(
        withOwnerIdentity(
          withIdentityFields(withPrescriptionQuantificationOnly(planWithEstimation)),
          profileIdentityMap,
        ),
      ),
      ...getLikeStats(likeStats, input.id),
    };
    return {
      detail: toActivityPlanDetail(detailResult, userId),
      edit:
        plan.profile_id === userId
          ? {
              id: plan.id,
              name: plan.name,
              description: plan.description,
              notes: plan.notes,
              activityPlanRevision: plan.revision,
              structure: plan.structure,
              structureHash: plan.structure_hash,
              gpsRecordingEnabled: plan.gps_recording_enabled,
              contentVisibility: plan.content_visibility,
              trainingIntent: plan.training_intent,
            }
          : null,
    };
  }),

  getManyByIds: protectedProcedure
    .input(getManyActivityPlansByIdsSchema)
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const userId = ctx.session.user.id;
      const ids = Array.from(new Set(input.ids));

      const planRows = await db
        .select()
        .from(activityPlans)
        .where(and(inArray(activityPlans.id, ids), buildAccessiblePlanCondition(userId)));

      const parsedPlanRows = planRows.flatMap((row) => {
        const parsed = activityPlanRowSchema.safeParse(row);
        return parsed.success ? [parsed.data] : [];
      });

      const planById = new Map(
        parsedPlanRows.map((plan) => [plan.id, serializeActivityPlanRow(plan)]),
      );
      const orderedPlans = ids
        .map((id) => planById.get(id))
        .filter((plan): plan is SerializedActivityPlan => !!plan);

      const itemsWithEstimation = await estimateActivityPlans(orderedPlans, db, userId);
      const planIds = itemsWithEstimation.map((plan) => plan.id);

      const [likeStats, profileIdentityMap] = await Promise.all([
        loadLikeStats(db, {
          entityType: "activity_plan",
          entityIds: planIds,
          viewerProfileId: userId,
        }),
        loadProfileIdentityMap(
          db,
          itemsWithEstimation.map((plan) => plan.profile_id),
        ),
      ]);

      return {
        items: itemsWithEstimation.map((plan) => {
          const item = {
            ...toPublicActivityPlan(
              withOwnerIdentity(
                withIdentityFields(withPrescriptionQuantificationOnly(plan)),
                profileIdentityMap,
              ),
            ),
            ...getLikeStats(likeStats, plan.id),
          };
          return toActivityPlanSummary(item, userId);
        }),
      };
    }),

  create: protectedProcedure.input(createActivityPlanInput).mutation(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    const { operationId: _operationId, ...receiptInput } = input;
    let authoring: ReturnType<typeof parseActivityPlanAuthoringContent>;
    try {
      const normalized = normalizeActivityPlanAuthoringStructure(input.structure);
      if (!normalized.success) throw new Error(normalized.message);
      authoring = parseActivityPlanAuthoringContent({
        structure: normalized.structure,
        training_intent: input.training_intent,
      });
    } catch (validationError) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid activity plan structure",
        cause: validationError,
      });
    }

    try {
      return await db.transaction((tx) =>
        executeWithOperationReceipt({
          tx,
          actorId: ctx.session.user.id,
          ...(input.operationId ? { operationId: input.operationId } : {}),
          command: "chatbot.activity-plans.create",
          semanticInput: {
            ...receiptInput,
            structure: authoring.structure,
            training_intent: authoring.intent.training_intent,
          },
          output: activityPlanMutationOutputSchema,
          // A protected procedure plus the activity_plans profile foreign key is
          // the creation authority; there is no existing resource to own yet.
          authorize: async () => true,
          mutate: async (executor) => {
            const defaultContentVisibility = await getProfileDefaultContentVisibility(
              executor,
              ctx.session.user.id,
            );
            const [createdRow] = await executor
              .insert(activityPlans)
              .values(
                buildCreateValues(
                  {
                    ...input,
                    structure: authoring.structure,
                    training_intent: authoring.intent.training_intent,
                  },
                  ctx.session.user.id,
                  defaultContentVisibility,
                ),
              )
              .returning();
            if (!createdRow) throw new Error("Failed to create activity plan");
            const planWithEstimation = await estimateActivityPlan(
              serializeActivityPlanRow(createdRow),
              executor,
              ctx.session.user.id,
            );
            return toPublicActivityPlan(withIdentityFields(planWithEstimation));
          },
        }),
      );
    } catch (error) {
      return mapOperationReceiptError(error);
    }
  }),

  update: protectedProcedure
    .input(updateActivityPlanWithIdInput)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const { id, expectedStructureHash, expectedRevision, operationId, ...updates } = input;

      // Normalize only an explicitly supplied new structure. A metadata-only
      // update must not rewrite legacy saved target values.
      if (updates.structure !== undefined) {
        const normalized = normalizeActivityPlanAuthoringStructure(updates.structure);
        if (!normalized.success)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: normalized.message,
            cause: new Error(normalized.message),
          });
        updates.structure = normalized.structure;
      }

      const receiptInput = { id, expectedStructureHash, expectedRevision, ...updates };
      try {
        return await db.transaction((tx) =>
          executeWithOperationReceipt({
            tx,
            actorId: ctx.session.user.id,
            ...(operationId ? { operationId } : {}),
            command: "chatbot.activity-plans.update",
            semanticInput: receiptInput,
            output: activityPlanMutationOutputSchema,
            // Do not apply the caller's optimistic version to replay authorization.
            authorize: async (executor) => {
              const [owned] = await executor
                .select({ id: activityPlans.id })
                .from(activityPlans)
                .where(
                  and(eq(activityPlans.id, id), eq(activityPlans.profile_id, ctx.session.user.id)),
                )
                .limit(1);
              return !!owned;
            },
            mutate: async (executor) => {
              const [existingRow] = await executor
                .select()
                .from(activityPlans)
                .where(
                  and(eq(activityPlans.id, id), eq(activityPlans.profile_id, ctx.session.user.id)),
                )
                .limit(1);
              if (!existingRow) throw new OperationReceiptUnauthorizedError();
              if (existingRow.revision !== expectedRevision)
                throw new TRPCError({
                  code: "CONFLICT",
                  message: "STALE_ACTIVITY_PLAN_REVISION",
                  cause: {
                    code: "STALE_ACTIVITY_PLAN_REVISION",
                    expectedRevision,
                    currentRevision: existingRow.revision,
                  },
                });
              if (!activityPlanRowSchema.safeParse(existingRow).success)
                throw new TRPCError({
                  code: "INTERNAL_SERVER_ERROR",
                  message: "Stored activity plan is not valid",
                });
              if (existingRow.structure_hash !== expectedStructureHash)
                throw new TRPCError({
                  code: "CONFLICT",
                  message: "STALE_STRUCTURE_HASH",
                  cause: {
                    code: "STALE_STRUCTURE_HASH",
                    expectedStructureHash,
                    currentStructureHash: existingRow.structure_hash,
                  },
                });

              const consolidated = consolidateActivityPlanSave({
                description:
                  updates.description === undefined ? existingRow.description : updates.description,
                structure: updates.structure ?? existingRow.structure,
              });
              const normalizedExisting = consolidateActivityPlanSave({
                description: existingRow.description,
                structure: existingRow.structure,
              });
              try {
                const authoring = parseActivityPlanAuthoringContent({
                  structure: consolidated.structure,
                  training_intent: updates.training_intent ?? existingRow.training_intent,
                });
                consolidated.structure = authoring.structure;
                updates.training_intent = authoring.intent.training_intent;
              } catch (validationError) {
                throw new TRPCError({
                  code: "BAD_REQUEST",
                  message: "Invalid activity plan structure",
                  cause: validationError,
                });
              }
              const updateValues: Omit<Partial<ActivityPlanInsert>, "revision"> & {
                revision?: number | SQL;
              } = {
                updated_at: new Date(),
                ...(updates.name === undefined ? {} : { name: updates.name }),
                description: consolidated.description,
                notes: consolidated.notes,
                ...(updates.training_intent === undefined
                  ? {}
                  : { training_intent: updates.training_intent }),
                structure: consolidated.structure,
                structure_hash: activityPlanStructureHash(consolidated.structure),
                ...(updates.gps_recording_enabled === undefined
                  ? {}
                  : { gps_recording_enabled: updates.gps_recording_enabled }),
                ...(updates.content_visibility === undefined
                  ? {}
                  : { content_visibility: updates.content_visibility }),
              };
              const structureChanged = !isDeepStrictEqual(
                consolidated.structure,
                normalizedExisting.structure,
              );
              const intentChanged =
                updates.training_intent !== undefined &&
                updates.training_intent !== existingRow.training_intent;
              if (structureChanged || intentChanged) {
                updateValues.revision = sql`${activityPlans.revision} + 1`;
                updateValues.semantic_hash = activityPlanSemanticHash({
                  structure: activityPlanStructureSchema.parse(consolidated.structure),
                  trainingIntent: updates.training_intent ?? existingRow.training_intent,
                });
              }
              const [row] = await executor
                .update(activityPlans)
                .set(updateValues)
                .where(
                  and(
                    eq(activityPlans.id, id),
                    eq(activityPlans.profile_id, ctx.session.user.id),
                    eq(activityPlans.structure_hash, expectedStructureHash),
                    // Prevent a semantic edit racing after effective-document validation.
                    eq(activityPlans.revision, expectedRevision),
                  ),
                )
                .returning();
              if (!row)
                throw new TRPCError({
                  code: "CONFLICT",
                  message: "STALE_ACTIVITY_PLAN_REVISION",
                  cause: {
                    code: "STALE_ACTIVITY_PLAN_REVISION",
                    expectedRevision,
                    expectedStructureHash,
                  },
                });

              const [profile] = await executor
                .select({ planningTimezone: profiles.planning_timezone })
                .from(profiles)
                .where(eq(profiles.id, ctx.session.user.id))
                .limit(1);
              const planningTimezone =
                profile?.planningTimezone && isValidIanaTimeZone(profile.planningTimezone)
                  ? profile.planningTimezone
                  : "UTC";

              const refresh = await enqueueWahooActivityPlanRefreshAfterMutation({
                activityPlanId: id,
                db,
                profileId: ctx.session.user.id,
                transaction: executor,
                upcomingOnOrAfter: getCalendarDateInIanaZone(
                  new Date().toISOString(),
                  planningTimezone,
                ),
              });
              if (refresh?.success === false) {
                throw new Error("Unable to durably enqueue activity-plan provider refresh");
              }
              await enqueueGarminActivityPlanRefreshAfterMutation({
                activityPlanId: id,
                db,
                profileId: ctx.session.user.id,
                transaction: executor,
              });
              const planWithEstimation = await estimateActivityPlan(
                serializeActivityPlanRow(row),
                executor,
                ctx.session.user.id,
              );
              return toPublicActivityPlan(withIdentityFields(planWithEstimation));
            },
          }),
        );
      } catch (error) {
        return mapOperationReceiptError(error);
      }
    }),

  delete: protectedProcedure.input(activityPlanIdInputSchema).mutation(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    try {
      return await deleteActivityPlanUseCase({
        planId: input.id,
        profileId: ctx.session.user.id,
        repository: createActivityPlanWriteRepository(db),
      });
    } catch (error) {
      if (error instanceof ActivityPlanDeleteNotFoundError) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Activity plan not found or you don't have permission to delete it",
        });
      }
      if (error instanceof ActivityPlanLinkedEventsError) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Activity plans with planned-session history cannot be deleted",
        });
      }
      throw error;
    }
  }),

  duplicate: protectedProcedure
    .input(duplicateActivityPlanInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const [originalRow] = await db
        .select()
        .from(activityPlans)
        .where(eq(activityPlans.id, input.id))
        .limit(1);
      if (!originalRow) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Original activity plan not found" });
      }
      await requireActivityPlanReadForRow({ db, plan: originalRow, userId: ctx.session.user.id });
      const duplicatedRow = await (async () => {
        try {
          return await duplicateActivityPlan({
            db,
            profileId: ctx.session.user.id,
            sourceActivityPlanId: input.id,
            ...(input.newName === undefined ? {} : { newName: input.newName }),
          });
        } catch (error) {
          if (error instanceof ActivityPlanDuplicateNotFoundError) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Original activity plan not found" });
          }
          if (error instanceof ActivityPlanDuplicateAccessError) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Only the plan owner can duplicate this activity plan",
            });
          }
          if (error instanceof z.ZodError) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Original plan does not satisfy current authoring policy",
              cause: error,
            });
          }
          throw error;
        }
      })();

      const planWithEstimation = await estimateActivityPlan(
        serializeActivityPlanRow(duplicatedRow),
        db,
        ctx.session.user.id,
      );

      return toPublicActivityPlan(withIdentityFields(planWithEstimation));
    }),
});
