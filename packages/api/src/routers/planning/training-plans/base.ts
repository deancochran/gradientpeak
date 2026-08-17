import {
  canonicalActivityCategorySchema,
  planningLedgerRequestSchema,
  planningLedgerSchema,
  templateApplyInputSchema,
} from "@repo/core";
import { z } from "zod";
import {
  applyTrainingPlanTemplateUseCase,
  deleteTrainingPlanUseCase,
  getTrainingPlanTemplateUseCase,
  getTrainingPlanUseCase,
  listTrainingPlansUseCase,
  listTrainingPlanTemplatesUseCase,
  planTabProjectionInputSchema,
  planTabProjectionSchema,
  readPlanTabProjection,
  removeAppliedScheduleUseCase,
} from "../../../application/training-plan";
import { readPlanningLedger } from "../../../application/training-plan/planningLedgerService";
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

const applicationScopedScheduleInputSchema = z
  .object({
    schedule_batch_id: z.string().uuid(),
    training_plan_id: z.string().uuid(),
  })
  .strict();

const revisionFencedApplicationInputSchema = z
  .object({
    template_type: z.literal("training_plan"),
    template_id: z.string().uuid(),
    application_mode: z.enum(["full", "remaining"]).default("full"),
    start_date: z.iso.date().optional(),
    target_date: z.iso.date().optional(),
    replace_existing: z.boolean().optional(),
    basePublishedRevision: z.number().int().positive(),
  })
  .strict()
  .superRefine((data, context) => {
    if (data.start_date && data.target_date) {
      context.addIssue({
        code: "custom",
        message: "Cannot provide both start_date and target_date",
        path: ["target_date"],
      });
    }
    if (data.application_mode === "remaining" && !data.target_date) {
      context.addIssue({
        code: "custom",
        message: "Remaining application requires a target_date",
        path: ["target_date"],
      });
    }
  });

export const trainingPlansProcedures = {
  getPlanningLedger: protectedProcedure
    .input(planningLedgerRequestSchema)
    .output(planningLedgerSchema)
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

  applyRevisioned: protectedProcedure
    .input(revisionFencedApplicationInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { basePublishedRevision, ...values } = input;
      const profileId = ctx.session.user.id;
      const db = getRequiredDb(ctx);
      return applyTrainingPlanTemplateUseCase({
        db,
        permissions: createContentAccessPermissions(db),
        permissionsFactory: createContentAccessPermissions,
        profileId,
        repository: createTrainingPlanRepository(db),
        repositoryFactory: createTrainingPlanRepository,
        basePublishedRevision,
        values,
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
};
