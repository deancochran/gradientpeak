// packages/trpc/src/index.ts
import { createTRPCContext } from "./context";
import { appRouter } from "./routers";

export type { AppRouter } from "./routers";
export { createTRPCRouter, protectedProcedure, publicProcedure } from "./trpc";
export { appRouter, createTRPCContext };
