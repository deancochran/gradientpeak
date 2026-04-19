import { drainQueuedActivityPlanDerivedMetricsMaintenance } from "@repo/api/maintenance";
import { db } from "@repo/db/client";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { isInternalProviderSyncAuthorized } from "../../../../lib/internal-provider-sync-auth";

const bodySchema = z
  .object({
    profileId: z.string().uuid(),
    limit: z.number().int().min(1).max(250).optional(),
  })
  .strict();

export const Route = createFileRoute(
  "/api/internal/activity-plan-derived-metrics/drain-refresh-queue" as never,
)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isInternalProviderSyncAuthorized(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const json = await request.json().catch(() => null);
        const parsed = bodySchema.safeParse(json);

        if (!parsed.success) {
          return Response.json(
            {
              error: "Invalid body",
              issues: parsed.error.issues,
            },
            { status: 400 },
          );
        }

        const result = await drainQueuedActivityPlanDerivedMetricsMaintenance(db, parsed.data);

        return Response.json({
          profileId: parsed.data.profileId,
          ...result,
        });
      },
    },
  },
});
