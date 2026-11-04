import {
  canonicalActivityCategorySchema,
  planningLedgerRequestSchema,
  planPeriodReviewRequestSchema,
} from "@repo/core";
import { z } from "zod";
import {
  appliedScheduleRemovalInputSchema,
  appliedScheduleRemovalPreviewInputSchema,
  applyTrainingPlanApplication,
  deleteTrainingPlanUseCase,
  getAppliedScheduleUseCase,
  getTrainingPlanTemplateUseCase,
  getTrainingPlanUseCase,
  listAppliedSchedulesUseCase,
  listTrainingPlansUseCase,
  listTrainingPlanTemplatesUseCase,
  planPeriodReviewResponseSchema,
  planTabProjectionInputSchema,
  planTabProjectionSchema,
  previewRemoveAppliedScheduleUseCase,
  readPlanPeriodReview,
  readPlanTabProjection,
  removeAppliedScheduleUseCase,
} from "../../../application/training-plan";
import {
  previewTrainingPlanApplication,
  trainingPlanApplicationApplyInputSchema,
  trainingPlanApplicationApplyResultSchema,
  trainingPlanApplicationPreviewInputSchema,
  trainingPlanApplicationPreviewResultSchema,
} from "../../../application/training-plan/applyTemplateUseCase";
import {
  planningLedgerResponseSchema,
  readPlanningLedger,
} from "../../../application/training-plan/planningLedgerService";
import {
  commitTrainingPlan,
  previewTrainingPlan,
  trainingPlanCommitInputSchema,
  trainingPlanCommitResultSchema,
  trainingPlanPreviewInputSchema,
  trainingPlanPreviewResultSchema,
} from "../../../application/training-plan/projection-planning";
import { getRequiredDb } from "../../../db";
import { createTrainingPlanRepository } from "../../../infrastructure";
import { protectedProcedure } from "../../../trpc";
import { indexCursorSchema } from "../../../utils/index-cursor";

const trainingPlanContentVisibilitySchema = z.enum(["private", "followers", "public"]);

const planScopedScheduleInputSchema = z
  .object({
    training_plan_id: z.string().uuid(),
  })
  .strict();

const appliedScheduleSchema = z
  .object({
    application_receipt: z.string().min(1),
    application_id: z.string().uuid(),
    planning_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    training_plan_id: z.string().uuid(),
  })
  .strict();
const listAppliedSchedulesInputSchema = planScopedScheduleInputSchema.extend({
  cursor: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(100),
});
const appliedScheduleListSchema = z
  .object({
    items: z.array(
      z
        .object({
          application_id: z.string().uuid(),
          application_revision: z.number().int().positive(),
          eligible_future_count: z.number().int().nonnegative(),
          next_planning_date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .nullable(),
          protected_count: z.number().int().nonnegative(),
          source_revision: z.number().int().positive(),
          start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })
        .strict(),
    ),
    nextCursor: z.string().uuid().nullable(),
  })
  .strict();

export const trainingPlansProcedures = {
  getPlanningLedger: protectedProcedure
    .input(planningLedgerRequestSchema)
    .output(planningLedgerResponseSchema)
    .query(({ ctx, input }) =>
      readPlanningLedger({
        db: getRequiredDb(ctx),
        profileId: ctx.session.user.id,
        request: input,
      }),
    ),

  getPlanTabProjection: protectedProcedure
    .input(planTabProjectionInputSchema)
    .output(planTabProjectionSchema)
    .query(({ ctx, input }) =>
      readPlanTabProjection({
        db: getRequiredDb(ctx),
        profileId: ctx.session.user.id,
        request: input,
      }),
    ),

  getPlanPeriodReview: protectedProcedure
    .input(planPeriodReviewRequestSchema)
    .output(planPeriodReviewResponseSchema)
    .query(({ ctx, input }) =>
      readPlanPeriodReview({
        db: getRequiredDb(ctx),
        profileId: ctx.session.user.id,
        request: input,
      }),
    ),

  preview: protectedProcedure
    .input(trainingPlanPreviewInputSchema)
    .output(trainingPlanPreviewResultSchema)
    .query(async ({ ctx, input }) =>
      previewTrainingPlan({
        db: getRequiredDb(ctx),
        profileId: ctx.session.user.id,
        values: input,
      }),
    ),

  commit: protectedProcedure
    .input(trainingPlanCommitInputSchema)
    .output(trainingPlanCommitResultSchema)
    .mutation(async ({ ctx, input }) =>
      commitTrainingPlan({
        db: getRequiredDb(ctx),
        profileId: ctx.session.user.id,
        values: input,
      }),
    ),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }).strict())
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      return getTrainingPlanUseCase({
        db,
        id: input.id,
        profileId: ctx.session.user.id,
        repository: createTrainingPlanRepository(db),
      });
    }),

  list: protectedProcedure
    .input(
      z
        .object({
          ownerScope: z.enum(["own", "system", "public", "all"]),
          visibility: trainingPlanContentVisibilitySchema.optional(),
          search: z.string().trim().max(80).optional(),
          limit: z.number().int().min(1).max(50).default(25),
          cursor: indexCursorSchema.optional(),
          direction: z.enum(["forward", "backward"]).optional(),
        })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      return listTrainingPlansUseCase({
        db,
        profileId: ctx.session.user.id,
        query: {
          ownerScope: input.ownerScope,
          limit: input.limit,
          ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
          ...(input.search !== undefined ? { search: input.search } : {}),
          ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
          ...(input.direction !== undefined ? { direction: input.direction } : {}),
        },
        repository: createTrainingPlanRepository(db),
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      return deleteTrainingPlanUseCase({
        db,
        id: input.id,
        profileId: ctx.session.user.id,
        repository: createTrainingPlanRepository(db),
      });
    }),

  listTemplates: protectedProcedure
    .input(
      z
        .object({
          activity_category: canonicalActivityCategorySchema.optional(),
          experience_level: z.enum(["beginner", "intermediate", "advanced"]).optional(),
          min_weeks: z.number().int().min(1).max(52).optional(),
          max_weeks: z.number().int().min(1).max(52).optional(),
          min_sessions_per_week: z.number().int().min(1).max(14).optional(),
          max_sessions_per_week: z.number().int().min(1).max(14).optional(),
          search: z.string().optional(),
          sort_by: z
            .enum([
              "newest",
              "oldest",
              "duration_desc",
              "duration_asc",
              "sessions_desc",
              "sessions_asc",
            ])
            .optional(),
          limit: z.number().int().min(1).max(50).default(25),
          cursor: indexCursorSchema.optional(),
          direction: z.enum(["forward", "backward"]).optional(),
        })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      return listTrainingPlanTemplatesUseCase({
        db,
        profileId: ctx.session.user.id,
        query: {
          limit: input.limit,
          ...(input.activity_category !== undefined
            ? { activity_category: input.activity_category }
            : {}),
          ...(input.experience_level !== undefined
            ? { experience_level: input.experience_level }
            : {}),
          ...(input.min_weeks !== undefined ? { min_weeks: input.min_weeks } : {}),
          ...(input.max_weeks !== undefined ? { max_weeks: input.max_weeks } : {}),
          ...(input.min_sessions_per_week !== undefined
            ? { min_sessions_per_week: input.min_sessions_per_week }
            : {}),
          ...(input.max_sessions_per_week !== undefined
            ? { max_sessions_per_week: input.max_sessions_per_week }
            : {}),
          ...(input.search !== undefined ? { search: input.search } : {}),
          ...(input.sort_by !== undefined ? { sort_by: input.sort_by } : {}),
          ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
          ...(input.direction !== undefined ? { direction: input.direction } : {}),
        },
        repository: createTrainingPlanRepository(db),
      });
    }),

  getTemplate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) =>
      getTrainingPlanTemplateUseCase({
        id: input.id,
        profileId: ctx.session.user.id,
        repository: createTrainingPlanRepository(getRequiredDb(ctx)),
      }),
    ),

  previewApplication: protectedProcedure
    .input(trainingPlanApplicationPreviewInputSchema)
    .output(trainingPlanApplicationPreviewResultSchema)
    .query(({ ctx, input }) =>
      previewTrainingPlanApplication({
        db: getRequiredDb(ctx),
        profileId: ctx.session.user.id,
        values: input,
      }),
    ),

  applyApplication: protectedProcedure
    .input(trainingPlanApplicationApplyInputSchema)
    .output(trainingPlanApplicationApplyResultSchema)
    .mutation(({ ctx, input }) =>
      applyTrainingPlanApplication({
        db: getRequiredDb(ctx),
        profileId: ctx.session.user.id,
        values: input,
      }),
    ),

  getAppliedSchedule: protectedProcedure
    .input(planScopedScheduleInputSchema)
    .output(appliedScheduleSchema.nullable())
    .query(({ ctx, input }) =>
      getAppliedScheduleUseCase({
        db: getRequiredDb(ctx),
        profileId: ctx.session.user.id,
        trainingPlanId: input.training_plan_id,
      }),
    ),

  listAppliedSchedules: protectedProcedure
    .input(listAppliedSchedulesInputSchema)
    .output(appliedScheduleListSchema)
    .query(({ ctx, input }) =>
      listAppliedSchedulesUseCase({
        db: getRequiredDb(ctx),
        limit: input.limit,
        profileId: ctx.session.user.id,
        trainingPlanId: input.training_plan_id,
        ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
      }),
    ),

  removeAppliedSchedule: protectedProcedure
    .input(appliedScheduleRemovalInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      return removeAppliedScheduleUseCase({
        db,
        profileId: ctx.session.user.id,
        applicationId: input.applicationId,
        operationId: input.operationId,
        previewFingerprint: input.previewFingerprint,
      });
    }),
  previewRemoveAppliedSchedule: protectedProcedure
    .input(appliedScheduleRemovalPreviewInputSchema)
    .query(({ ctx, input }) =>
      previewRemoveAppliedScheduleUseCase({
        db: getRequiredDb(ctx),
        profileId: ctx.session.user.id,
        applicationId: input.applicationId,
      }),
    ),
};
