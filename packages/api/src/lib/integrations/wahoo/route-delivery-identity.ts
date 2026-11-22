import { createHash } from "node:crypto";

export function getWahooGroupEventRouteDeliveryExternalId(input: {
  eventId: string;
  profileId: string;
  sourceRouteId: string;
}): string {
  // Wahoo retains this identifier. Hash every internal resource identifier so
  // provider-visible metadata cannot be joined back to GradientPeak UUIDs.
  const deliveryIdentity = createHash("sha256")
    .update(
      `gradientpeak:wahoo:group-event-route-delivery:v2:${input.eventId}:${input.profileId}:${input.sourceRouteId}`,
    )
    .digest("base64url")
    .slice(0, 32);
  return `gradientpeak:group-event-route:v2:${deliveryIdentity}`;
}
