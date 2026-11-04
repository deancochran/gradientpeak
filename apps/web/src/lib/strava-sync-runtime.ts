import { createStravaProviderRuntime, isStravaIntegrationEnabled } from "@repo/api/webhooks";
import { db } from "@repo/db/client";

function boundedInteger(value: string | undefined, fallback: number, maximum: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

export function getStravaDrainConfig() {
  return {
    leaseMs: boundedInteger(process.env.STRAVA_PROVIDER_SYNC_LEASE_MS, 10 * 60_000, 30 * 60_000),
    limit: boundedInteger(process.env.STRAVA_PROVIDER_SYNC_DRAIN_LIMIT, 4, 10),
  };
}

export function createStravaSyncRuntime() {
  if (!isStravaIntegrationEnabled()) throw new Error("Strava integration is disabled");
  return createStravaProviderRuntime(db);
}

export { isStravaIntegrationEnabled };
