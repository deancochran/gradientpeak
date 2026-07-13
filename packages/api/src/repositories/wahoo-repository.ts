import type { ThresholdMetricSource } from "@repo/core/athlete-inputs";
import type { DrizzleDbClient } from "@repo/db";

export type WahooIntegrationRecord = {
  accessToken: string;
  expiresAt: string | null;
  externalId: string;
  id: string;
  profileId: string;
  refreshToken: string | null;
};

export type WahooEventResourceProviderMetadata = {
  wahoo?: {
    planId?: number;
    routeId?: number;
  };
};

export type WahooEventResourceLinkRecord = {
  externalId: string;
  id: string;
  providerMetadata: WahooEventResourceProviderMetadata | null;
  updatedAt: string | null;
};

export interface WahooRepository {
  createEventResourceLink(input: {
    eventId: string;
    externalId: string;
    integrationId: string;
    profileId: string;
    provider: "wahoo";
    providerMetadata?: WahooEventResourceProviderMetadata | null;
    syncedAt: string;
    updatedAt: string;
  }): Promise<void>;
  deleteEventResourceLink(id: string): Promise<void>;
  findWahooIntegrationByProfileId(profileId: string): Promise<WahooIntegrationRecord | null>;
  findWahooIntegrationByExternalId(
    externalId: string,
  ): Promise<{ integrationId: string; profileId: string } | null>;
  findImportedActivityLinkByExternalId(input: {
    externalId: string;
    integrationId: string;
  }): Promise<{ activityId: string; linkId: string } | null>;
  findImportedActivityByProviderExternalId(input: {
    externalId: string;
    provider: "wahoo";
  }): Promise<{ activityId: string; profileId: string } | null>;
  createImportedActivityResourceLink(input: {
    activityId: string;
    externalId: string;
    integrationId: string;
    profileId: string;
    provider: "wahoo";
    providerUpdatedAt: string | null;
  }): Promise<void>;
  findLinkedPlannedEventId(input: {
    profileId: string;
    externalWorkoutId: string;
  }): Promise<string | null>;
  getEventActivityPlanId(input: { eventId: string; profileId: string }): Promise<string | null>;
  getEventResourceLink(input: {
    eventId: string;
    profileId: string;
    provider: "wahoo";
  }): Promise<WahooEventResourceLinkRecord | null>;
  getPlannedEventForSync(input: { eventId: string; profileId: string }): Promise<{
    activityPlan: {
      activityCategory: string;
      description: string | null;
      id: string;
      name: string;
      routeId: string | null;
      structure: unknown;
      updatedAt: string;
    } | null;
    id: string;
    startsAt: string;
  } | null>;
  getProfileSyncMetrics(profileId: string): Promise<{
    bikePowerEfforts: Array<{
      observationKind: "actual" | "derived";
      observedAt: string;
      value: number;
    }>;
    ftpMetrics: Array<{
      observedAt: string;
      source: ThresholdMetricSource;
      value: number;
    }>;
    maxHr: number | null;
    thresholdHr: number | null;
  } | null>;
  getRouteForSync(input: { profileId: string; routeId: string }): Promise<{
    description: string | null;
    filePath: string;
    id: string;
    name: string;
    totalAscent: number | null;
    totalDescent: number | null;
    totalDistance: number;
  } | null>;
  listEventResourceLinks(input: { eventId: string; profileId: string }): Promise<
    Array<{
      externalId: string;
      id: string;
      provider: string;
      syncedAt: string | null;
      updatedAt: string | null;
    }>
  >;
  updateEventResourceLink(input: {
    externalId?: string;
    id: string;
    providerMetadata?: WahooEventResourceProviderMetadata | null;
    updatedAt: string;
  }): Promise<void>;
  updateWahooIntegrationTokens(input: {
    accessToken: string;
    expiresAt: string | null;
    id: string;
    refreshToken: string | null;
  }): Promise<void>;
}

export interface CreateWahooRepositoryOptions {
  db: DrizzleDbClient;
}
