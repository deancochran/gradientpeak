import "server-only";

import { appRouter, createTRPCContext } from "@repo/trpc";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { cache } from "react";
import { makeQueryClient } from "./query-client";

// IMPORTANT: Create a stable getter for the query client that
// will return the same client during the same request.
export const getQueryClient = cache(makeQueryClient);

// Create a server caller for direct server component usage
export const trpc = appRouter.createCaller(await createTRPCContext());

// Helper components for prefetching and hydration
export function HydrateClient(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {props.children}
    </HydrationBoundary>
  );
}
