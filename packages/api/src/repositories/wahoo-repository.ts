import type { ActivityPlanStructure, ProviderIntegrationLifecycleStatus } from "@repo/core";
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
  lifecycleStatus: ProviderIntegrationLifecycleStatus;
  profileId: string;
  reconnectRequiredAt: string | null;
  refreshToken: string | null;
  scope?: string | null;
};

export type WahooPlannedSessionResourceProviderMetadata = {
  wahoo?: {
    planId?: number;
    providerAccountExternalId?: string;
    projectionHash?: string;
    routeId?: number;
    sourcePlanId?: string;
    sourceRouteId?: string | null;
  };
};
/** @deprecated Generic-event delivery is disabled; retained only for unrelated legacy reads. */
export type WahooEventResourceProviderMetadata = WahooPlannedSessionResourceProviderMetadata;

export type WahooPlannedSessionResourceLinkRecord = {
  externalId: string;
  id: string;
  providerMetadata: WahooPlannedSessionResourceProviderMetadata | null;
  updatedAt: string | null;
};
/** @deprecated Generic-event delivery is disabled. */
export type WahooEventResourceLinkRecord = WahooPlannedSessionResourceLinkRecord;

export type WahooRouteResourceLinkRecord = {
  externalId: string;
  id: string;
  integrationId: string;
  payloadHash: string | null;
  providerMetadata: WahooPlannedSessionResourceProviderMetadata | null;
  providerUpdatedAt: string | null;
  updatedAt: string | null;
};

export type WahooGroupEventRouteDeliveryResourceLinkRecord = WahooRouteResourceLinkRecord;

export type WahooEventResourceLinkGenerationGuard = {
  expectedIntegrationGeneration: number;
  integrationId: string;
  profileId: string;
};

export interface WahooRepository {
  applyProfileEnrichmentIfAbsent(input: {
    dob?: Date;
    expectedIntegrationGeneration: number;
    gender?: "male" | "female" | "other";
    integrationId: string;
    profileId: string;
    weightKg?: number;
  }): Promise<{
    fieldsFilled: Array<"dob" | "gender" | "weight_kg">;
    fieldsKept: Array<"dob" | "gender" | "weight_kg">;
  }>;
  createPlannedSessionResourceLink(input: {
    plannedSessionId: string;
    externalId: string;
    integrationId: string;
    expectedIntegrationGeneration: number;
    profileId: string;
    provider: "wahoo";
    providerMetadata?: WahooPlannedSessionResourceProviderMetadata | null;
    syncedAt: string;
    updatedAt: string;
  }): Promise<void>;
  /** @deprecated Generic-event delivery is disabled; the compatibility name targets a planned session. */
  createEventResourceLink(input: {
    eventId: string;
    externalId: string;
    integrationId: string;
    expectedIntegrationGeneration: number;
    profileId: string;
    provider: "wahoo";
    providerMetadata?: WahooEventResourceProviderMetadata | null;
    syncedAt: string;
    updatedAt: string;
  }): Promise<void>;
  deletePlannedSessionResourceLink(
    input: WahooEventResourceLinkGenerationGuard & { id: string },
  ): Promise<void>;
  /** @deprecated Generic-event delivery is disabled. */
  deleteEventResourceLink(
    input: WahooEventResourceLinkGenerationGuard & { id: string },
  ): Promise<void>;
  createRouteResourceLink(input: {
    expectedIntegrationGeneration: number;
    externalId: string;
    integrationId: string;
    payloadHash: string;
    profileId: string;
    providerMetadata: WahooEventResourceProviderMetadata;
    providerUpdatedAt: string;
    routeId: string;
    syncedAt: string;
  }): Promise<void>;
  createGroupEventRouteDeliveryResourceLink(input: {
    eventId: string;
    expectedIntegrationGeneration: number;
    externalId: string;
    integrationId: string;
    payloadHash: string;
    profileId: string;
    providerMetadata: WahooEventResourceProviderMetadata;
    providerUpdatedAt: string;
    sourceRouteId: string;
    syncedAt: string;
  }): Promise<void>;
  deleteRouteResourceLink(
    input: WahooEventResourceLinkGenerationGuard & { id: string },
  ): Promise<void>;
  deleteGroupEventRouteDeliveryResourceLink(
    input: WahooEventResourceLinkGenerationGuard & { eventId: string; id: string },
  ): Promise<void>;
  findWahooIntegrationByProfileId(profileId: string): Promise<WahooIntegrationRecord | null>;
  findWahooIntegrationByExternalId(
    externalId: string,
  ): Promise<{ integrationGeneration: number; integrationId: string; profileId: string } | null>;
  findWahooIntegrationByIdAndGeneration(input: {
    integrationGeneration: number;
    integrationId: string;
  }): Promise<{ profileId: string } | null>;
  findImportedActivityByProviderExternalId(input: {
    externalId: string;
    profileId: string;
    provider: "wahoo";
  }): Promise<{
    activityId: string;
    profileId: string;
    activityFilePath: string | null;
    activityFileSize: number | null;
    artifactId: string | null;
    artifactSha256: string | null;
    providerRevision: string | null;
    analysisReady: boolean;
    materializerVersion: string | null;
    segmentsRevision: number;
    timingCoverage: "complete" | "partial" | "unavailable";
    hasSwimSegment: boolean;
  } | null>;
  enrichImportedActivitySourceReference(input: {
    activityId: string;
    artifactSha256: string;
    externalId: string;
    importRunId?: string;
    integrationGeneration: number;
    integrationId: string;
    profileId: string;
    provider: "wahoo";
    providerUpdatedAt: string | null;
    originProvider?: string;
    originExternalId?: string;
    originTrust?: "trusted_provider_origin";
  }): Promise<void>;
  findLinkedPlannedEventId(input: {
    profileId: string;
    externalWorkoutId: string;
  }): Promise<string | null>;
  /** @deprecated The identifier is a planned-session ID after the scheduling hard cut. */
  getEventActivityPlanId(input: { eventId: string; profileId: string }): Promise<string | null>;
  getPlannedSessionResourceLink(input: {
    plannedSessionId: string;
    forUpdate?: boolean;
    profileId: string;
    provider: "wahoo";
  }): Promise<WahooPlannedSessionResourceLinkRecord | null>;
  getPlannedSessionForSync(input: { plannedSessionId: string; profileId: string }): Promise<{
    activityPlan: {
      description: string | null;
      id: string;
      name: string;
      structure: ActivityPlanStructure;
      updatedAt: string;
    } | null;
    id: string;
    plannedSessionId: string;
    planningDate: string;
    timezone: string;
  } | null>;
  /** @deprecated Generic-event delivery is disabled. */
  getEventResourceLink(input: {
    eventId: string;
    forUpdate?: boolean;
    profileId: string;
    provider: "wahoo";
  }): Promise<WahooEventResourceLinkRecord | null>;
  /** @deprecated Generic-event delivery is disabled. */
  getPlannedEventForSync(input: { eventId: string; profileId: string }): Promise<{
    activityPlan: {
      description: string | null;
      id: string;
      name: string;
      structure: ActivityPlanStructure;
      updatedAt: string;
    } | null;
    id: string;
    routeId: string | null;
    startsAt: string;
    timezone: string;
  } | null>;
  getOwnedRouteForMirror(input: { profileId: string; routeId: string }): Promise<{
    description: string | null;
    filePath: string;
    id: string;
    name: string;
    totalAscent: number | null;
    totalDescent: number | null;
    totalDistance: number;
    updatedAt: string;
  } | null>;
  getGroupEventRouteForDelivery(input: {
    groupEventId: string;
    profileId: string;
    sourceRouteId: string;
  }): Promise<{
    description: string | null;
    filePath: string;
    id: string;
    name: string;
    totalAscent: number | null;
    totalDescent: number | null;
    totalDistance: number;
    updatedAt: string;
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
  getRouteResourceLink(input: {
    profileId: string;
    provider: "wahoo";
    routeId: string;
  }): Promise<WahooRouteResourceLinkRecord | null>;
  getGroupEventRouteDeliveryResourceLink(input: {
    eventId: string;
    profileId: string;
    provider: "wahoo";
  }): Promise<WahooGroupEventRouteDeliveryResourceLinkRecord | null>;
  /** @deprecated Generic-event delivery is disabled. */
  listEventResourceLinks(input: { eventId: string; profileId: string }): Promise<
    Array<{
      externalId: string;
      id: string;
      provider: string;
      syncedAt: string | null;
      updatedAt: string | null;
    }>
  >;
  listOwnedRoutesForMirror(input: {
    afterId?: string;
    limit: number;
    profileId: string;
  }): Promise<Array<{ id: string; updatedAt: string }>>;
  listEligibleGroupEventRouteDeliveries(input: {
    after?: { eventId: string; startsAt: string };
    limit: number;
    profileId: string;
  }): Promise<
    Array<{
      eventId: string;
      eventUpdatedAt: string;
      routeUpdatedAt: string;
      sourceRouteId: string;
      startsAt: string;
    }>
  >;
  listGroupEventRouteDeliveryResourceLinks(input: {
    afterEventId?: string;
    limit: number;
    profileId: string;
  }): Promise<Array<{ eventId: string; sourceRouteId: string | null }>>;
  /** @deprecated Generic-event delivery is disabled. */
  isWahooPlanReferencedByOtherEvent(input: {
    excludeLinkId: string;
    integrationId: string;
    planId: number;
    profileId: string;
  }): Promise<boolean>;
  /** @deprecated Generic-event delivery is disabled. */
  updateEventResourceLink(input: {
    externalId?: string;
    expectedIntegrationGeneration: number;
    id: string;
    integrationId: string;
    profileId: string;
    providerMetadata?: WahooEventResourceProviderMetadata | null;
    updatedAt: string;
  }): Promise<void>;
  updateRouteResourceLink(input: {
    expectedIntegrationGeneration: number;
    externalId: string;
    id: string;
    integrationId: string;
    payloadHash: string;
    profileId: string;
    providerMetadata: WahooEventResourceProviderMetadata;
    providerUpdatedAt: string;
    syncedAt: string;
  }): Promise<void>;
  updateGroupEventRouteDeliveryResourceLink(input: {
    eventId: string;
    expectedIntegrationGeneration: number;
    externalId: string;
    id: string;
    integrationId: string;
    payloadHash: string;
    profileId: string;
    providerMetadata: WahooEventResourceProviderMetadata;
    providerUpdatedAt: string;
    syncedAt: string;
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
