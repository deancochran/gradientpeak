import { getGradientPeakAuth } from "@repo/auth/server";
import { createFileRoute } from "@tanstack/react-router";

import { logServerEvent } from "../../../lib/server-log";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => {
        logServerEvent(
          "auth.route.request",
          {
            routeType: "better-auth",
          },
          { request },
        );
        const auth = getGradientPeakAuth();

        return auth.handler(request);
      },
      POST: ({ request }) => {
        logServerEvent(
          "auth.route.request",
          {
            routeType: "better-auth",
          },
          { request },
        );
        const auth = getGradientPeakAuth();

        return auth.handler(request);
      },
    },
  },
});
