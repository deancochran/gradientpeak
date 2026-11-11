import { getGradientPeakAuth } from "@repo/auth/server";
import { createFileRoute } from "@tanstack/react-router";

import { runWithAuthorizedAuthRouteContractEpoch } from "../../../lib/auth/contract-epoch-route";
import { logServerEvent } from "../../../lib/server-log";

function createJsonErrorResponse(status: number, message: string) {
  return Response.json({ message }, { status });
}

async function forwardAuthRequest(request: Request) {
  const auth = getGradientPeakAuth();
  const response = await auth.handler(request);

  return response ?? createJsonErrorResponse(404, "Authentication route not found.");
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => {
        return runWithAuthorizedAuthRouteContractEpoch(request, () => {
          logServerEvent(
            "auth.route.request",
            {
              routeType: "better-auth",
            },
            { request },
          );

          return forwardAuthRequest(request);
        });
      },
      POST: ({ request }) => {
        return runWithAuthorizedAuthRouteContractEpoch(request, () => {
          logServerEvent(
            "auth.route.request",
            {
              routeType: "better-auth",
            },
            { request },
          );
          return forwardAuthRequest(request);
        });
      },
    },
  },
});
