import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { ContentVisibility } from "@repo/core";
import { activityPlanStructureSchema } from "@repo/core/activity-plan";
import { activityPlanCreateSchema, activityPlanUpdateSchema } from "@repo/core/schemas";
import {
  type ActivityPlanInsert,
  type ActivityPlanRow,
  activityPlans,
  events,
  profiles,
  publicActivityCategorySchema,
  publicActivityPlansRowSchema,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gt, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  ActivityPlanDeleteNotFoundError,
  ActivityPlanLinkedEventsError,
  deleteActivityPlanUseCase,
} from "../application/activity-plans/delete-activity-plan";
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
import { enqueueWahooPlannedActivityJobs } from "../application/events";
import { getRequiredDb } from "../db";
import { createActivityPlanWriteRepository } from "../infrastructure/repositories";
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

function validateStructure(structure: unknown) {
  return activityPlanStructureSchema.parse(structure);
}

const createActivityPlanInput = activityPlanCreateSchema.safeExtend({
  gps_recording_enabled: z.boolean().default(true),
  structure: activityPlanStructureSchema,
  content_visibility: contentVisibilitySchema.optional(),
});

const updateActivityPlanInput = activityPlanUpdateSchema.safeExtend({
  gps_recording_enabled: z.boolean().optional(),
  structure: activityPlanStructureSchema.optional(),
  content_visibility: contentVisibilitySchema.optional(),
});

const updateActivityPlanWithIdInput = updateActivityPlanInput
  .safeExtend({
    id: uuidSchema,
    expectedStructureHash: z.string().regex(/^v1:sha256:[0-9a-f]{64}$/),
  })
  .strict()
  .superRefine((input, ctx) => {
    const updateKeys = Object.entries(input).filter(
      ([key, value]) => !["id", "expectedStructureHash"].includes(key) && value !== undefined,
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

function toPublicActivityPlan<T extends { structure: unknown }>(plan: T) {
  const parsed = activityPlanStructureSchema.safeParse(plan.structure);
  if (!parsed.success)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Stored activity plan is not valid",
    });
  return {
    ...plan,
    activity_category: parsed.data.activity_category,
  };
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

async function getProfileDefaultContentVisibility(
  db: ReturnType<typeof getRequiredDb>,
  profileId: string,
) {
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
  return {
    id: randomUUID(),
    created_at: now,
    updated_at: now,
    profile_id: profileId,
    name: input.name,
    description: input.description?.trim() ? input.description.trim() : null,
    notes: input.notes ?? null,
    structure: input.structure,
    structure_hash: activityPlanStructureHash(input.structure),
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

  getById: protectedProcedure.input(activityPlanIdInputSchema).query(async ({ ctx, input }) => {
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

    const planWithEstimation = await estimateActivityPlan(plan, db, userId);

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
              structure: plan.structure,
              structureHash: plan.structure_hash,
              gpsRecordingEnabled: plan.gps_recording_enabled,
              contentVisibility: plan.content_visibility,
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
    try {
      validateStructure(input.structure);
    } catch (validationError) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid activity plan structure",
        cause: validationError,
      });
    }

    const defaultContentVisibility = await getProfileDefaultContentVisibility(
      db,
      ctx.session.user.id,
    );

    const [createdRow] = await db
      .insert(activityPlans)
      .values(buildCreateValues(input, ctx.session.user.id, defaultContentVisibility))
      .returning();

    if (!createdRow) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to create activity plan",
      });
    }

    const planWithEstimation = await estimateActivityPlan(
      serializeActivityPlanRow(createdRow),
      db,
      ctx.session.user.id,
    );

    return toPublicActivityPlan(withIdentityFields(planWithEstimation));
  }),

  update: protectedProcedure
    .input(updateActivityPlanWithIdInput)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const { id, expectedStructureHash, ...updates } = input;

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

      if (!activityPlanRowSchema.safeParse(existingRow).success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Stored activity plan is not valid",
        });
      }
      if (existingRow.structure_hash !== expectedStructureHash) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "STALE_STRUCTURE_HASH",
          cause: {
            code: "STALE_STRUCTURE_HASH",
            expectedStructureHash,
            currentStructureHash: existingRow.structure_hash,
          },
        });
      }

      if (updates.structure) {
        try {
          validateStructure(updates.structure);
        } catch (validationError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid activity plan structure",
            cause: validationError,
          });
        }
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
        structure: updates.structure,
        structure_hash: updates.structure
          ? activityPlanStructureHash(updates.structure)
          : undefined,
        gps_recording_enabled: updates.gps_recording_enabled,
        content_visibility: updates.content_visibility,
      };

      const [updatedRow] = await db
        .update(activityPlans)
        .set(updateValues)
        .where(
          and(
            eq(activityPlans.id, id),
            eq(activityPlans.profile_id, ctx.session.user.id),
            eq(activityPlans.structure_hash, expectedStructureHash),
          ),
        )
        .returning();

      if (!updatedRow) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "STALE_STRUCTURE_HASH",
          cause: { code: "STALE_STRUCTURE_HASH", expectedStructureHash },
        });
      }

      let plannedActivitySync = null;
      const descriptionChanged =
        updates.description !== undefined && updateValues.description !== existingRow.description;
      const materialPlanChanged =
        (updates.name !== undefined && updates.name !== existingRow.name) ||
        descriptionChanged ||
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
            plannedActivitySync = await enqueueWahooPlannedActivityJobs(ctx, {
              eventIds: linkedEvents.map((event) => event.id),
              operation: "publish",
            });
          } catch (error) {
            plannedActivitySync = {
              affectedCount: linkedEvents.length,
              operation: "publish" as const,
              queued: false,
              success: false,
              error:
                error instanceof Error ? error.message : "Unknown planned activity enqueue failure",
            };
          }
        }
      }

      const planWithEstimation = await estimateActivityPlan(
        serializeActivityPlanRow(updatedRow),
        db,
        ctx.session.user.id,
      );

      return {
        ...toPublicActivityPlan(withIdentityFields(planWithEstimation)),
        plannedActivitySync,
      };
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
          message: "Remove all linked scheduled events before deleting this activity plan",
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
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Original activity plan not found",
        });
      }

      await requireActivityPlanReadForRow({ db, plan: originalRow, userId: ctx.session.user.id });

      const originalPlan = serializeActivityPlanRow(originalRow);

      if (!activityPlanStructureSchema.safeParse(originalPlan.structure).success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Original plan is not executable",
        });
      }

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
          structure: originalPlan.structure,
          structure_hash: activityPlanStructureHash(originalPlan.structure),
          gps_recording_enabled: originalPlan.gps_recording_enabled,
          profile_id: ctx.session.user.id,
          content_visibility: "private",
          is_system_template: false,
        })
        .returning();

      if (!duplicatedRow) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to duplicate activity plan",
        });
      }

      const planWithEstimation = await estimateActivityPlan(
        serializeActivityPlanRow(duplicatedRow),
        db,
        ctx.session.user.id,
      );

      return toPublicActivityPlan(withIdentityFields(planWithEstimation));
    }),
});
