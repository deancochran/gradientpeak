// apps/web/lib/trpc.ts
import type { AppRouter } from "@repo/trpc";
import { createTRPCClient, httpBatchLink } from "@trpc/client";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/api/trpc",
    }),
  ],
});
