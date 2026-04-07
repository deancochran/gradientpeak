import { createTRPCRouter } from "../../../trpc";
import { trainingPlansRouter as trainingPlansBaseRouter } from "./base";

export const trainingPlansCrudRouter = createTRPCRouter({
  get: trainingPlansBaseRouter._def.procedures.get,
  list: trainingPlansBaseRouter._def.procedures.list,
  exists: trainingPlansBaseRouter._def.procedures.exists,
  create: trainingPlansBaseRouter._def.procedures.create,
  update: trainingPlansBaseRouter._def.procedures.update,
  updateActivePlanStatus: trainingPlansBaseRouter._def.procedures.updateActivePlanStatus,
  getActivePlan: trainingPlansBaseRouter._def.procedures.getActivePlan,
  delete: trainingPlansBaseRouter._def.procedures.delete,
  duplicate: trainingPlansBaseRouter._def.procedures.duplicate,
  getById: trainingPlansBaseRouter._def.procedures.getById,
  applyQuickAdjustment: trainingPlansBaseRouter._def.procedures.applyQuickAdjustment,
  listTemplates: trainingPlansBaseRouter._def.procedures.listTemplates,
  getTemplate: trainingPlansBaseRouter._def.procedures.getTemplate,
  applyTemplate: trainingPlansBaseRouter._def.procedures.applyTemplate,
  autoAddPeriodization: trainingPlansBaseRouter._def.procedures.autoAddPeriodization,
});
