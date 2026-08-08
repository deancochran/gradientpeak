import {
  canonicalActivityCategorySchema,
  dateOnlySchema,
  templateApplyInputSchema,
} from "@repo/core";
import { z } from "zod";
import {
  applyTrainingPlanTemplateUseCase,
  deleteTrainingPlanUseCase,
  getActivePlanUseCase,
  getTrainingPlanByIdUseCase,
  getTrainingPlanTemplateUseCase,
  getTrainingPlanUseCase,
  listTrainingPlansUseCase,
  listTrainingPlanTemplatesUseCase,
  planTabProjectionInputSchema,
  planTabProjectionSchema,
  readPlanTabProjection,
  removeAppliedScheduleUseCase,
  reorderTrainingPlanActivitiesUseCase,
} from "../../../application/training-plan";
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
import { createContentAccessPermissions } from "../../../permissions/content-access";
import { protectedProcedure } from "../../../trpc";
import { indexCursorSchema } from "../../../utils/index-cursor";

const trainingPlanContentVisibilitySchema = z.enum(["private", "followers", "public"]);

const reorderTrainingPlanActivitiesInputSchema = z
  .object({
    training_plan_id: z.string().uuid(),
    changes: z
      .array(
        z
          .object({
            event_id: z.string().uuid(),
            expected_scheduled_date: dateOnlySchema,
            requested_scheduled_date: dateOnlySchema,
          })
          .strict()
          .refine((change) => change.expected_scheduled_date !== change.requested_scheduled_date, {
            message: "Requested activity date must differ from the expected date",
          }),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((input, context) => {
    const eventIds = new Set<string>();
    input.changes.forEach((change, index) => {
      if (eventIds.has(change.event_id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Activity event IDs must be unique",
          path: ["changes", index, "event_id"],
        });
      }
      eventIds.add(change.event_id);
    });
  });

const applicationScopedScheduleInputSchema = z
  .object({
    schedule_batch_id: z.string().uuid(),
    training_plan_id: z.string().uuid(),
  })
  .strict();

export const trainingPlansProcedures = {
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
    .input(z.object({ id: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      return getTrainingPlanUseCase({
        db,
        id: input?.id,
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
        })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      return listTrainingPlansUseCase({
        db,
        profileId: ctx.session.user.id,
        query: input,
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

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      return getTrainingPlanByIdUseCase({
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
        })
        .strict(),
    )
    .query(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      return listTrainingPlanTemplatesUseCase({
        db,
        profileId: ctx.session.user.id,
        query: input,
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

  applyTemplate: protectedProcedure
    .input(templateApplyInputSchema)
    .mutation(async ({ ctx, input }) => {
      const profileId = ctx.session.user.id;
      const db = getRequiredDb(ctx);
      return applyTrainingPlanTemplateUseCase({
        db,
        permissions: createContentAccessPermissions(db),
        permissionsFactory: createContentAccessPermissions,
        profileId,
        repository: createTrainingPlanRepository(db),
        repositoryFactory: createTrainingPlanRepository,
        values: input,
      });
    }),

  removeAppliedSchedule: protectedProcedure
    .input(applicationScopedScheduleInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      return removeAppliedScheduleUseCase({
        db,
        permissions: createContentAccessPermissions(db),
        permissionsFactory: createContentAccessPermissions,
        profileId: ctx.session.user.id,
        scheduleBatchId: input.schedule_batch_id,
        trainingPlanId: input.training_plan_id,
      });
    }),

  reorderActivities: protectedProcedure
    .input(reorderTrainingPlanActivitiesInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      return reorderTrainingPlanActivitiesUseCase({
        changes: input.changes,
        db,
        profileId: ctx.session.user.id,
        trainingPlanId: input.training_plan_id,
      });
    }),

  getActivePlan: protectedProcedure.query(async ({ ctx }) =>
    getActivePlanUseCase({
      profileId: ctx.session.user.id,
      repository: createTrainingPlanRepository(getRequiredDb(ctx)),
    }),
  ),
};
