import { createTRPCRouter } from "../../../trpc";
import { trainingPlansAnalyticsProcedures } from "./base";

export const trainingPlansAnalyticsRouter = createTRPCRouter(trainingPlansAnalyticsProcedures);
