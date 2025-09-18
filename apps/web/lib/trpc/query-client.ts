import {
    defaultShouldDehydrateQuery,
    QueryClient,
} from '@tanstack/react-query';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime above 0
        // to avoid refetching immediately on the client
        staleTime: 30 * 1000,
      },
      dehydrate: {
        // Include queries that are still pending for RSC streaming
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === 'pending',
      },
      hydrate: {
        // Add data transformer if needed
        // deserializeData: superjson.deserialize,
      },
    },
  });
}
