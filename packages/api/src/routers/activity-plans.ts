import { randomUUID } from "node:crypto";
import {
  activityPlanCreateSchema,
  activityPlanStructureSchemaV2,
  activityPlanUpdateSchema,
} from "@repo/core";
import {
  type ActivityPlanInsert,
  type ActivityPlanRow,
  activityPlans,
  likes,
  publicActivityCategorySchema,
  publicActivityPlansRowSchema,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, gt, ilike, inArray, lt, or } from "drizzle-orm";
import { z } from "zod";
import { getRequiredDb } from "../db";
import { createEventReadRepository } from "../infrastructure/repositories";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  addEstimationToPlan,
  addEstimationToPlans,
  computePlanMetrics,
} from "../utils/estimation-helpers";

// Input schemas for queries
const uuidSchema = z.string().uuid();
const templateVisibilitySchema = z.enum(["private", "public"]);
const activityCategoryFilterSchema = z.union([publicActivityCategorySchema, z.literal("all")]);

const listActivityPlansSchema = z
  .object({
    includeOwnOnly: z.boolean().default(true),
    includeSystemTemplates: z.boolean().default(false),
    includeEstimation: z.boolean().default(true),
    ownerScope: z.enum(["own", "system", "public", "all"]).optional(),
    visibility: z.enum(["private", "public"]).optional(),
    activityCategory: activityCategoryFilterSchema.optional(),
    search: z.string().optional(),
    limit: z.number().min(1).max(100).default(20),
    cursor: z.string().optional(),
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

const activityPlanLikeRowSchema = z.object({ entity_id: uuidSchema }).strict();

const activityPlanCountRowSchema = z
  .object({
    value: z.coerce.number().int().nonnegative(),
  })
  .strict();

const activityPlanLikeLookupRowSchema = z.object({ id: uuidSchema }).strict();

const activityPlanRowSchema = publicActivityPlansRowSchema
  .safeExtend({
    created_at: z.date(),
    updated_at: z.date(),
  })
  .strict();

const serializedActivityPlanSchema = activityPlanRowSchema.transform((row) => ({
  ...row,
  idx: row.idx ?? 0,
  created_at: row.created_at.toISOString(),
  updated_at: row.updated_at.toISOString(),
}));

function validateStructure(structure: unknown): void {
  activityPlanStructureSchemaV2.parse(structure);
}

function getEstimationStore(ctx: { db?: unknown }) {
  return createEventReadRepository(getRequiredDb(ctx as never));
}

const createActivityPlanInput = activityPlanCreateSchema.safeExtend({
  structure: activityPlanStructureSchemaV2,
  template_visibility: templateVisibilitySchema.optional(),
  import_provider: z.string().min(1).max(64).optional(),
  import_external_id: z.string().min(1).max(255).optional(),
});

const updateActivityPlanInput = activityPlanUpdateSchema.safeExtend({
  structure: activityPlanStructureSchemaV2.optional(),
  template_visibility: templateVisibilitySchema.optional(),
  import_provider: z.string().min(1).max(64).nullable().optional(),
  import_external_id: z.string().min(1).max(255).nullable().optional(),
});

const updateActivityPlanWithIdInput = updateActivityPlanInput
  .safeExtend({
    id: uuidSchema,
  })
  .strict();

const importedTemplateInput = z
  .object({
    external_id: z.string().min(1).max(255),
    name: z.string().min(1, "Plan name is required"),
    activity_category: publicActivityCategorySchema,
    description: z.string().max(1000).optional(),
    notes: z.string().max(2000).optional(),
    structure: activityPlanStructureSchemaV2,
  })
  .strict();

function serializeActivityPlanRow(row: ActivityPlanRow | unknown) {
  return serializedActivityPlanSchema.parse(row);
}

type SerializedActivityPlan = z.output<typeof serializedActivityPlanSchema>;
type EstimatedActivityPlan = Awaited<ReturnType<typeof addEstimationToPlan>>;
type DiscoverListActivityPlan = SerializedActivityPlan &
  Partial<
    Pick<
      EstimatedActivityPlan,
      | "estimated_tss"
      | "estimated_duration"
      | "estimated_calories"
      | "estimated_distance"
      | "estimated_zones"
      | "intensity_factor"
      | "confidence"
      | "confidence_score"
    >
  >;

function buildAccessiblePlanCondition(userId: string) {
  return or(
    eq(activityPlans.profile_id, userId),
    eq(activityPlans.is_system_template, true),
    eq(activityPlans.template_visibility, "public"),
  );
}

function buildOwnedPlanCondition(userId: string) {
  return eq(activityPlans.profile_id, userId);
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
    route_id: input.route_id ?? null,
    name: input.name,
    description: input.description || "",
    notes: input.notes ?? null,
    activity_category: input.activity_category,
    structure: input.structure,
    version: "1.0",
    template_visibility: templateVisibility,
    import_provider: input.import_provider ?? null,
    import_external_id: input.import_external_id ?? null,
    is_system_template: false,
    is_public: templateVisibility === "public",
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
    } else if (ownerScope === "all") {
      conditions.push(buildAccessiblePlanCondition(ctx.session.user.id));
    }

    if (input.visibility) {
      conditions.push(eq(activityPlans.template_visibility, input.visibility));
    }

    if (input.activityCategory && input.activityCategory !== "all") {
      conditions.push(eq(activityPlans.activity_category, input.activityCategory));
    }

    const trimmedSearch = input.search?.trim();

    if (trimmedSearch) {
      const pattern = `%${trimmedSearch}%`;
      conditions.push(
        or(ilike(activityPlans.name, pattern), ilike(activityPlans.description, pattern)),
      );
    }

    if (input.cursor) {
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

    const rows = await db
      .select()
      .from(activityPlans)
      .where(and(...conditions))
      .orderBy(desc(activityPlans.created_at), asc(activityPlans.id))
      .limit(limit + 1);

    const parsedRows = z.array(activityPlanRowSchema).parse(rows);

    const hasMore = parsedRows.length > limit;
    const pageRows = hasMore ? parsedRows.slice(0, limit) : parsedRows;
    const items = pageRows.map(serializeActivityPlanRow);

    const itemsWithOptionalEstimation: DiscoverListActivityPlan[] = input.includeEstimation
      ? await addEstimationToPlans(items, estimationStore, ctx.session.user.id)
      : items.map((plan) => ({
          ...plan,
          estimated_tss: undefined,
          estimated_duration: undefined,
          estimated_calories: undefined,
          estimated_distance: undefined,
          estimated_zones: undefined,
          intensity_factor: undefined,
          confidence: undefined,
          confidence_score: undefined,
        }));
    const planIds = itemsWithOptionalEstimation.map((plan) => plan.id);

    let userLikes: string[] = [];

    if (planIds.length > 0) {
      const likeRows = await db
        .select({ entity_id: likes.entity_id })
        .from(likes)
        .where(
          and(
            eq(likes.profile_id, ctx.session.user.id),
            eq(likes.entity_type, "activity_plan"),
            inArray(likes.entity_id, planIds),
          ),
        );

      userLikes = z
        .array(activityPlanLikeRowSchema)
        .parse(likeRows)
        .map((row) => row.entity_id);
    }

    let nextCursor: string | undefined;
    if (hasMore && pageRows.length > 0) {
      const lastItem = pageRows[pageRows.length - 1];
      if (!lastItem) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Missing pagination row" });
      }
      nextCursor = `${lastItem.created_at.toISOString()}_${lastItem.id}`;
    }

    return {
      items: itemsWithOptionalEstimation.map((plan) => ({
        ...withIdentityFields(plan),
        has_liked: userLikes.includes(plan.id),
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

    const isOwner = planRow.profile_id === userId;
    const isSystemTemplate = planRow.is_system_template === true;
    const isPublic = planRow.template_visibility === "public";

    if (!isOwner && !isSystemTemplate && !isPublic) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You don't have permission to view this activity plan",
      });
    }

    const plan = serializeActivityPlanRow(planRow);

    try {
      if (plan.structure) {
        validateStructure(plan.structure);
      }
    } catch (validationError) {
      console.error("Invalid V2 structure in database for plan", input.id, validationError);
    }

    const planWithEstimation = await addEstimationToPlan(plan, estimationStore, userId);

    const [rawLikeRow] = await db
      .select({ id: likes.id })
      .from(likes)
      .where(
        and(
          eq(likes.profile_id, userId),
          eq(likes.entity_type, "activity_plan"),
          eq(likes.entity_id, input.id),
        ),
      )
      .limit(1);

    const likeRow = rawLikeRow ? activityPlanLikeLookupRowSchema.parse(rawLikeRow) : null;

    return {
      ...withIdentityFields(planWithEstimation),
      has_liked: !!likeRow,
    };
  }),

  getManyByIds: protectedProcedure
    .input(getManyActivityPlansByIdsSchema)
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const estimationStore = createEventReadRepository(db);
      const userId = ctx.session.user.id;
      const ids = Array.from(new Set(input.ids));

      const planRows = await db
        .select()
        .from(activityPlans)
        .where(and(inArray(activityPlans.id, ids), buildAccessiblePlanCondition(userId)));

      const parsedPlanRows = z.array(activityPlanRowSchema).parse(planRows);

      const planById = new Map(
        parsedPlanRows.map((plan) => [plan.id, serializeActivityPlanRow(plan)]),
      );
      const orderedPlans = ids
        .map((id) => planById.get(id))
        .filter((plan): plan is SerializedActivityPlan => !!plan);

      const itemsWithEstimation = await addEstimationToPlans(orderedPlans, estimationStore, userId);
      const planIds = itemsWithEstimation.map((plan) => plan.id);

      let userLikes: string[] = [];

      if (planIds.length > 0) {
        const likeRows = await db
          .select({ entity_id: likes.entity_id })
          .from(likes)
          .where(
            and(
              eq(likes.profile_id, userId),
              eq(likes.entity_type, "activity_plan"),
              inArray(likes.entity_id, planIds),
            ),
          );

        userLikes = z
          .array(activityPlanLikeRowSchema)
          .parse(likeRows)
          .map((row) => row.entity_id);
      }

      return {
        items: itemsWithEstimation.map((plan) => ({
          ...withIdentityFields(plan),
          has_liked: userLikes.includes(plan.id),
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
      validateStructure(input.structure);
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
        route_id: input.route_id,
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

    const planWithEstimation = await addEstimationToPlan(
      serializeActivityPlanRow(createdRow),
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

      if (updates.structure) {
        try {
          validateStructure(updates.structure);
        } catch (validationError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid activity plan structure (V2 required)",
            cause: validationError,
          });
        }
      }

      let metricsUpdates: Partial<ActivityPlanInsert> = {};
      if (updates.structure || updates.route_id !== undefined || updates.activity_category) {
        await computePlanMetrics(
          {
            activity_category: updates.activity_category || existingRow.activity_category,
            structure: updates.structure || existingRow.structure,
            route_id: updates.route_id !== undefined ? updates.route_id : existingRow.route_id,
          },
          estimationStore,
          ctx.session.user.id,
        );
      }

      const updateValues: Partial<ActivityPlanInsert> = {
        updated_at: new Date(),
        name: updates.name,
        description: updates.description === undefined ? undefined : (updates.description ?? ""),
        notes: updates.notes,
        activity_category: updates.activity_category,
        structure: updates.structure,
        version: updates.version,
        route_id: updates.route_id,
        template_visibility: updates.template_visibility,
        import_provider: updates.import_provider,
        import_external_id: updates.import_external_id,
        is_public:
          updates.template_visibility === undefined
            ? undefined
            : updates.template_visibility === "public",
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

      const planWithEstimation = await addEstimationToPlan(
        serializeActivityPlanRow(updatedRow),
        estimationStore,
        ctx.session.user.id,
      );

      return withIdentityFields(planWithEstimation);
    }),

  delete: protectedProcedure.input(activityPlanIdInputSchema).mutation(async ({ ctx, input }) => {
    const db = getRequiredDb(ctx);

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

    return { success: true };
  }),

  duplicate: protectedProcedure
    .input(duplicateActivityPlanInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const estimationStore = createEventReadRepository(db);

      const [originalRow] = await db
        .select()
        .from(activityPlans)
        .where(
          and(eq(activityPlans.id, input.id), buildAccessiblePlanCondition(ctx.session.user.id)),
        )
        .limit(1);

      if (!originalRow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Original activity plan not found",
        });
      }

      const originalPlan = serializeActivityPlanRow(originalRow);

      try {
        if (originalPlan.structure) {
          validateStructure(originalPlan.structure);
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
          route_id: originalPlan.route_id,
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
          route_id: originalPlan.route_id,
          profile_id: ctx.session.user.id,
          template_visibility: "private",
          import_provider: null,
          import_external_id: null,
          is_system_template: false,
          is_public: false,
        })
        .returning();

      if (!duplicatedRow) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to duplicate activity plan",
        });
      }

      const planWithEstimation = await addEstimationToPlan(
        serializeActivityPlanRow(duplicatedRow),
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

      const [existingRow] = await db
        .select()
        .from(activityPlans)
        .where(
          and(
            eq(activityPlans.profile_id, ctx.session.user.id),
            eq(activityPlans.import_provider, provider),
            eq(activityPlans.import_external_id, externalId),
          ),
        )
        .limit(1);

      const payload: Partial<ActivityPlanInsert> = {
        updated_at: new Date(),
        name: input.name,
        description: input.description ?? "",
        notes: input.notes ?? null,
        activity_category: input.activity_category,
        structure: input.structure,
        version: "1.0",
        profile_id: ctx.session.user.id,
        template_visibility: "private",
        import_provider: provider,
        import_external_id: externalId,
        is_system_template: false,
        is_public: false,
      };

      const [persistedRow] = existingRow
        ? await db
            .update(activityPlans)
            .set(payload)
            .where(
              and(
                eq(activityPlans.id, existingRow.id),
                eq(activityPlans.profile_id, ctx.session.user.id),
              ),
            )
            .returning()
        : await db
            .insert(activityPlans)
            .values({
              id: randomUUID(),
              created_at: new Date(),
              ...payload,
            } as ActivityPlanInsert)
            .returning();

      if (!persistedRow) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to import FIT template",
        });
      }

      let withEstimation: SerializedActivityPlan | EstimatedActivityPlan =
        serializeActivityPlanRow(persistedRow);
      try {
        withEstimation = await addEstimationToPlan(
          serializeActivityPlanRow(persistedRow),
          estimationStore,
          ctx.session.user.id,
        );
      } catch (estimationError) {
        console.warn("Failed to estimate FIT import template; returning raw plan", estimationError);
      }

      return {
        action: existingRow ? "updated" : "created",
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

      const [existingRow] = await db
        .select()
        .from(activityPlans)
        .where(
          and(
            eq(activityPlans.profile_id, ctx.session.user.id),
            eq(activityPlans.import_provider, provider),
            eq(activityPlans.import_external_id, externalId),
          ),
        )
        .limit(1);

      const payload: Partial<ActivityPlanInsert> = {
        updated_at: new Date(),
        name: input.name,
        description: input.description ?? "",
        notes: input.notes ?? null,
        activity_category: input.activity_category,
        structure: input.structure,
        version: "1.0",
        profile_id: ctx.session.user.id,
        template_visibility: "private",
        import_provider: provider,
        import_external_id: externalId,
        is_system_template: false,
        is_public: false,
      };

      const [persistedRow] = existingRow
        ? await db
            .update(activityPlans)
            .set(payload)
            .where(
              and(
                eq(activityPlans.id, existingRow.id),
                eq(activityPlans.profile_id, ctx.session.user.id),
              ),
            )
            .returning()
        : await db
            .insert(activityPlans)
            .values({
              id: randomUUID(),
              created_at: new Date(),
              ...payload,
            } as ActivityPlanInsert)
            .returning();

      if (!persistedRow) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to import ZWO template",
        });
      }

      let withEstimation: SerializedActivityPlan | EstimatedActivityPlan =
        serializeActivityPlanRow(persistedRow);
      try {
        withEstimation = await addEstimationToPlan(
          serializeActivityPlanRow(persistedRow),
          estimationStore,
          ctx.session.user.id,
        );
      } catch (estimationError) {
        console.warn("Failed to estimate ZWO import template; returning raw plan", estimationError);
      }

      return {
        action: existingRow ? "updated" : "created",
        item: withIdentityFields(withEstimation),
      };
    }),
});
