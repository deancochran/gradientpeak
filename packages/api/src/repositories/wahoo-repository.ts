import type {
  ActivityEffortThresholdEvidence,
  ThresholdMetricSource,
} from "@repo/core/athlete-inputs";
import type { DrizzleQueryExecutor } from "../db";

export type WahooIntegrationRecord = {
  accessToken: string;
  expiresAt: string | null;
  externalId: string;
  /** Version of the credential row; changes on refresh/rekey. */
  credentialGeneration: number;
  /** Lifecycle fence; changes on reconnect/disconnect only. */
  integrationGeneration: number;
  id: string;
  lifecycleStatus: "active" | "disconnect_pending" | "disconnected";
  profileId: string;
  reconnectRequiredAt: string | null;
  refreshToken: string | null;
};

export type WahooEventResourceProviderMetadata = {
  wahoo?: {
    planId?: number;
    projectionHash?: string;
    routeId?: number;
    sourcePlanId?: string;
    sourceRouteId?: string | null;
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
  ): Promise<{ integrationGeneration: number; integrationId: string; profileId: string } | null>;
  findWahooIntegrationByIdAndGeneration(input: {
    integrationGeneration: number;
    integrationId: string;
  }): Promise<{ profileId: string } | null>;
  findImportedActivityLinkByExternalId(input: {
    externalId: string;
    integrationId: string;
  }): Promise<{
    activityId: string;
    linkId: string;
    profileId: string;
    activityFilePath: string | null;
    activityFileSize: number | null;
    analysisReady: boolean;
  } | null>;
  findImportedActivityByProviderExternalId(input: {
    externalId: string;
    provider: "wahoo";
  }): Promise<{
    activityId: string;
    profileId: string;
    activityFilePath: string | null;
    activityFileSize: number | null;
    analysisReady: boolean;
  } | null>;
  createImportedActivityResourceLink(input: {
    activityId: string;
    externalId: string;
    integrationId: string;
    integrationGeneration: number;
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
    forUpdate?: boolean;
    profileId: string;
    provider: "wahoo";
  }): Promise<WahooEventResourceLinkRecord | null>;
  getPlannedEventForSync(input: { eventId: string; profileId: string }): Promise<{
    activityPlan: {
      activityCategory: string;
      description: string | null;
      id: string;
      name: string;
      structure: unknown;
      updatedAt: string;
    } | null;
    id: string;
    routeId: string | null;
    startsAt: string;
  } | null>;
  getProfileSyncMetrics(profileId: string): Promise<{
    bikePowerEfforts: Array<{
      observationKind: "actual" | "derived";
      observedAt: string;
      value: number;
      evidence?: ActivityEffortThresholdEvidence;
    }>;
    ftpMetrics: Array<{
      observedAt: string;
      source: ThresholdMetricSource;
      value: number;
    }>;
    maxHr: number | null;
    thresholdHr: number | null;
    thresholdHrBySport?: Partial<Record<"bike" | "run" | "swim", number>>;
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
    expectedCredentialGeneration: number;
    expectedIntegrationGeneration: number;
    expiresAt: string | null;
    id: string;
    refreshToken: string | null;
  }): Promise<number | null>;
  markWahooReconnectRequired(input: {
    expectedCredentialGeneration: number;
    expectedIntegrationGeneration: number;
    id: string;
  }): Promise<boolean>;
}

export interface CreateWahooRepositoryOptions {
  db: DrizzleQueryExecutor;
}
