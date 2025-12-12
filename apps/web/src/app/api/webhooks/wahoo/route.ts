/**
 * Wahoo Webhook Receiver
 * Handles incoming webhooks from Wahoo for completed workout summaries
 *
 * Security:
 * - HMAC-SHA256 signature verification
 * - Webhook token validation
 * - Always returns 200 to prevent retry storms
 *
 * Setup:
 * - Set WAHOO_WEBHOOK_TOKEN in environment variables
 * - Register this endpoint with Wahoo: https://yourdomain.com/api/webhooks/wahoo
 * - Subscribe to 'workout_summary' events
 */

import type { Database } from "@repo/supabase";
import { createActivityImporter } from "@repo/trpc/lib/integrations/wahoo/activity-importer";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

const WAHOO_WEBHOOK_TOKEN = process.env.WAHOO_WEBHOOK_TOKEN;

// Webhook payload types
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

/**
 * POST handler for Wahoo webhooks
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Verify webhook token is configured
    if (!WAHOO_WEBHOOK_TOKEN) {
      console.error(
        "WAHOO_WEBHOOK_TOKEN not configured in environment variables",
      );
      // Still return 200 to prevent retries
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // 2. Read raw body for HMAC verification
    const body = await request.text();
    const signature = request.headers.get("X-Wahoo-Signature");

    // 3. Verify HMAC signature
    if (!verifyWebhookSignature(body, signature, WAHOO_WEBHOOK_TOKEN)) {
      console.error("Invalid webhook signature", {
        hasSignature: !!signature,
        bodyLength: body.length,
      });
      // Return 401 for invalid signatures to alert about potential security issues
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // 4. Parse payload
    let payload: WahooWebhookPayload;
    try {
      payload = JSON.parse(body);
    } catch (error) {
      console.error("Failed to parse webhook payload:", error);
      // Return 200 to prevent retries for malformed payloads
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // 5. Validate webhook token
    if (payload.webhook_token !== WAHOO_WEBHOOK_TOKEN) {
      console.error("Invalid webhook token in payload");
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // 6. Log received event
    console.log(`Received Wahoo webhook: ${payload.event_type}`, {
      userId: payload.user.id,
      eventType: payload.event_type,
    });

    // 7. Route event to appropriate processor
    if (payload.event_type === "workout_summary" && payload.workout_summary) {
      await processWorkoutSummary(payload.user.id, payload.workout_summary);
    } else {
      console.log(`Unhandled event type: ${payload.event_type}`);
    }

    // 8. ALWAYS return 200 to prevent retry storms
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    // Log error but still return 200
    console.error("Webhook processing error:", error);
    return NextResponse.json({ received: true }, { status: 200 });
  }
}

/**
 * Verify HMAC-SHA256 signature from Wahoo
 * @param body - Raw request body
 * @param signature - X-Wahoo-Signature header value
 * @param secret - Webhook token (secret)
 */
function verifyWebhookSignature(
  body: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) {
    console.warn("No signature provided in webhook");
    return false;
  }

  try {
    // Wahoo uses HMAC-SHA256 with webhook token as secret
    const hmac = crypto.createHmac("sha256", secret);
    const digest = hmac.update(body, "utf8").digest("hex");

    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch (error) {
    console.error("Error verifying webhook signature:", error);
    return false;
  }
}

/**
 * Process a workout_summary event
 * @param wahooUserId - Wahoo user ID
 * @param summary - Workout summary data
 */
async function processWorkoutSummary(
  wahooUserId: number,
  summary: WahooWebhookPayload["workout_summary"],
): Promise<void> {
  if (!summary) {
    console.error("No workout summary in payload");
    return;
  }

  try {
    // Create Supabase client with service role for webhook processing
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY!,
    );

    // Import the activity
    const importer = createActivityImporter(supabase);
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
      console.error(
        `Failed to import workout summary ${summary.id}: ${result.error}`,
      );
    }
  } catch (error) {
    console.error("Error processing workout summary:", error);
    // Don't throw - we want to return 200 to Wahoo
  }
}

/**
 * GET handler - returns info about webhook endpoint
 */
export async function GET() {
  return NextResponse.json({
    service: "Wahoo Webhook Receiver",
    status: "active",
    events: ["workout_summary"],
    configured: !!WAHOO_WEBHOOK_TOKEN,
  });
}
