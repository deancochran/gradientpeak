import { createTRPCRouter } from "../../../trpc";
import { trainingPlansCrudProcedures } from "./base";

export const trainingPlansCrudRouter = createTRPCRouter(trainingPlansCrudProcedures);
