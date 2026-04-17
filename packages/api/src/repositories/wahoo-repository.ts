import type { DrizzleDbClient } from "@repo/db";

export type WahooIntegrationRecord = {
  accessToken: string;
  externalId: string;
  id: string;
  profileId: string;
  refreshToken: string | null;
};

export type WahooEventResourceLinkRecord = {
  externalId: string;
  id: string;
  updatedAt: string | null;
};

export interface WahooRepository {
  createEventResourceLink(input: {
    eventId: string;
    externalId: string;
    integrationId: string;
    profileId: string;
    provider: "wahoo";
    syncedAt: string;
    updatedAt: string;
  }): Promise<void>;
  deleteEventResourceLink(id: string): Promise<void>;
  findWahooIntegrationByProfileId(profileId: string): Promise<WahooIntegrationRecord | null>;
  findWahooIntegrationByExternalId(
    externalId: string,
  ): Promise<{ integrationId: string; profileId: string } | null>;
  findImportedActivityByExternalId(externalId: string): Promise<{ id: string } | null>;
  findLinkedPlannedEventId(input: {
    profileId: string;
    externalWorkoutId: string;
  }): Promise<string | null>;
  getEventActivityPlanId(input: { eventId: string; profileId: string }): Promise<string | null>;
  createImportedActivity(input: {
    activityPlanId: string | null;
    avgCadence: number | null;
    avgHeartRate: number | null;
    avgPower: number | null;
    avgSpeedMps: number | null;
    calories: number | null;
    distanceMeters: number;
    durationSeconds: number;
    elevationGainMeters: number | null;
    externalId: string;
    finishedAt: string;
    fitFilePath: string | null;
    fitFileSize: number | null;
    movingSeconds: number;
    name: string;
    normalizedPower: number | null;
    profileId: string;
    provider: "wahoo";
    startedAt: string;
    type: string;
  }): Promise<{ id: string }>;
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
    ftp: number | null;
    thresholdHr: number | null;
  } | null>;
  getRouteForSync(input: { profileId: string; routeId: string }): Promise<{
    activityCategory: string;
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
  updateEventResourceLink(input: { externalId?: string; id: string; updatedAt: string }): Promise<void>;
}

export interface CreateWahooRepositoryOptions {
  db: DrizzleDbClient;
}
