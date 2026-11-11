import { describe, expect, it } from "vitest";
import {
  createStravaWebhookDeliveryIdentity,
  parseStravaWebhookPayload,
} from "./strava-webhook-contract";

const event = {
  aspect_type: "update",
  event_time: 1_725_000_000,
  object_id: 123,
  object_type: "activity",
  owner_id: 456,
  subscription_id: 789,
  updates: { title: "Morning run", type: "Run" },
} as const;

describe("Strava webhook contract", () => {
  it("creates one identity for an exact redelivery regardless of update key order", () => {
    const parsed = parseStravaWebhookPayload(event);
    const reordered = parseStravaWebhookPayload({
      ...event,
      updates: { type: "Run", title: "Morning run" },
    });
    expect(parsed).not.toBeNull();
    expect(reordered).not.toBeNull();
    if (!parsed || !reordered) throw new Error("Expected valid webhook fixtures");
    expect(createStravaWebhookDeliveryIdentity(parsed)).toBe(
      createStravaWebhookDeliveryIdentity(reordered),
    );
  });

  it("keeps distinct update deliveries distinct", () => {
    const first = parseStravaWebhookPayload(event);
    const second = parseStravaWebhookPayload({
      ...event,
      updates: { title: "Evening run", type: "Run" },
    });
    if (!first || !second) throw new Error("Expected valid webhook fixtures");
    expect(createStravaWebhookDeliveryIdentity(first)).not.toBe(
      createStravaWebhookDeliveryIdentity(second),
    );
  });

  it("accepts only documented activity events and athlete deauthorization", () => {
    expect(
      parseStravaWebhookPayload({
        ...event,
        aspect_type: "delete",
        updates: {},
      }),
    ).not.toBeNull();
    expect(
      parseStravaWebhookPayload({
        ...event,
        object_type: "athlete",
        object_id: event.owner_id,
        updates: { authorized: "true" },
      }),
    ).toBeNull();
  });
});
