import { createQueryClient } from "@repo/api/react";
import superjson from "superjson";

/** Web policy is deliberately separate from the shared mobile defaults. */
export function createWebQueryClient() {
  const client = createQueryClient();
  const defaults = client.getDefaultOptions();
  client.setDefaultOptions({
    ...defaults,
    queries: {
      ...defaults.queries,
      // Reuse fresh loader data; refresh stale data without hiding cached content.
      refetchOnMount: true,
      refetchOnReconnect: true,
      retry: (failureCount, error) => {
        const status = (error as { data?: { httpStatus?: number } }).data?.httpStatus;
        if (status !== undefined && status >= 400 && status < 500 && status !== 429) return false;
        return failureCount < 1;
      },
    },
    dehydrate: {
      ...defaults.dehydrate,
      serializeData: superjson.serialize,
      shouldRedactErrors: () => true,
    },
    hydrate: { ...defaults.hydrate, deserializeData: superjson.deserialize },
  });
  return client;
}
