import { createFileRoute } from "@tanstack/react-router";
import { buildReadinessResponse } from "../../lib/readiness";

export const Route = createFileRoute("/api/ready")({
  server: {
    handlers: {
      GET: async () => {
        const readiness = await buildReadinessResponse();

        return Response.json(readiness.body, {
          status: readiness.httpStatus,
          headers: {
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
