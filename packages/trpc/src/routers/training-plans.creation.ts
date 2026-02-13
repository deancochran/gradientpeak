import { createTRPCRouter } from "../trpc";
import { trainingPlansRouter as trainingPlansBaseRouter } from "./training-plans.base";

export const trainingPlansCreationRouter = createTRPCRouter({
  getCreationSuggestions:
    trainingPlansBaseRouter._def.procedures.getCreationSuggestions,
  previewCreationConfig:
    trainingPlansBaseRouter._def.procedures.previewCreationConfig,
  createFromCreationConfig:
    trainingPlansBaseRouter._def.procedures.createFromCreationConfig,
  createFromMinimalGoal:
    trainingPlansBaseRouter._def.procedures.createFromMinimalGoal,
  getFeasibilityPreview:
    trainingPlansBaseRouter._def.procedures.getFeasibilityPreview,
});
