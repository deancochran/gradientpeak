import { getGradientPeakAuth } from "@repo/auth/server";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => {
        console.info("[auth-route] request", {
          method: request.method,
          path: new URL(request.url).pathname,
        });
        const auth = getGradientPeakAuth();

        return auth.handler(request);
      },
      POST: ({ request }) => {
        console.info("[auth-route] request", {
          method: request.method,
          path: new URL(request.url).pathname,
        });
        const auth = getGradientPeakAuth();

        return auth.handler(request);
      },
    },
  },
});
