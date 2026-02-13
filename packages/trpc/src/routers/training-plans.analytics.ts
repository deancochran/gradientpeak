import { createTRPCRouter } from "../trpc";
import { trainingPlansRouter as trainingPlansBaseRouter } from "./training-plans.base";

export const trainingPlansAnalyticsRouter = createTRPCRouter({
  getInsightTimeline:
    trainingPlansBaseRouter._def.procedures.getInsightTimeline,
  getCurrentStatus: trainingPlansBaseRouter._def.procedures.getCurrentStatus,
  getIdealCurve: trainingPlansBaseRouter._def.procedures.getIdealCurve,
  getActualCurve: trainingPlansBaseRouter._def.procedures.getActualCurve,
  getWeeklySummary: trainingPlansBaseRouter._def.procedures.getWeeklySummary,
  getIntensityDistribution:
    trainingPlansBaseRouter._def.procedures.getIntensityDistribution,
  getIntensityTrends:
    trainingPlansBaseRouter._def.procedures.getIntensityTrends,
  checkHardActivitySpacing:
    trainingPlansBaseRouter._def.procedures.checkHardActivitySpacing,
  getWeeklyTotals: trainingPlansBaseRouter._def.procedures.getWeeklyTotals,
});
