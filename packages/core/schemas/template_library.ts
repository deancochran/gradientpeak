import { z } from "zod";

export const templateItemTypeSchema = z.enum(["training_plan", "activity_plan"]);
export const trainingPlanApplicationModeSchema = z.enum(["full", "remaining"]);

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const templateApplyInputSchema = z
  .object({
    template_type: templateItemTypeSchema,
    template_id: z.string().uuid(),
    application_mode: trainingPlanApplicationModeSchema.default("full"),
    start_date: dateOnlySchema.optional(),
    target_date: dateOnlySchema.optional(),
    replace_existing: z.boolean().optional(),
  })
  .refine((data) => !(data.start_date && data.target_date), {
    message: "Cannot provide both start_date and target_date",
    path: ["target_date"],
  })
  .refine((data) => data.application_mode !== "remaining" || Boolean(data.target_date), {
    message: "Remaining application requires a target_date",
    path: ["target_date"],
  });

export type TemplateItemType = z.infer<typeof templateItemTypeSchema>;
export type TrainingPlanApplicationMode = z.infer<typeof trainingPlanApplicationModeSchema>;
export type TemplateApplyInput = z.infer<typeof templateApplyInputSchema>;
