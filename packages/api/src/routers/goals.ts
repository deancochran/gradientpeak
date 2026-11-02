import { randomUUID } from "node:crypto";
import {
  canonicalGoalActivityCategorySchema,
  canonicalGoalObjectiveSchema,
  dateOnlySchema,
  type profileGoalCreateSchema,
  profileGoalRecordSchema,
} from "@repo/core";
import { profileGoals } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, ilike } from "drizzle-orm";
import { z } from "zod";
import {
  getProfileGoalById,
  type ProfileGoalRecord,
} from "../application/goals/getProfileGoalById";
import { profileGoalWriteDataSchema } from "../application/goals/profile-goal-write";
import { withAuthorizedAthleteReadAcrossOrganizations } from "../application/organizations/authorize-athlete-read";
import { type DrizzleQueryExecutor, getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { buildIndexPageInfo, indexCursorSchema, parseIndexCursor } from "../utils/index-cursor";
import {
  type ConsentAwareAthleteReadAuthorizer,
  readProfileWithAthleteConsent,
} from "./account/athlete-read-access";
import { withProfileWriteAccess } from "./account/profile-access";

function rethrowTrpcError(error: unknown): never | undefined {
  if (error instanceof TRPCError) {
    throw error;
  }
}

function rethrowPrivateGoalTrpcError(error: unknown): never | undefined {
  if (!(error instanceof TRPCError)) return;
  if (error.code === "FORBIDDEN") {
    throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found" });
  }
  throw error;
}

function getSafeErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code.slice(0, 32) : null;
}

const goalIdSchema = z.string().uuid();

const goalsListInputSchema = z
  .object({
    profile_id: z.string().uuid(),
    search: z.string().trim().max(80).optional(),
    activity_category: canonicalGoalActivityCategorySchema.optional(),
    sort_by: z.enum(["created_at", "target_date", "priority"]).default("created_at"),
    sort_order: z.enum(["asc", "desc"]).default("desc"),
    limit: z.number().int().min(1).max(50).default(25),
    cursor: indexCursorSchema.optional(),
    direction: z.enum(["forward", "backward"]).optional(),
  })
  .strict();

const profileGoalWriteSchema = profileGoalWriteDataSchema.extend({ profile_id: z.string().uuid() });
const profileGoalUpdateDataSchema = z
  .object({
    target_date: dateOnlySchema,
    title: z.string().trim().min(1).max(100),
    priority: z.number().int().min(0).max(10),
    activity_category: canonicalGoalActivityCategorySchema,
    target_payload: canonicalGoalObjectiveSchema,
  })
  .partial()
  .strict();

const goalIdInputSchema = z.object({ id: goalIdSchema }).strict();

const profileGoalUpdateInputSchema = z
  .object({
    id: goalIdSchema,
    data: profileGoalUpdateDataSchema,
  })
  .strict();

function buildGoalListConditions(input: {
  profileId: string;
  search?: string;
  activityCategory?: z.infer<typeof canonicalGoalActivityCategorySchema>;
}) {
  const conditions = [eq(profileGoals.profile_id, input.profileId)];

  if (input.search) {
    conditions.push(ilike(profileGoals.title, `%${input.search}%`));
  }

  if (input.activityCategory) {
    conditions.push(eq(profileGoals.activity_category, input.activityCategory));
  }

  return conditions;
}

async function listProfileGoals(input: {
  db: DrizzleQueryExecutor;
  profileId: string;
  search?: string;
  activityCategory?: z.infer<typeof canonicalGoalActivityCategorySchema>;
  sortBy: "created_at" | "target_date" | "priority";
  sortOrder: "asc" | "desc";
  limit: number;
  offset: number;
}): Promise<ProfileGoalRecord[]> {
  const conditions = buildGoalListConditions(input);

  const sortColumn =
    input.sortBy === "target_date"
      ? profileGoals.target_date
      : input.sortBy === "priority"
        ? profileGoals.priority
        : profileGoals.created_at;
  const orderBy = input.sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn);

  const rows = await input.db
    .select({
      id: profileGoals.id,
      profile_id: profileGoals.profile_id,
      target_date: profileGoals.target_date,
      title: profileGoals.title,
      priority: profileGoals.priority,
      activity_category: profileGoals.activity_category,
      target_payload: profileGoals.target_payload,
    })
    .from(profileGoals)
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(input.limit)
    .offset(input.offset);

  return profileGoalRecordSchema.array().parse(rows);
}

async function getProfileGoalOwnerId(db: DrizzleQueryExecutor, id: string): Promise<string | null> {
  const [row] = await db
    .select({ profile_id: profileGoals.profile_id })
    .from(profileGoals)
    .where(eq(profileGoals.id, id))
    .limit(1);
  return row?.profile_id ?? null;
}

async function createProfileGoal(input: {
  db: DrizzleQueryExecutor;
  values: z.infer<typeof profileGoalCreateSchema>;
}): Promise<ProfileGoalRecord> {
  const [row] = await input.db
    .insert(profileGoals)
    .values({
      id: randomUUID(),
      profile_id: input.values.profile_id,
      target_date: input.values.target_date,
      title: input.values.title,
      priority: input.values.priority,
      activity_category: input.values.activity_category,
      target_payload: input.values.target_payload,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning({
      id: profileGoals.id,
      profile_id: profileGoals.profile_id,
      target_date: profileGoals.target_date,
      title: profileGoals.title,
      priority: profileGoals.priority,
      activity_category: profileGoals.activity_category,
      target_payload: profileGoals.target_payload,
    });

  return profileGoalRecordSchema.parse(row);
}

async function updateProfileGoal(input: {
  db: DrizzleQueryExecutor;
  id: string;
  profileId: string;
  data: ProfileGoalRecord;
}): Promise<ProfileGoalRecord | null> {
  const [row] = await input.db
    .update(profileGoals)
    .set({
      target_date: input.data.target_date,
      title: input.data.title,
      priority: input.data.priority,
      activity_category: input.data.activity_category,
      target_payload: input.data.target_payload,
      updated_at: new Date(),
    })
    .where(and(eq(profileGoals.id, input.id), eq(profileGoals.profile_id, input.profileId)))
    .returning({
      id: profileGoals.id,
      profile_id: profileGoals.profile_id,
      target_date: profileGoals.target_date,
      title: profileGoals.title,
      priority: profileGoals.priority,
      activity_category: profileGoals.activity_category,
      target_payload: profileGoals.target_payload,
    });

  return row ? profileGoalRecordSchema.parse(row) : null;
}

async function deleteProfileGoal(input: {
  db: DrizzleQueryExecutor;
  id: string;
  profileId: string;
}): Promise<boolean> {
  const [row] = await input.db
    .delete(profileGoals)
    .where(and(eq(profileGoals.id, input.id), eq(profileGoals.profile_id, input.profileId)))
    .returning({ id: profileGoals.id });
  return Boolean(row);
}

export function createGoalsRouter(
  authorizeRead: ConsentAwareAthleteReadAuthorizer = withAuthorizedAthleteReadAcrossOrganizations,
) {
  return createTRPCRouter({
    list: protectedProcedure.input(goalsListInputSchema).query(async ({ ctx, input }) => {
      const offset = parseIndexCursor(input.cursor);
      return readProfileWithAthleteConsent({
        ctx,
        profileId: input.profile_id,
        scope: "goals",
        deniedCode: "FORBIDDEN",
        deniedMessage: "You are not authorized to access this profile",
        authorizeRead,
        read: async (db) => {
          const conditions = buildGoalListConditions({
            profileId: input.profile_id,
            ...(input.search === undefined ? {} : { search: input.search }),
            ...(input.activity_category === undefined
              ? {}
              : { activityCategory: input.activity_category }),
          });

          try {
            const [items, totalRows] = await Promise.all([
              listProfileGoals({
                db,
                profileId: input.profile_id,
                ...(input.search === undefined ? {} : { search: input.search }),
                ...(input.activity_category === undefined
                  ? {}
                  : { activityCategory: input.activity_category }),
                sortBy: input.sort_by,
                sortOrder: input.sort_order,
                limit: input.limit,
                offset,
              }),
              db
                .select({ total: count() })
                .from(profileGoals)
                .where(and(...conditions)),
            ]);

            const total = Number(totalRows[0]?.total ?? 0);
            return {
              items,
              total,
              ...buildIndexPageInfo({ offset, limit: input.limit, total }),
            };
          } catch (error) {
            rethrowTrpcError(error);
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to list profile goals",
            });
          }
        },
      });
    }),

    getById: protectedProcedure.input(goalIdInputSchema).query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      const profileId = await getProfileGoalOwnerId(db, input.id);
      if (!profileId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Goal not found",
        });
      }
      return readProfileWithAthleteConsent({
        ctx,
        profileId,
        scope: "goals",
        deniedCode: "NOT_FOUND",
        deniedMessage: "Goal not found",
        authorizeRead,
        read: async (authorizedDb) => {
          const goal = await getProfileGoalById(authorizedDb, input.id);
          if (!goal || goal.profile_id !== profileId) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found" });
          }
          return goal;
        },
      });
    }),

    create: protectedProcedure.input(profileGoalWriteSchema).mutation(async ({ ctx, input }) => {
      try {
        const createdGoal = await withProfileWriteAccess({
          ctx,
          profileId: input.profile_id,
          write: (tx) =>
            createProfileGoal({
              db: tx,
              values: {
                profile_id: input.profile_id,
                target_date: input.target_date,
                title: input.title,
                priority: input.priority,
                activity_category: input.activity_category,
                target_payload: input.target_payload,
              },
            }),
        });

        return {
          ...createdGoal,
          cache_tags: ["goals.list", "goals.getById"],
        };
      } catch (error) {
        rethrowTrpcError(error);
        console.error("goals.create failed", {
          errorCode: getSafeErrorCode(error),
        });

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create goal",
        });
      }
    }),

    update: protectedProcedure
      .input(profileGoalUpdateInputSchema)
      .mutation(async ({ ctx, input }) => {
        const db = getRequiredDb(ctx);

        const existingGoal = await getProfileGoalById(db, input.id);

        if (!existingGoal) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Goal not found",
          });
        }

        const mergedGoal = profileGoalRecordSchema.safeParse({
          ...existingGoal,
          ...input.data,
        });

        if (!mergedGoal.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Goal update payload is invalid",
            cause: mergedGoal.error.flatten(),
          });
        }

        try {
          const updatedGoal = await withProfileWriteAccess({
            ctx,
            profileId: existingGoal.profile_id,
            write: (tx) =>
              updateProfileGoal({
                db: tx,
                id: input.id,
                profileId: existingGoal.profile_id,
                data: mergedGoal.data,
              }),
          });

          if (!updatedGoal) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "You are not authorized to access this profile",
            });
          }
          return {
            ...updatedGoal,
            cache_tags: ["goals.list", "goals.getById"],
          };
        } catch (error) {
          rethrowPrivateGoalTrpcError(error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to update goal",
          });
        }
      }),

    delete: protectedProcedure.input(goalIdInputSchema).mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);

      const existingGoal = await getProfileGoalById(db, input.id);

      if (!existingGoal) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Goal not found",
        });
      }

      try {
        const deleted = await withProfileWriteAccess({
          ctx,
          profileId: existingGoal.profile_id,
          write: (tx) =>
            deleteProfileGoal({
              db: tx,
              id: input.id,
              profileId: existingGoal.profile_id,
            }),
        });
        if (!deleted) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not authorized to access this profile",
          });
        }
      } catch (error) {
        rethrowPrivateGoalTrpcError(error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete goal",
        });
      }

      return {
        success: true,
        cache_tags: ["goals.list", "goals.getById"],
      };
    }),
  });
}

export const goalsRouter = createGoalsRouter();
