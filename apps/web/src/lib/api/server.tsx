import { type AppRouter, appRouter, createApiContext, createQueryClient } from "@repo/api/server";
import { resolveAuthSession } from "@repo/auth/server";
import { db } from "@repo/db/client";
import { type DehydratedState, dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { TRPCQueryOptions as ApiQueryOptions } from "@trpc/tanstack-react-query";
import { createTRPCOptionsProxy as createApiOptionsProxy } from "@trpc/tanstack-react-query";
import { headers } from "next/headers";
import { cache } from "react";

/**
 * This wraps `createApiContext` with the request state needed for server-rendered API queries.
 */
const createContext = cache(async () => {
  const heads = new Headers(await headers());
  heads.set("x-api-source", "rsc");
  return createApiContext({
    headers: heads,
    auth: {
      resolveSession: resolveAuthSession,
    },
    db,
  });
});

const getQueryClient = cache(createQueryClient);

export const api = createApiOptionsProxy<AppRouter>({
  router: appRouter,
  ctx: createContext,
  queryClient: getQueryClient,
});

// Export for route handlers and other server-side code
export async function createServerCaller() {
  const context = await createContext();
  return appRouter.createCaller(context);
}

interface HydrateClientProps {
  children: React.ReactNode;
  state?: DehydratedState;
}

export function HydrateClient({ children, state }: HydrateClientProps) {
  return <HydrationBoundary state={state}>{children}</HydrationBoundary>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function prefetch<T extends ReturnType<ApiQueryOptions<any>>>(queryOptions: T) {
  const queryClient = getQueryClient();
  if (queryOptions.queryKey[1]?.type === "infinite") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void queryClient.prefetchInfiniteQuery(queryOptions as any);
  } else {
    void queryClient.prefetchQuery(queryOptions);
  }
}

// Helper function to get dehydrated state after prefetching
export function getDehydratedState() {
  const queryClient = getQueryClient();
  return dehydrate(queryClient);
}
