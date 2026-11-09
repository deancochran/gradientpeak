import { createIsomorphicFn } from "@tanstack/react-start";
import { createTRPCQueryUtils } from "@trpc/react-query";

import { createApiClient } from "./client";
import { createWebQueryClient } from "./query-client";
import { createServerApiClient } from "./server-client.server";

const createRouterApiClient = createIsomorphicFn()
  .server(() => createServerApiClient())
  .client(() => createApiClient());

export function createRouterContext() {
  const queryClient = createWebQueryClient();
  const apiClient = createRouterApiClient();
  return {
    queryClient,
    apiClient,
    apiUtils: createTRPCQueryUtils({ queryClient, client: apiClient }),
  };
}

export type WebRouterContext = ReturnType<typeof createRouterContext>;
