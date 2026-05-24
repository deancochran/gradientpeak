import { createTRPCRouter } from "../../../trpc";
import { trainingPlansCreationProcedures } from "./base";

export const trainingPlansCreationRouter = createTRPCRouter(trainingPlansCreationProcedures);
