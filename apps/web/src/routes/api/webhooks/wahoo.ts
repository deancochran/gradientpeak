import { createFileRoute } from "@tanstack/react-router";
import { createWahooSyncRuntime, isWahooIntegrationEnabled } from "../../../lib/wahoo-sync-runtime";
import { createWahooWebhookPostHandler } from "../../../lib/wahoo-webhook";

const handleWahooWebhookPost = createWahooWebhookPostHandler({
  isEnabled: isWahooIntegrationEnabled,
  getToken: () => process.env.WAHOO_WEBHOOK_TOKEN,
  storeAndEnqueueReceipt: async (payload) => {
    const runtime = createWahooSyncRuntime();
    await runtime.webhookJobs.storeAndEnqueueReceipt(payload);
  },
});

export const Route = createFileRoute("/api/webhooks/wahoo")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          service: "Wahoo Webhook Receiver",
          status: isWahooIntegrationEnabled() ? "active" : "disabled",
          events: ["workout_summary"],
          configured:
            isWahooIntegrationEnabled() && Boolean(process.env.WAHOO_WEBHOOK_TOKEN?.trim()),
        }),
      POST: ({ request }) => handleWahooWebhookPost(request),
    },
  },
});
