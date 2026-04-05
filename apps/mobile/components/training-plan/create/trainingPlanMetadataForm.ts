import { z } from "zod";

export const trainingPlanMetadataFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Plan name is required.")
    .max(120, "Plan name must be 120 characters or fewer."),
  description: z.string().trim().max(500, "Description must be 500 characters or fewer."),
});

export type TrainingPlanMetadataFormData = z.input<typeof trainingPlanMetadataFormSchema>;
export type TrainingPlanMetadataFormValues = z.output<typeof trainingPlanMetadataFormSchema>;

export const emptyTrainingPlanMetadataFormData: TrainingPlanMetadataFormData = {
  name: "",
  description: "",
};
