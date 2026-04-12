import {
  createActivityImporter,
  createWahooImportFitFileStorage,
  createWahooRepository,
} from "@repo/api/webhooks";
import { db } from "@repo/db/client";
import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import crypto from "crypto";

const serverSupabaseUrl =
  process.env.NEXT_PRIVATE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const WAHOO_WEBHOOK_TOKEN = process.env.WAHOO_WEBHOOK_TOKEN;

interface WahooWebhookPayload {
  event_type: "workout_summary" | string;
  webhook_token: string;
  user: {
    id: number;
  };
  workout_summary?: {
    id: number;
    workout_id: number;
    ascent_accum: number;
    cadence_avg: number;
    calories_accum: number;
    distance_accum: number;
    duration_active_accum: number;
    duration_total_accum: number;
    heart_rate_avg: number;
    power_avg: number;
    power_bike_np_last: number;
    power_bike_tss_last: number;
    speed_avg: number;
    work_accum: number;
    file: {
      url: string;
    };
    fitness_app_id: number;
    manual: boolean;
    edited: boolean;
  };
}

function verifyWebhookSignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature) {
    console.warn("No signature provided in webhook");
    return false;
  }

  try {
    const normalizedSignature = signature.startsWith("sha256=")
      ? signature.slice("sha256=".length)
      : signature;
    const hmac = crypto.createHmac("sha256", secret);
    const digest = hmac.update(body, "utf8").digest("hex");

    if (normalizedSignature.length !== digest.length) {
      return false;
    }

    return crypto.timingSafeEqual(Buffer.from(normalizedSignature), Buffer.from(digest));
  } catch (error) {
    console.error("Error verifying webhook signature:", error);
    return false;
  }
}

async function processWorkoutSummary(
  wahooUserId: number,
  summary: WahooWebhookPayload["workout_summary"],
): Promise<void> {
  if (!summary) {
    console.error("No workout summary in payload");
    return;
  }

  try {
    const supabase = createClient(
      serverSupabaseUrl!,
      process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY!,
    );

    const importer = createActivityImporter({
      repository: createWahooRepository({ db }),
      fitFileStorage: createWahooImportFitFileStorage({
        async uploadFitFile(input) {
          const { error } = await supabase.storage
            .from("fit-files")
            .upload(input.path, input.bytes, {
              contentType: input.contentType,
              upsert: false,
            });

          if (error) {
            throw error;
          }
        },
      }),
    });

    const result = await importer.importWorkoutSummary(wahooUserId, summary);

    if (result.success) {
      if (result.skipped) {
        console.log(`Skipped workout summary ${summary.id}: ${result.reason}`);
      } else {
        console.log(
          `Successfully imported workout summary ${summary.id} as activity ${result.activityId}`,
        );
      }
    } else {
      console.error(`Failed to import workout summary ${summary.id}: ${result.error}`);
    }
  } catch (error) {
    console.error("Error processing workout summary:", error);
  }
}

export const Route = createFileRoute("/api/webhooks/wahoo")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          service: "Wahoo Webhook Receiver",
          status: "active",
          events: ["workout_summary"],
          configured: !!WAHOO_WEBHOOK_TOKEN,
        }),
      POST: async ({ request }) => {
        try {
          if (!WAHOO_WEBHOOK_TOKEN) {
            console.error("WAHOO_WEBHOOK_TOKEN not configured in environment variables");
            return Response.json({ received: true }, { status: 200 });
          }

          const body = await request.text();
          const signature = request.headers.get("X-Wahoo-Signature");
          let payload: WahooWebhookPayload;

          try {
            payload = JSON.parse(body);
          } catch (error) {
            console.error("Failed to parse webhook payload:", error);
            return Response.json({ received: true }, { status: 200 });
          }

          if (payload.webhook_token !== WAHOO_WEBHOOK_TOKEN) {
            console.error("Invalid webhook token in payload");
            return Response.json({ received: true }, { status: 200 });
          }

          if (signature && !verifyWebhookSignature(body, signature, WAHOO_WEBHOOK_TOKEN)) {
            console.error("Invalid webhook signature", {
              hasSignature: true,
              bodyLength: body.length,
            });
            return Response.json({ received: true }, { status: 200 });
          }

          console.log(`Received Wahoo webhook: ${payload.event_type}`, {
            userId: payload.user.id,
            eventType: payload.event_type,
          });

          if (payload.event_type === "workout_summary" && payload.workout_summary) {
            await processWorkoutSummary(payload.user.id, payload.workout_summary);
          } else {
            console.log(`Unhandled event type: ${payload.event_type}`);
          }

          return Response.json({ received: true }, { status: 200 });
        } catch (error) {
          console.error("Webhook processing error:", error);
          return Response.json({ received: true }, { status: 200 });
        }
      },
    },
  },
});
