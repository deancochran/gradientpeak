import { createProviderSyncRepository } from "@repo/api/webhooks";
import { db } from "@repo/db/client";
import { createFileRoute } from "@tanstack/react-router";
import { isInternalProviderSyncAuthorized } from "../../../../../lib/internal-provider-sync-auth";

export const Route = createFileRoute("/api/internal/provider-sync/wahoo/status" as never)({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isInternalProviderSyncAuthorized(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const url = new URL(request.url);
        const limitParam = Number(url.searchParams.get("limit") ?? "25");
        const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 100)) : 25;
        const repository = createProviderSyncRepository({ db });

        const [jobs, receipts] = await Promise.all([
          repository.listJobs({ limit, provider: "wahoo" }),
          repository.listWebhookReceipts({ limit, provider: "wahoo" }),
        ]);

        return Response.json({
          provider: "wahoo",
          jobs,
          receipts,
        });
      },
    },
  },
});
