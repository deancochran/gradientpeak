import { createFileRoute } from "@tanstack/react-router";

import { getGradientPeakAuth } from "@repo/auth/server";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ params, request }) => {
        const auth = getGradientPeakAuth();

        return auth.handler(request);
      },
      POST: ({ params, request }) => {
        const auth = getGradientPeakAuth();

        return auth.handler(request);
      },
    },
  },
});
