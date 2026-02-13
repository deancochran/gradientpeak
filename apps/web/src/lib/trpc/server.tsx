import {
  appRouter,
  createQueryClient,
  createTRPCContext,
  type AppRouter,
} from "@repo/trpc/server";
import {
  dehydrate,
  HydrationBoundary,
  type DehydratedState,
} from "@tanstack/react-query";
import type { TRPCQueryOptions } from "@trpc/tanstack-react-query";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { headers } from "next/headers";
import { cache } from "react";
import { createClient } from "../supabase/server";

/**
 * This wraps the `createTRPCContext` helper and provides the required context for the tRPC API when
 * handling a tRPC call from a React Server Component.
 */
const createContext = cache(async () => {
  const heads = new Headers(await headers());
  heads.set("x-trpc-source", "rsc");
  const supabase = await createClient();
  return createTRPCContext({
    headers: heads,
    supabase,
  });
});

const getQueryClient = cache(createQueryClient);

export const trpc = createTRPCOptionsProxy<AppRouter>({
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
export function prefetch<T extends ReturnType<TRPCQueryOptions<any>>>(
  queryOptions: T,
) {
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
