import { z } from "zod";

export const templateItemTypeSchema = z.enum([
  "training_plan",
  "activity_plan",
]);

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const templateApplyInputSchema = z.object({
  template_type: templateItemTypeSchema,
  template_id: z.string().uuid(),
  start_date: dateOnlySchema.optional(),
  goal_date: dateOnlySchema.optional(),
});

export const libraryItemCreateSchema = z.object({
  item_type: templateItemTypeSchema,
  item_id: z.string().uuid(),
});

export type TemplateItemType = z.infer<typeof templateItemTypeSchema>;
export type TemplateApplyInput = z.infer<typeof templateApplyInputSchema>;
export type LibraryItemCreateInput = z.infer<typeof libraryItemCreateSchema>;
