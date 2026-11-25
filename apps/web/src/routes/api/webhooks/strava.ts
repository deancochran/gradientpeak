import { createFileRoute } from "@tanstack/react-router";
import {
  createStravaSyncRuntime,
  isStravaIntegrationEnabled,
} from "../../../lib/strava-sync-runtime";
import { createStravaWebhookHandlers } from "../../../lib/strava-webhook";

export const stravaWebhookHandlers = createStravaWebhookHandlers({
  getSubscriptionId: () => process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID,
  getVerifyToken: () => process.env.STRAVA_WEBHOOK_VERIFY_TOKEN,
  isEnabled: isStravaIntegrationEnabled,
  storeAndEnqueueReceipt: async (payload, deliveryId) => {
    const runtime = createStravaSyncRuntime();
    await runtime.webhookJobs.storeAndEnqueueReceipt(payload, deliveryId);
  },
});

export const Route = createFileRoute("/api/webhooks/strava")({
  server: {
    handlers: {
      GET: ({ request }) => stravaWebhookHandlers.GET(request),
      POST: ({ request }) => stravaWebhookHandlers.POST(request),
    },
  },
});
