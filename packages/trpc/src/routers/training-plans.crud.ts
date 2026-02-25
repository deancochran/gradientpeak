import { createTRPCRouter } from "../trpc";
import { trainingPlansRouter as trainingPlansBaseRouter } from "./training-plans.base";

export const trainingPlansCrudRouter = createTRPCRouter({
  get: trainingPlansBaseRouter._def.procedures.get,
  list: trainingPlansBaseRouter._def.procedures.list,
  exists: trainingPlansBaseRouter._def.procedures.exists,
  create: trainingPlansBaseRouter._def.procedures.create,
  update: trainingPlansBaseRouter._def.procedures.update,
  activate: trainingPlansBaseRouter._def.procedures.activate,
  delete: trainingPlansBaseRouter._def.procedures.delete,
  getById: trainingPlansBaseRouter._def.procedures.getById,
  applyQuickAdjustment:
    trainingPlansBaseRouter._def.procedures.applyQuickAdjustment,
  listTemplates: trainingPlansBaseRouter._def.procedures.listTemplates,
  getTemplate: trainingPlansBaseRouter._def.procedures.getTemplate,
  autoAddPeriodization:
    trainingPlansBaseRouter._def.procedures.autoAddPeriodization,
});
