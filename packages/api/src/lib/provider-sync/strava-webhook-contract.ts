import crypto from "node:crypto";
import { z } from "zod";

const stravaIdentifierSchema = z.number().int().safe().positive();
const activityUpdatesSchema = z
  .object({
    private: z.enum(["true", "false"]).optional(),
    title: z.string().max(512).optional(),
    type: z.string().max(128).optional(),
  })
  .strict();

const activityEventSchema = z
  .object({
    aspect_type: z.enum(["create", "update", "delete"]),
    event_time: z.number().int().safe().nonnegative(),
    object_id: stravaIdentifierSchema,
    object_type: z.literal("activity"),
    owner_id: stravaIdentifierSchema,
    subscription_id: stravaIdentifierSchema,
    updates: activityUpdatesSchema,
  })
  .strict()
  .superRefine((event, context) => {
    const updateCount = Object.keys(event.updates).length;
    if (event.aspect_type === "update" && updateCount === 0) {
      context.addIssue({ code: "custom", message: "Activity updates must identify a change" });
    }
    if (event.aspect_type !== "update" && updateCount !== 0) {
      context.addIssue({ code: "custom", message: "Only activity updates may contain changes" });
    }
  });

const athleteDeauthorizationSchema = z
  .object({
    aspect_type: z.literal("update"),
    event_time: z.number().int().safe().nonnegative(),
    object_id: stravaIdentifierSchema,
    object_type: z.literal("athlete"),
    owner_id: stravaIdentifierSchema,
    subscription_id: stravaIdentifierSchema,
    updates: z.object({ authorized: z.literal("false") }).strict(),
  })
  .strict()
  .superRefine((event, context) => {
    if (event.object_id !== event.owner_id) {
      context.addIssue({ code: "custom", message: "Athlete event ownership is inconsistent" });
    }
  });

export const stravaWebhookPayloadSchema = z.union([
  activityEventSchema,
  athleteDeauthorizationSchema,
]);
export type StravaWebhookPayload = z.infer<typeof stravaWebhookPayloadSchema>;

export function parseStravaWebhookPayload(value: unknown): StravaWebhookPayload | null {
  const parsed = stravaWebhookPayloadSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function canonicalUpdates(payload: StravaWebhookPayload): Record<string, string> {
  return Object.fromEntries(
    Object.entries(payload.updates)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

/** Stable delivery identity for Strava's at-least-once callback protocol. */
export function createStravaWebhookDeliveryIdentity(payload: StravaWebhookPayload): string {
  const canonical = JSON.stringify({
    aspect_type: payload.aspect_type,
    event_time: payload.event_time,
    object_id: payload.object_id,
    object_type: payload.object_type,
    owner_id: payload.owner_id,
    subscription_id: payload.subscription_id,
    updates: canonicalUpdates(payload),
  });
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}
