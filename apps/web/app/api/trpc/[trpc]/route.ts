// apps/web/app/api/trpc/[...trpc]/route.ts
import { appRouter, createTRPCContext } from "@repo/trpc";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

const handler = (request: Request) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: createTRPCContext,
  });
};

export { handler as GET, handler as POST };
