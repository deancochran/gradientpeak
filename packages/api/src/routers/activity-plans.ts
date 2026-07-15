import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  type ActivityTargetCategory,
  activityPlanCreateSchema,
  activityPlanStructureSchemaV2,
  activityPlanUpdateSchema,
  getActivityTargetCompatibilityIssues,
  saveableActivityPlanStructureSchemaV2,
} from "@repo/core";
import {
  type ActivityPlanInsert,
  type ActivityPlanRow,
  activityPlans,
  events,
  publicActivityCategorySchema,
  publicActivityPlansRowSchema,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, gt, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { upsertImportedActivityPlan } from "../application/activity-plans/upsertImportedActivityPlan";
import { enqueueProviderPlannedActivityJobs } from "../application/events";
import type { Context } from "../context";
import { getRequiredDb } from "../db";
import { createEventReadRepository } from "../infrastructure/repositories";
import { createContentAccessPermissions } from "../permissions/content-access";
import { getLikeStats, loadLikeStats } from "../repositories/like-stats";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  type ActivityPlanWithDerivedMetrics,
  getActivityPlanDerivedMetrics,
  getActivityPlansDerivedMetrics,
} from "../utils/activity-plan-derived-metrics";
import { computePlanMetrics } from "../utils/estimation-helpers";
import { loadProfileIdentityMap, type profileIdentitySchema } from "../utils/profile-identity";

// Input schemas for queries
const uuidSchema = z.string().uuid();
const templateVisibilitySchema = z.enum(["private", "public"]);
const activityCategoryFilterSchema = z.union([publicActivityCategorySchema, z.literal("all")]);
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
    includeOwnOnly: z.boolean().default(true),
    includeSystemTemplates: z.boolean().default(false),
    includeEstimation: z.boolean().default(true),
    ownerScope: z.enum(["own", "system", "public", "discoverable", "all"]).optional(),
    visibility: z.enum(["private", "public"]).optional(),
    activityCategory: activityCategoryFilterSchema.optional(),
    activityCategories: activityCategoryFiltersSchema.optional(),
    search: z.string().optional(),
    limit: z.number().min(1).max(100).default(20),
    cursor: activityPlanCursorSchema.optional(),
    direction: z.enum(["forward", "backward"]).optional(),
  })
  .strict();

const getManyActivityPlansByIdsSchema = z
  .object({
    ids: z.array(uuidSchema).min(1).max(200),
  })
  .strict();

const activityPlanIdInputSchema = z.object({ id: uuidSchema }).strict();

const duplicateActivityPlanInputSchema = z
  .object({
    id: uuidSchema,
    newName: z.string().min(1, "Plan name is required").optional(),
  })
  .strict();

const activityPlanCountRowSchema = z
  .object({
    value: z.coerce.number().int().nonnegative(),
  })
  .strict();

const activityPlanRowSchema = publicActivityPlansRowSchema
  .safeExtend({
    created_at: z.date(),
    updated_at: z.date(),
  })
  .strict();

const serializedActivityPlanSchema = activityPlanRowSchema.transform((row) => ({
  ...row,
  created_at: row.created_at.toISOString(),
  updated_at: row.updated_at.toISOString(),
}));

function validateStructure(structure: unknown, activityCategory?: ActivityTargetCategory): void {
  const parsed = saveableActivityPlanStructureSchemaV2.parse(structure);
  if (!activityCategory) return;

  const issues = getActivityTargetCompatibilityIssues({
    activityCategory,
    pathPrefix: ["structure"],
    structure: parsed,
  });
  if (issues.length > 0) {
    throw new z.ZodError(
      issues.map((issue) => ({
        code: z.ZodIssueCode.custom,
        path: issue.path,
        message: issue.message,
      })),
    );
  }
}

function getEstimationStore(ctx: Context) {
  return createEventReadRepository(getRequiredDb(ctx));
}

const createActivityPlanInput = activityPlanCreateSchema.safeExtend({
  structure: saveableActivityPlanStructureSchemaV2,
  template_visibility: templateVisibilitySchema.optional(),
});

const updateActivityPlanInput = activityPlanUpdateSchema.safeExtend({
  structure: saveableActivityPlanStructureSchemaV2.optional(),
  template_visibility: templateVisibilitySchema.optional(),
});

const updateActivityPlanWithIdInput = updateActivityPlanInput
  .safeExtend({
    id: uuidSchema,
  })
  .strict()
  .superRefine((input, ctx) => {
    const updateKeys = Object.entries(input).filter(
      ([key, value]) =>
        key !== "id" && !(key === "version" && value === "1.0") && value !== undefined,
    );
    if (updateKeys.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one activity plan update field is required",
      });
    }
  });

const importedTemplateInput = z
  .object({
    external_id: z.string().min(1).max(255),
    name: z.string().min(1, "Plan name is required"),
    activity_category: publicActivityCategorySchema,
    description: z.string().max(1000).nullable().optional(),
    notes: z.string().max(2000).optional(),
    structure: activityPlanStructureSchemaV2,
  })
  .strict();

function serializeActivityPlanRow(row: ActivityPlanRow | unknown) {
  return serializedActivityPlanSchema.parse(row);
}

type SerializedActivityPlan = z.output<typeof serializedActivityPlanSchema>;
type EstimatedActivityPlan = ActivityPlanWithDerivedMetrics<SerializedActivityPlan>;
type DiscoverListActivityPlan = SerializedActivityPlan &
  Partial<
    Pick<
      EstimatedActivityPlan,
      | "estimated_calories"
      | "estimated_zones"
      | "confidence"
      | "confidence_score"
      | "estimate_computed_at"
      | "estimate_last_accessed_at"
      | "estimate_source"
      | "estimator_version"
      | "authoritative_metrics"
      | "route"
    >
  >;

function buildAccessiblePlanCondition(userId: string) {
  return or(
    eq(activityPlans.profile_id, userId),
    eq(activityPlans.is_system_template, true),
    eq(activityPlans.template_visibility, "public"),
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
    eq(activityPlans.template_visibility, "public"),
    eq(activityPlans.is_system_template, true),
  );
}

function buildOwnedPlanCondition(userId: string) {
  return eq(activityPlans.profile_id, userId);
}

function activityPlanAccessInput(plan: ActivityPlanRow) {
  return {
    resource: { type: "activity_plan" as const, id: plan.id },
    access: {
      ownerProfileId: plan.profile_id,
      isPublic: plan.template_visibility === "public",
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

function withIdentityFields<
  T extends {
    id: string;
    profile_id: string | null;
    template_visibility?: string | null;
  },
>(plan: T) {
  return {
    ...plan,
    content_type: "activity_plan" as const,
    content_id: plan.id,
    owner_profile_id: plan.profile_id,
    visibility:
      plan.template_visibility === "public" || plan.template_visibility === "private"
        ? plan.template_visibility
        : "private",
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
  _metrics: Awaited<ReturnType<typeof computePlanMetrics>>,
): ActivityPlanInsert {
  const now = new Date();
  const templateVisibility = input.template_visibility ?? "private";

  return {
    id: randomUUID(),
    created_at: now,
    updated_at: now,
    profile_id: profileId,
    name: input.name,
    description: input.description?.trim() ? input.description.trim() : null,
    notes: input.notes ?? null,
    activity_category: input.activity_category,
    structure: input.structure,
    version: "1.0",
    template_visibility: templateVisibility,
    import_provider: null,
    import_external_id: null,
    is_system_template: false,
  };
}

export const activityPlansRouter = createTRPCRouter({
  list: protectedProcedure.input(listActivityPlansSchema).query(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    const estimationStore = createEventReadRepository(db);
    const limit = input.limit;

    const ownerScope =
      input.ownerScope ??
      (input.includeOwnOnly && !input.includeSystemTemplates
        ? "own"
        : !input.includeOwnOnly && input.includeSystemTemplates
          ? "system"
          : input.includeOwnOnly && input.includeSystemTemplates
            ? "all"
            : "none");

    if (ownerScope === "none") {
      return { items: [], nextCursor: undefined };
    }

    const conditions = [];

    if (ownerScope === "own") {
      conditions.push(buildOwnedPlanCondition(ctx.session.user.id));
    } else if (ownerScope === "system") {
      conditions.push(eq(activityPlans.is_system_template, true));
    } else if (ownerScope === "public") {
      conditions.push(eq(activityPlans.template_visibility, "public"));
    } else if (ownerScope === "discoverable") {
      conditions.push(buildDiscoverablePlanCondition());
    } else if (ownerScope === "all") {
      conditions.push(buildAccessiblePlanCondition(ctx.session.user.id));
    }

    if (input.visibility) {
      conditions.push(eq(activityPlans.template_visibility, input.visibility));
    }

    if (input.activityCategory && input.activityCategory !== "all") {
      conditions.push(eq(activityPlans.activity_category, input.activityCategory));
    }

    if (input.activityCategories?.length) {
      conditions.push(inArray(activityPlans.activity_category, input.activityCategories));
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

    const rows =
      offsetCursor !== null
        ? await db
            .select()
            .from(activityPlans)
            .where(and(...conditions))
            .orderBy(desc(activityPlans.created_at), asc(activityPlans.id))
            .limit(limit + 1)
            .offset(offsetCursor)
        : await db
            .select()
            .from(activityPlans)
            .where(and(...conditions))
            .orderBy(desc(activityPlans.created_at), asc(activityPlans.id))
            .limit(limit + 1);

    const parsedRows = z.array(activityPlanRowSchema).parse(rows);

    const hasMore = parsedRows.length > limit;
    const pageRows = hasMore ? parsedRows.slice(0, limit) : parsedRows;
    const items = pageRows.map(serializeActivityPlanRow);

    const planIds = items.map((plan) => plan.id);
    const itemsWithOptionalEstimationPromise: Promise<DiscoverListActivityPlan[]> =
      input.includeEstimation
        ? getActivityPlansDerivedMetrics(items, db, estimationStore, ctx.session.user.id)
        : Promise.resolve(
            items.map((plan) => ({
              ...plan,
              estimated_calories: undefined,
              estimated_zones: undefined,
              confidence: undefined,
              confidence_score: undefined,
              authoritative_metrics: undefined,
              route: undefined,
            })),
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

    const [itemsWithOptionalEstimation, likeStats, profileIdentityMap] = await Promise.all([
      itemsWithOptionalEstimationPromise,
      likeStatsPromise,
      profileIdentityMapPromise,
    ]);
    let nextCursor: string | undefined;
    if (hasMore && pageRows.length > 0) {
      if (offsetCursor !== null) {
        nextCursor = `index:${offsetCursor + limit}`;
      } else {
        const lastItem = pageRows[pageRows.length - 1];
        if (!lastItem) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Missing pagination row" });
        }
        nextCursor = `${lastItem.created_at.toISOString()}_${lastItem.id}`;
      }
    }

    return {
      items: itemsWithOptionalEstimation.map((plan) => ({
        ...withOwnerIdentity(withIdentityFields(plan), profileIdentityMap),
        ...getLikeStats(likeStats, plan.id),
      })),
      nextCursor,
    };
  }),

  getById: protectedProcedure.input(activityPlanIdInputSchema).query(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    const estimationStore = createEventReadRepository(db);
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

    const planRow = activityPlanRowSchema.parse(rawPlanRow);

    await requireActivityPlanReadForRow({ db, plan: planRow, userId });

    const plan = serializeActivityPlanRow(planRow);

    try {
      if (plan.structure) {
        validateStructure(plan.structure, plan.activity_category as ActivityTargetCategory);
      }
    } catch (validationError) {
      console.error("Invalid V2 structure in database for plan", input.id, validationError);
    }

    const planWithEstimation = await getActivityPlanDerivedMetrics(
      plan,
      db,
      estimationStore,
      userId,
    );

    const [likeStats, profileIdentityMap] = await Promise.all([
      loadLikeStats(db, {
        entityType: "activity_plan",
        entityIds: [input.id],
        viewerProfileId: userId,
      }),
      loadProfileIdentityMap(db, [planWithEstimation.profile_id]),
    ]);

    return {
      ...withOwnerIdentity(withIdentityFields(planWithEstimation), profileIdentityMap),
      ...getLikeStats(likeStats, input.id),
    };
  }),

  getManyByIds: protectedProcedure
    .input(getManyActivityPlansByIdsSchema)
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const estimationStore = createEventReadRepository(db);
      const userId = ctx.session.user.id;
      const ids = Array.from(new Set(input.ids));
      const permissions = createContentAccessPermissions(db);

      const planRows = await db.select().from(activityPlans).where(inArray(activityPlans.id, ids));

      const parsedPlanRows = z.array(activityPlanRowSchema).parse(planRows);
      const readablePlanRows = await permissions.filterReadableRows({
        actorProfileId: userId,
        rows: parsedPlanRows,
        getRowInput: (plan) => ({ row: plan, ...activityPlanAccessInput(plan) }),
      });

      const planById = new Map(
        readablePlanRows.map((plan) => [plan.id, serializeActivityPlanRow(plan)]),
      );
      const orderedPlans = ids
        .map((id) => planById.get(id))
        .filter((plan): plan is SerializedActivityPlan => !!plan);

      const itemsWithEstimation = await getActivityPlansDerivedMetrics(
        orderedPlans,
        db,
        estimationStore,
        userId,
      );
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
        items: itemsWithEstimation.map((plan) => ({
          ...withOwnerIdentity(withIdentityFields(plan), profileIdentityMap),
          ...getLikeStats(likeStats, plan.id),
        })),
      };
    }),

  getUserPlansCount: protectedProcedure.query(async ({ ctx }) => {
    const db = getRequiredDb(ctx);

    const [row] = await db
      .select({ value: count() })
      .from(activityPlans)
      .where(eq(activityPlans.profile_id, ctx.session.user.id));

    return activityPlanCountRowSchema.parse(row ?? { value: 0 }).value;
  }),

  create: protectedProcedure.input(createActivityPlanInput).mutation(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);
    const estimationStore = createEventReadRepository(db);

    try {
      validateStructure(input.structure, input.activity_category as ActivityTargetCategory);
    } catch (validationError) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid activity plan structure (V2 required)",
        cause: validationError,
      });
    }

    const metrics = await computePlanMetrics(
      {
        activity_category: input.activity_category,
        structure: input.structure,
      },
      estimationStore,
      ctx.session.user.id,
    );

    const [createdRow] = await db
      .insert(activityPlans)
      .values(buildCreateValues(input, ctx.session.user.id, metrics))
      .returning();

    if (!createdRow) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to create activity plan",
      });
    }

    const planWithEstimation = await getActivityPlanDerivedMetrics(
      serializeActivityPlanRow(createdRow),
      db,
      estimationStore,
      ctx.session.user.id,
    );

    return withIdentityFields(planWithEstimation);
  }),

  update: protectedProcedure
    .input(updateActivityPlanWithIdInput)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const estimationStore = createEventReadRepository(db);
      const { id, ...updates } = input;

      const [existingRow] = await db
        .select()
        .from(activityPlans)
        .where(and(eq(activityPlans.id, id), eq(activityPlans.profile_id, ctx.session.user.id)))
        .limit(1);

      if (!existingRow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Activity plan not found or you don't have permission to edit it",
        });
      }

      if (updates.structure || updates.activity_category) {
        try {
          validateStructure(
            updates.structure || existingRow.structure,
            (updates.activity_category || existingRow.activity_category) as ActivityTargetCategory,
          );
        } catch (validationError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid activity plan structure (V2 required)",
            cause: validationError,
          });
        }
      }

      const metricsUpdates: Partial<ActivityPlanInsert> = {};
      if (updates.structure || updates.activity_category) {
        await computePlanMetrics(
          {
            activity_category: updates.activity_category || existingRow.activity_category,
            structure: updates.structure || existingRow.structure,
          },
          estimationStore,
          ctx.session.user.id,
        );
      }

      const updateValues: Partial<ActivityPlanInsert> = {
        updated_at: new Date(),
        name: updates.name,
        description:
          updates.description === undefined
            ? undefined
            : updates.description?.trim()
              ? updates.description.trim()
              : null,
        notes: updates.notes,
        activity_category: updates.activity_category,
        structure: updates.structure,
        version: updates.version,
        template_visibility: updates.template_visibility,
        ...metricsUpdates,
      };

      const [updatedRow] = await db
        .update(activityPlans)
        .set(updateValues)
        .where(and(eq(activityPlans.id, id), eq(activityPlans.profile_id, ctx.session.user.id)))
        .returning();

      if (!updatedRow) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to update activity plan",
        });
      }

      let plannedWorkoutSync = null;
      const descriptionChanged =
        updates.description !== undefined && updateValues.description !== existingRow.description;
      const materialPlanChanged =
        (updates.name !== undefined && updates.name !== existingRow.name) ||
        descriptionChanged ||
        (updates.activity_category !== undefined &&
          updates.activity_category !== existingRow.activity_category) ||
        (updates.structure !== undefined &&
          !isDeepStrictEqual(updates.structure, existingRow.structure));

      if (materialPlanChanged) {
        const linkedEvents = await db
          .select({ id: events.id })
          .from(events)
          .where(
            and(
              eq(events.profile_id, ctx.session.user.id),
              eq(events.activity_plan_id, id),
              eq(events.event_type, "planned"),
              eq(events.status, "scheduled"),
              gte(events.starts_at, new Date()),
            ),
          );

        if (linkedEvents.length > 0) {
          try {
            plannedWorkoutSync = await enqueueProviderPlannedActivityJobs(ctx, {
              eventIds: linkedEvents.map((event) => event.id),
              operation: "publish",
            });
          } catch (error) {
            plannedWorkoutSync = {
              affectedCount: linkedEvents.length,
              operation: "publish" as const,
              queued: false,
              success: false,
              error:
                error instanceof Error ? error.message : "Unknown planned workout enqueue failure",
            };
          }
        }
      }

      const planWithEstimation = await getActivityPlanDerivedMetrics(
        serializeActivityPlanRow(updatedRow),
        db,
        estimationStore,
        ctx.session.user.id,
      );

      return {
        ...withIdentityFields(planWithEstimation),
        plannedWorkoutSync,
        wahooSync: plannedWorkoutSync,
      };
    }),

  delete: protectedProcedure.input(activityPlanIdInputSchema).mutation(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);

    const [ownedPlan] = await db
      .select({ id: activityPlans.id })
      .from(activityPlans)
      .where(and(eq(activityPlans.id, input.id), eq(activityPlans.profile_id, ctx.session.user.id)))
      .limit(1);

    if (!ownedPlan) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Activity plan not found or you don't have permission to delete it",
      });
    }

    const linkedEvents = await db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.profile_id, ctx.session.user.id),
          eq(events.activity_plan_id, input.id),
          eq(events.event_type, "planned"),
          eq(events.status, "scheduled"),
          gte(events.starts_at, new Date()),
        ),
      );

    let plannedWorkoutSync = null;
    if (linkedEvents.length > 0) {
      try {
        plannedWorkoutSync = await enqueueProviderPlannedActivityJobs(ctx, {
          eventIds: linkedEvents.map((event) => event.id),
          operation: "unsync",
        });
      } catch (error) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Activity plan cannot be deleted until linked device workouts can be unsynced",
          cause: error,
        });
      }

      if (plannedWorkoutSync && !plannedWorkoutSync.success) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Activity plan cannot be deleted until linked device workouts can be unsynced",
        });
      }
    }

    const deletedRows = await db
      .delete(activityPlans)
      .where(and(eq(activityPlans.id, input.id), eq(activityPlans.profile_id, ctx.session.user.id)))
      .returning({ id: activityPlans.id });

    if (deletedRows.length === 0) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Activity plan not found or you don't have permission to delete it",
      });
    }

    return {
      success: true,
      plannedWorkoutSync,
      wahooSync: plannedWorkoutSync,
    };
  }),

  duplicate: protectedProcedure
    .input(duplicateActivityPlanInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const estimationStore = createEventReadRepository(db);

      const [originalRow] = await db
        .select()
        .from(activityPlans)
        .where(eq(activityPlans.id, input.id))
        .limit(1);

      if (!originalRow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Original activity plan not found",
        });
      }

      await requireActivityPlanReadForRow({ db, plan: originalRow, userId: ctx.session.user.id });

      const originalPlan = serializeActivityPlanRow(originalRow);

      try {
        if (originalPlan.structure) {
          validateStructure(
            originalPlan.structure,
            originalPlan.activity_category as ActivityTargetCategory,
          );
        }
      } catch (validationError) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Original plan has invalid structure (V2 required)",
          cause: validationError,
        });
      }

      await computePlanMetrics(
        {
          activity_category: originalPlan.activity_category,
          structure: originalPlan.structure,
        },
        estimationStore,
        ctx.session.user.id,
      );

      const now = new Date();
      const [duplicatedRow] = await db
        .insert(activityPlans)
        .values({
          id: randomUUID(),
          created_at: now,
          updated_at: now,
          name: input.newName?.trim() || `${originalPlan.name} (Copy)`,
          description: originalPlan.description,
          notes: originalRow.notes ?? null,
          activity_category: originalPlan.activity_category,
          structure: originalPlan.structure,
          version: originalPlan.version,
          profile_id: ctx.session.user.id,
          template_visibility: "private",
          import_provider: null,
          import_external_id: null,
          is_system_template: false,
        })
        .returning();

      if (!duplicatedRow) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to duplicate activity plan",
        });
      }

      const planWithEstimation = await getActivityPlanDerivedMetrics(
        serializeActivityPlanRow(duplicatedRow),
        db,
        estimationStore,
        ctx.session.user.id,
      );

      return withIdentityFields(planWithEstimation);
    }),

  importFromFitTemplate: protectedProcedure
    .input(importedTemplateInput)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const estimationStore = getEstimationStore(ctx);
      const provider = "fit";
      const externalId = input.external_id.trim();

      const { action, row: persistedRow } = await upsertImportedActivityPlan(db, {
        externalId,
        profileId: ctx.session.user.id,
        provider,
        template: input,
      });

      if (!persistedRow) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to import FIT template",
        });
      }

      let withEstimation: SerializedActivityPlan | EstimatedActivityPlan =
        serializeActivityPlanRow(persistedRow);
      try {
        withEstimation = await getActivityPlanDerivedMetrics(
          serializeActivityPlanRow(persistedRow),
          db,
          estimationStore,
          ctx.session.user.id,
        );
      } catch (estimationError) {
        console.warn(
          "Failed to estimate activity import template; returning raw plan",
          estimationError,
        );
      }

      return {
        action,
        item: withIdentityFields(withEstimation),
      };
    }),

  importFromZwoTemplate: protectedProcedure
    .input(importedTemplateInput)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const estimationStore = getEstimationStore(ctx);
      const provider = "zwo";
      const externalId = input.external_id.trim();

      const { action, row: persistedRow } = await upsertImportedActivityPlan(db, {
        externalId,
        profileId: ctx.session.user.id,
        provider,
        template: input,
      });

      if (!persistedRow) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to import ZWO template",
        });
      }

      let withEstimation: SerializedActivityPlan | EstimatedActivityPlan =
        serializeActivityPlanRow(persistedRow);
      try {
        withEstimation = await getActivityPlanDerivedMetrics(
          serializeActivityPlanRow(persistedRow),
          db,
          estimationStore,
          ctx.session.user.id,
        );
      } catch (estimationError) {
        console.warn("Failed to estimate ZWO import template; returning raw plan", estimationError);
      }

      return {
        action,
        item: withIdentityFields(withEstimation),
      };
    }),
});
