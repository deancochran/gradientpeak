/**
 * Wahoo Sync Service
 * Orchestrates syncing planned activities to Wahoo
 */

import { createHash } from "node:crypto";
import {
  type ActivityPlanStructure,
  type AthletePerformanceTargetFacts,
  activityPlanStructureSchema,
  compileActivityPlan,
  getAvailablePerformanceTargetValue,
} from "@repo/core";
import { canonicalUtcInstant, formatIsoInstantInIanaZone } from "@repo/core/calendar";
import { encodeRouteCourseFit } from "@repo/core/server";
import type { PublicActivityCategory } from "@repo/db";
import type { PublishedAthletePerformanceTargetsRead } from "../../../application/athlete-intelligence/published-athlete-state";
import { logger } from "../../logger";
import { hashPlannedActivityPayload } from "../../provider-sync/planned-activities/planned-activity-hash";
import { parseStoredRouteFile } from "../../routes/route-file-helpers";
import {
  isWahooSupported,
  supportsRoutes,
  toActivityType,
  toWahooWorkoutTypeId,
  type WahooActivityType,
} from "./activity-type-utils";
import {
  activateWahooAccessToken,
  createWahooClient,
  refreshWahooAccessToken,
  type WahooApiError,
  type WahooClient,
  type WahooPlan,
  type WahooRoute,
  type WahooRouteData,
  type WahooWorkout,
} from "./client";
import {
  resolveWahooCredentials,
  WahooAuthorizationResetRequiredError,
  WahooReconnectRequiredError,
} from "./credentials";
import {
  type ConvertOptions,
  calculateWorkoutDuration,
  convertToWahooPlan,
  getWahooProjectionSnapshot,
  validateWahooCompatibility,
  type WahooProjectionSnapshot,
} from "./plan-converter";
import {
  hasWahooPlannedActivityScopes,
  hasWahooRouteMirrorScopes,
} from "./planned-activity-scopes";
import {
  extractStartCoordinates,
  getWorkoutTypeFamilyForRoute,
  hasValidRouteStartCoordinates,
  prepareGPXForWahoo,
  type RouteFileData,
  validateRouteForWahoo,
} from "./route-converter";
import { getWahooGroupEventRouteDeliveryExternalId } from "./route-delivery-identity";

type SyncAction = "created" | "updated" | "recreated" | "no_change";

type WahooEventResourceProviderMetadata = {
  wahoo?: {
    planId?: number;
    providerAccountExternalId?: string;
    projectionHash?: string;
    routeId?: number;
    sourcePlanId?: string;
    sourceRouteId?: string | null;
  };
};

type SyncedWahooRoute = {
  routeId?: number;
  warnings: string[];
};

interface WahooRepository {
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
  deleteEventResourceLink(input: {
    expectedIntegrationGeneration: number;
    id: string;
    integrationId: string;
    profileId: string;
  }): Promise<void>;
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
  deleteRouteResourceLink(input: {
    expectedIntegrationGeneration: number;
    id: string;
    integrationId: string;
    profileId: string;
  }): Promise<void>;
  deleteGroupEventRouteDeliveryResourceLink(input: {
    eventId: string;
    expectedIntegrationGeneration: number;
    id: string;
    integrationId: string;
    profileId: string;
  }): Promise<void>;
  findWahooIntegrationByProfileId(profileId: string): Promise<{
    accessToken: string;
    expiresAt: string | null;
    externalId: string;
    credentialGeneration: number;
    integrationGeneration: number;
    id: string;
    profileId: string;
    reconnectRequiredAt: string | null;
    refreshToken: string | null;
    scope?: string | null;
  } | null>;
  findWahooIntegrationByIdAndGeneration(input: {
    integrationGeneration: number;
    integrationId: string;
  }): Promise<{ profileId: string } | null>;
  updateWahooIntegrationTokens(input: {
    accessToken: string;
    expectedCredentialGeneration: number;
    expectedIntegrationGeneration: number;
    expiresAt: string | null;
    id: string;
    refreshToken: string | null;
  }): Promise<number | null>;
  markWahooReconnectRequired?(input: {
    expectedCredentialGeneration: number;
    expectedIntegrationGeneration: number;
    id: string;
  }): Promise<boolean>;
  getPlannedEventForSync(input: { eventId: string; profileId: string }): Promise<{
    activityPlan: {
      description: string | null;
      id: string;
      name: string;
      structure: unknown;
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
  isWahooPlanReferencedByOtherEvent(input: {
    excludeLinkId: string;
    integrationId: string;
    planId: number;
    profileId: string;
  }): Promise<boolean>;
  getEventResourceLink(input: { eventId: string; profileId: string; provider: "wahoo" }): Promise<{
    externalId: string;
    id: string;
    providerMetadata?: WahooEventResourceProviderMetadata | null;
    updatedAt: string | null;
  } | null>;
  getRouteResourceLink(input: { profileId: string; provider: "wahoo"; routeId: string }): Promise<{
    externalId: string;
    id: string;
    integrationId: string;
    payloadHash: string | null;
    providerMetadata: WahooEventResourceProviderMetadata | null;
    providerUpdatedAt: string | null;
    updatedAt: string | null;
  } | null>;
  getGroupEventRouteDeliveryResourceLink(input: {
    eventId: string;
    profileId: string;
    provider: "wahoo";
  }): Promise<{
    externalId: string;
    id: string;
    integrationId: string;
    payloadHash: string | null;
    providerMetadata: WahooEventResourceProviderMetadata | null;
    providerUpdatedAt: string | null;
    updatedAt: string | null;
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
}

type WahooProviderEffectExecution = {
  expectedIntegrationGeneration: number;
  integrationId: string;
  profileId: string;
  providerAccountExternalId: string;
  signal?: AbortSignal;
};

export type WahooDesiredProjectionRefresh = {
  performanceModelAsOf: string;
  projectionHash: string;
  projectionSnapshot: WahooProjectionSnapshot;
};

type WahooActivityPlan = {
  description: string | null;
  id: string;
  name: string;
  structure: unknown;
  updated_at: string;
};

type WahooRepositoryActivityPlan = {
  description: string | null;
  id: string;
  name: string;
  structure: unknown;
  updatedAt: string;
};

type WahooActivityPlanRelation =
  | WahooActivityPlan
  | WahooActivityPlan[]
  | WahooRepositoryActivityPlan
  | null;

type WahooPlannedEvent = {
  id: string;
  starts_at: string;
  scheduled_starts_at: string;
  timezone: string;
  activity_plan: WahooActivityPlan;
  routeId: string | null;
};

function normalizeActivityPlanRelation(
  relation: WahooActivityPlanRelation,
): WahooActivityPlan | null {
  const activityPlan = Array.isArray(relation) ? (relation[0] ?? null) : relation;
  if (!activityPlan) return null;

  if ("updatedAt" in activityPlan) {
    return {
      description: activityPlan.description,
      id: activityPlan.id,
      name: activityPlan.name,
      structure: activityPlan.structure,
      updated_at: activityPlan.updatedAt,
    } as WahooActivityPlan;
  }

  return activityPlan;
}

export function resolveWahooSyncMetrics(
  performanceTargets: AthletePerformanceTargetFacts,
  activityCategory: PublicActivityCategory,
) {
  const sport =
    activityCategory === "bike" || activityCategory === "run" || activityCategory === "swim"
      ? activityCategory
      : null;

  return {
    ftp:
      sport === "bike"
        ? getAvailablePerformanceTargetValue(performanceTargets.cycling.planningThresholdPower)
        : null,
    maxHr:
      sport && performanceTargets.heartRate[sport].maxHr.status === "available"
        ? performanceTargets.heartRate[sport].maxHr.valueBpm
        : null,
    thresholdHr:
      sport && performanceTargets.heartRate[sport].lthr.status === "available"
        ? performanceTargets.heartRate[sport].lthr.valueBpm
        : null,
  };
}

function buildWahooConvertOptions(input: {
  activityType: WahooActivityType;
  description: string | undefined;
  hasRoute: boolean | undefined;
  metrics: ReturnType<typeof resolveWahooSyncMetrics>;
  name: string;
}): ConvertOptions {
  return {
    activityType: input.activityType,
    name: input.name,
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.hasRoute !== undefined ? { hasRoute: input.hasRoute } : {}),
    ...(input.metrics?.ftp !== null && input.metrics?.ftp !== undefined
      ? { ftp: input.metrics.ftp }
      : {}),
    ...(input.metrics?.maxHr !== null && input.metrics?.maxHr !== undefined
      ? { max_hr: input.metrics.maxHr }
      : {}),
    ...(input.metrics?.thresholdHr !== null && input.metrics?.thresholdHr !== undefined
      ? { threshold_hr: input.metrics.thresholdHr }
      : {}),
  };
}

export type SyncFailureCategory = "eligibility" | "integration" | "provider";

export type SyncFailureCode =
  | "authorization_reset_required"
  | "missing_metric"
  | "missing_performance_model_context"
  | "unsupported_target"
  | "unsupported_segment"
  | "unsupported_sport"
  | "invalid_plan"
  | "missing_plan"
  | "missing_route"
  | "missing_event"
  | "missing_integration"
  | "reconnect_required"
  | "provider_failure"
  | "provider_account_mismatch"
  | "capability_disabled"
  | "ambiguous_create";

export type SyncResult =
  | {
      success: true;
      action: SyncAction;
      routeId?: string;
      workoutId?: string;
      warnings?: string[];
      terminalOutcome?: "skipped" | "superseded";
    }
  | {
      success: false;
      action: "no_change";
      error: string;
      failureCode: SyncFailureCode;
      failureCategory: SyncFailureCategory;
      retryable: boolean;
      warnings?: string[];
    };

function createSyncFailure(input: {
  category: SyncFailureCategory;
  code: SyncFailureCode;
  error: string;
  retryable: boolean;
  warnings?: string[];
}): SyncResult {
  return {
    success: false,
    action: "no_change",
    error: input.error,
    failureCode: input.code,
    failureCategory: input.category,
    retryable: input.retryable,
    ...(input.warnings ? { warnings: input.warnings } : {}),
  };
}

function getWahooErrorStatus(error: unknown): number | null {
  const status = (error as WahooApiError | null)?.status;
  return typeof status === "number" ? status : null;
}

function isDefinitiveProviderRejection(error: unknown): boolean {
  const status = getWahooErrorStatus(error);
  return status !== null && status >= 400 && status < 500 && status !== 429;
}

function isProviderNotFound(error: unknown): boolean {
  return getWahooErrorStatus(error) === 404;
}

function isExpectedOwnedWahooRoute(route: WahooRoute, externalId: string): boolean {
  return route.external_id === externalId && !route.deleted;
}

function workoutMatchesDesiredState(
  workout: WahooWorkout,
  desired: { name: string; planId: number; scheduledDate: string },
): boolean {
  const actualStarts = Date.parse(workout.starts);
  const desiredStarts = Date.parse(desired.scheduledDate);
  return (
    workout.name === desired.name &&
    workout.plan_id === desired.planId &&
    Number.isFinite(actualStarts) &&
    Number.isFinite(desiredStarts) &&
    actualStarts === desiredStarts
  );
}

export function serializeWahooScheduledStart(startsAt: string, timeZone: string): string {
  const canonicalInstant = canonicalUtcInstant(startsAt);
  const instant = new Date(canonicalInstant);
  const localMinute = formatIsoInstantInIanaZone(canonicalInstant, timeZone);
  const instantAtMinute =
    instant.getTime() - instant.getUTCSeconds() * 1_000 - instant.getUTCMilliseconds();
  const localAsUtc = Date.parse(`${localMinute}:00.000Z`);
  const offsetMinutes = Math.round((localAsUtc - instantAtMinute) / 60_000);
  const offsetSign = offsetMinutes < 0 ? "-" : "+";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absoluteOffset / 60)).padStart(2, "0");
  const offsetRemainder = String(absoluteOffset % 60).padStart(2, "0");
  const seconds = String(instant.getUTCSeconds()).padStart(2, "0");
  const milliseconds = String(instant.getUTCMilliseconds()).padStart(3, "0");
  return `${localMinute}:${seconds}.${milliseconds}${offsetSign}${offsetHours}:${offsetRemainder}`;
}

type EnsurePlanResult = { success: true; plan: WahooPlan } | { success: false; result: SyncResult };

type EnsureWorkoutResult =
  | { success: true; created: boolean; workout: WahooWorkout }
  | { success: false; result: SyncResult };

export function decideRouteOnlyWahooConvergence(input: {
  hasActivityPlan: boolean;
  hasEventRoute: boolean;
  hasExistingResourceLink: boolean;
}): "cleanup_then_unsupported" | "missing_plan" | "unsupported_target" | "continue" {
  if (input.hasActivityPlan) return "continue";
  if (!input.hasEventRoute) return "missing_plan";
  return input.hasExistingResourceLink ? "cleanup_then_unsupported" : "unsupported_target";
}

function classifyPlanConversionFailure(error: unknown): SyncResult | null {
  if (!(error instanceof Error)) return null;

  const missingMetric =
    error.message ===
      "A positive FTP is required to sync a Wahoo workout resource with FTP-relative targets." ||
    /^Step ".+" cannot be synced to Wahoo: .*%(?:FTP|ThresholdHR|MaxHR) targets require a finite positive .+ in the athlete profile$/.test(
      error.message,
    );
  if (missingMetric) {
    return createSyncFailure({
      category: "eligibility",
      code: "missing_metric",
      error: error.message,
      retryable: false,
    });
  }

  const unsupportedTarget =
    /^Step ".+" cannot be synced to Wahoo without a target\. Wahoo's plan contract requires every step to contain a target\.$/.test(
      error.message,
    ) ||
    /^Step ".+" cannot be synced to Wahoo: .+(?:targets are not supported|RPE targets are not supported).*$/.test(
      error.message,
    ) ||
    /^Step ".+" has no Wahoo-compatible target\.$/.test(error.message) ||
    /^Cannot convert .+ target to Wahoo: .+(?:targets are not supported|RPE targets are not supported).*$/.test(
      error.message,
    );
  if (unsupportedTarget) {
    return createSyncFailure({
      category: "eligibility",
      code: "unsupported_target",
      error: error.message,
      retryable: false,
    });
  }

  return null;
}

export interface WahooSyncStorage {
  downloadRouteGpx(filePath: string): Promise<string | null>;
}

export function createWahooRouteStorage(
  storageClient: Pick<WahooSyncStorage, "downloadRouteGpx">,
): WahooSyncStorage {
  return storageClient;
}

export class WahooSyncService {
  constructor(
    private readonly deps: {
      activateAccessToken?: (accessToken: string) => Promise<void>;
      getPerformanceTargets: (input: {
        profileId: string;
      }) => Promise<PublishedAthletePerformanceTargetsRead>;
      repository: WahooRepository;
      storage: WahooSyncStorage;
      wahooClientFactory?: typeof createWahooClient;
    },
  ) {}

  private get repository() {
    return this.deps.repository;
  }

  private async getSupersededProviderEffect(
    execution: WahooProviderEffectExecution,
  ): Promise<SyncResult | null> {
    execution.signal?.throwIfAborted();
    const active = await this.repository.findWahooIntegrationByIdAndGeneration({
      integrationGeneration: execution.expectedIntegrationGeneration,
      integrationId: execution.integrationId,
    });
    if (active?.profileId === execution.profileId) return null;
    return {
      success: true,
      action: "no_change",
      terminalOutcome: "superseded",
      warnings: ["Wahoo integration authority changed before the provider effect."],
    };
  }

  private async getSingleRouteByExternalId(input: {
    externalId: string;
    signal?: AbortSignal;
    wahooClient: WahooClient;
  }): Promise<{ ambiguous: boolean; route: WahooRoute | null }> {
    const routes = (await input.wahooClient.getRoutes(input.externalId, input.signal)).filter(
      (route) => !route.deleted && route.external_id === input.externalId,
    );
    return routes.length > 1
      ? { ambiguous: true, route: null }
      : { ambiguous: false, route: routes[0] ?? null };
  }

  /**
   * Reconcile once after an effect whose provider response cannot be trusted. A failed or
   * ambiguous read remains unresolved so callers never repeat a potentially committed POST.
   */
  private async reconcileSingleRouteAfterAmbiguousEffect(input: {
    externalId: string;
    signal?: AbortSignal;
    wahooClient: WahooClient;
  }): Promise<WahooRoute | null> {
    try {
      const lookup = await this.getSingleRouteByExternalId(input);
      return lookup.ambiguous ? null : lookup.route;
    } catch {
      return null;
    }
  }

  async syncOwnedRoute(
    routeId: string,
    profileId: string,
    externalId: string,
    execution: {
      expectedIntegrationGeneration: number;
      expectedRouteUpdatedAt?: string;
      integrationId: string;
      signal?: AbortSignal;
    },
  ): Promise<SyncResult> {
    try {
      const route = await this.repository.getOwnedRouteForMirror({ profileId, routeId });
      if (!route) {
        return createSyncFailure({
          category: "eligibility",
          code: "missing_route",
          error: "Owned route not found",
          retryable: false,
        });
      }
      if (
        execution.expectedRouteUpdatedAt !== undefined &&
        execution.expectedRouteUpdatedAt !== route.updatedAt
      ) {
        return {
          action: "no_change",
          routeId,
          success: true,
          terminalOutcome: "superseded",
        };
      }

      const routeContent = await this.deps.storage.downloadRouteGpx(route.filePath);
      if (!routeContent) {
        return createSyncFailure({
          category: "eligibility",
          code: "missing_route",
          error: "Owned route file not found",
          retryable: false,
        });
      }
      let parsedRoute: ReturnType<typeof parseStoredRouteFile>;
      try {
        parsedRoute = parseStoredRouteFile(routeContent, route.filePath);
      } catch {
        return createSyncFailure({
          category: "eligibility",
          code: "invalid_plan",
          error: "Owned route file is invalid",
          retryable: false,
        });
      }
      const fit = encodeRouteCourseFit({ coordinates: parsedRoute.coordinates, name: route.name });
      if (!fit.ok) {
        return createSyncFailure({
          category: "eligibility",
          code: "invalid_plan",
          error: "Owned route could not be represented as a FIT course",
          retryable: false,
        });
      }
      const firstCoordinate = parsedRoute.coordinates[0];
      if (!firstCoordinate) {
        return createSyncFailure({
          category: "eligibility",
          code: "missing_route",
          error: "Owned route has no coordinates",
          retryable: false,
        });
      }
      const routeData: WahooRouteData = {
        ascent: route.totalAscent ?? 0,
        description: route.description,
        descent: route.totalDescent ?? 0,
        distance: route.totalDistance,
        externalId,
        file: `data:application/vnd.fit;base64,${Buffer.from(fit.bytes).toString("base64")}`,
        filename: `${route.name}.fit`,
        name: route.name,
        providerUpdatedAt: route.updatedAt,
        startLat: firstCoordinate.latitude,
        startLng: firstCoordinate.longitude,
        // Owned library routes are geometry-only until attached to a typed event.
        workoutTypeFamilyId: 255,
      };
      const payloadHash = createHash("sha256")
        .update(
          JSON.stringify({
            description: route.description,
            externalId,
            file: routeData.file,
            name: route.name,
            providerUpdatedAt: route.updatedAt,
          }),
        )
        .digest("hex");
      const integration = await this.repository.findWahooIntegrationByProfileId(profileId);
      if (!integration) {
        return createSyncFailure({
          category: "integration",
          code: "missing_integration",
          error: "Wahoo integration not found",
          retryable: false,
        });
      }
      if (
        !hasWahooRouteMirrorScopes(integration.scope) ||
        integration.id !== execution.integrationId ||
        integration.integrationGeneration !== execution.expectedIntegrationGeneration
      ) {
        return createSyncFailure({
          category: "integration",
          code: "reconnect_required",
          error: "Reconnect Wahoo to grant route-library permissions",
          retryable: false,
        });
      }
      const existingLink = await this.repository.getRouteResourceLink({
        profileId,
        provider: "wahoo",
        routeId,
      });
      if (
        existingLink &&
        (existingLink.integrationId !== integration.id ||
          existingLink.providerMetadata?.wahoo?.providerAccountExternalId !==
            integration.externalId)
      ) {
        return createSyncFailure({
          category: "integration",
          code: "provider_account_mismatch",
          error: "The mirrored route belongs to a different Wahoo account",
          retryable: false,
        });
      }

      const freshIntegration = await resolveWahooCredentials({
        activateAccessToken: this.deps.activateAccessToken ?? activateWahooAccessToken,
        integration: { ...integration, expiresAt: integration.expiresAt ?? null },
        persistTokens: (tokens) =>
          this.repository.updateWahooIntegrationTokens({
            ...tokens,
            expectedCredentialGeneration: tokens.credentialGeneration,
            expectedIntegrationGeneration: tokens.integrationGeneration,
          }),
        markReconnectRequired: ({ credentialGeneration, id, integrationGeneration }) =>
          this.repository.markWahooReconnectRequired?.({
            expectedCredentialGeneration: credentialGeneration,
            expectedIntegrationGeneration: integrationGeneration,
            id,
          }) ?? Promise.resolve(false),
        readCurrentCredentials: () => this.repository.findWahooIntegrationByProfileId(profileId),
        refreshAccessToken: refreshWahooAccessToken,
      });
      const wahooClient = (this.deps.wahooClientFactory ?? createWahooClient)({
        accessToken: freshIntegration.accessToken,
        ...(freshIntegration.refreshToken ? { refreshToken: freshIntegration.refreshToken } : {}),
      });
      const effectExecution: WahooProviderEffectExecution = {
        expectedIntegrationGeneration: execution.expectedIntegrationGeneration,
        integrationId: execution.integrationId,
        profileId,
        providerAccountExternalId: freshIntegration.externalId,
        ...(execution.signal ? { signal: execution.signal } : {}),
      };

      const lookup = await this.getSingleRouteByExternalId({
        externalId,
        ...(execution.signal ? { signal: execution.signal } : {}),
        wahooClient,
      });
      if (lookup.ambiguous) {
        return createSyncFailure({
          category: "provider",
          code: "ambiguous_create",
          error: "Wahoo returned duplicate routes for the owned route identity",
          retryable: false,
        });
      }

      let remoteRoute = lookup.route;
      let action: SyncAction = "no_change";
      if (!remoteRoute) {
        const superseded = await this.getSupersededProviderEffect(effectExecution);
        if (superseded) return superseded;
        let routeAfterCreate: WahooRoute | null = null;
        let trustedCreateResponse = false;
        try {
          const createdRoute = await wahooClient.createRoute(routeData, execution.signal);
          trustedCreateResponse = isExpectedOwnedWahooRoute(createdRoute, externalId);
          routeAfterCreate = trustedCreateResponse
            ? createdRoute
            : await this.reconcileSingleRouteAfterAmbiguousEffect({
                externalId,
                ...(execution.signal ? { signal: execution.signal } : {}),
                wahooClient,
              });
        } catch (error) {
          if (isDefinitiveProviderRejection(error)) {
            return createSyncFailure({
              category: "provider",
              code: "provider_failure",
              error: "Wahoo rejected route creation",
              retryable: false,
            });
          }
          routeAfterCreate = await this.reconcileSingleRouteAfterAmbiguousEffect({
            externalId,
            ...(execution.signal ? { signal: execution.signal } : {}),
            wahooClient,
          });
        }
        if (!routeAfterCreate) {
          return createSyncFailure({
            category: "provider",
            code: "ambiguous_create",
            error: "Wahoo route creation could not be reconciled",
            retryable: false,
          });
        }
        remoteRoute = routeAfterCreate;
        // A route recovered after an uncertain or mismatched POST is safe to PUT by exact
        // identity. Updating it also proves convergence before the local link is authoritative.
        action = trustedCreateResponse ? "created" : "no_change";
      }

      const providerTimeMatches =
        Date.parse(remoteRoute.provider_updated_at) === Date.parse(route.updatedAt);
      if (
        action !== "created" &&
        (!providerTimeMatches || existingLink?.payloadHash !== payloadHash)
      ) {
        const superseded = await this.getSupersededProviderEffect(effectExecution);
        if (superseded) return superseded;
        try {
          const updatedRoute = await wahooClient.updateRoute(
            String(remoteRoute.id),
            routeData,
            execution.signal,
          );
          if (isExpectedOwnedWahooRoute(updatedRoute, externalId)) {
            remoteRoute = updatedRoute;
          } else {
            const reconciled = await this.reconcileSingleRouteAfterAmbiguousEffect({
              externalId,
              ...(execution.signal ? { signal: execution.signal } : {}),
              wahooClient,
            });
            if (!reconciled) {
              return createSyncFailure({
                category: "provider",
                code: "ambiguous_create",
                error: "Wahoo route update returned an unexpected resource identity",
                retryable: false,
              });
            }
            if (Date.parse(reconciled.provider_updated_at) !== Date.parse(route.updatedAt)) {
              return createSyncFailure({
                category: "provider",
                code: "provider_failure",
                error: "Wahoo route update response could not be verified",
                retryable: true,
              });
            }
            remoteRoute = reconciled;
          }
          action = "updated";
        } catch (error) {
          if (isProviderNotFound(error)) {
            return createSyncFailure({
              category: "provider",
              code: "provider_failure",
              error: "Wahoo route disappeared during update",
              retryable: true,
            });
          }
          if (isDefinitiveProviderRejection(error)) {
            return createSyncFailure({
              category: "provider",
              code: "provider_failure",
              error: "Wahoo rejected route update",
              retryable: false,
            });
          }
          let reconciled: Awaited<ReturnType<WahooSyncService["getSingleRouteByExternalId"]>>;
          try {
            reconciled = await this.getSingleRouteByExternalId({
              externalId,
              ...(execution.signal ? { signal: execution.signal } : {}),
              wahooClient,
            });
          } catch {
            return createSyncFailure({
              category: "provider",
              code: "ambiguous_create",
              error: "Wahoo route update could not be safely reconciled",
              retryable: false,
            });
          }
          if (reconciled.ambiguous || !reconciled.route) {
            return createSyncFailure({
              category: "provider",
              code: "ambiguous_create",
              error: "Wahoo route update could not be safely reconciled",
              retryable: false,
            });
          }
          if (Date.parse(reconciled.route.provider_updated_at) !== Date.parse(route.updatedAt)) {
            return createSyncFailure({
              category: "provider",
              code: "provider_failure",
              error: "Wahoo route update could not be verified",
              retryable: true,
            });
          }
          remoteRoute = reconciled.route;
          action = "updated";
        }
      }

      const syncedAt = new Date().toISOString();
      const linkValues = {
        expectedIntegrationGeneration: execution.expectedIntegrationGeneration,
        externalId: String(remoteRoute.id),
        integrationId: execution.integrationId,
        payloadHash,
        profileId,
        providerMetadata: {
          wahoo: { providerAccountExternalId: freshIntegration.externalId },
        },
        providerUpdatedAt: route.updatedAt,
        syncedAt,
      };
      if (existingLink) {
        await this.repository.updateRouteResourceLink({ ...linkValues, id: existingLink.id });
      } else {
        await this.repository.createRouteResourceLink({ ...linkValues, routeId });
      }
      return { action, routeId: String(remoteRoute.id), success: true };
    } catch (error) {
      if (error instanceof WahooAuthorizationResetRequiredError) {
        return createSyncFailure({
          category: "integration",
          code: "authorization_reset_required",
          error: error.message,
          retryable: false,
        });
      }
      if (error instanceof WahooReconnectRequiredError) {
        return createSyncFailure({
          category: "integration",
          code: "reconnect_required",
          error: error.message,
          retryable: false,
        });
      }
      return createSyncFailure({
        category: "provider",
        code: "provider_failure",
        error: "Wahoo owned-route synchronization failed",
        retryable: true,
      });
    }
  }

  /**
   * Delivers an RSVP-authorized group-event route into one recipient's Wahoo library.
   * The repository rechecks all sharing predicates at lookup time; an unavailable source
   * converges any prior delivery to absent before the job terminalizes.
   */
  async syncGroupEventRouteDelivery(
    groupEventId: string,
    profileId: string,
    sourceRouteId: string,
    externalId: string,
    execution: WahooProviderEffectExecution,
  ): Promise<SyncResult> {
    try {
      const route = await this.repository.getGroupEventRouteForDelivery({
        groupEventId,
        profileId,
        sourceRouteId,
      });
      const integration = await this.repository.findWahooIntegrationByProfileId(profileId);
      if (!integration) {
        return createSyncFailure({
          category: "integration",
          code: "missing_integration",
          error: "Wahoo integration not found",
          retryable: false,
        });
      }
      if (
        !hasWahooRouteMirrorScopes(integration.scope) ||
        integration.id !== execution.integrationId ||
        integration.integrationGeneration !== execution.expectedIntegrationGeneration
      ) {
        return { success: true, action: "no_change", terminalOutcome: "superseded" };
      }
      if (integration.externalId !== execution.providerAccountExternalId) {
        return createSyncFailure({
          category: "integration",
          code: "provider_account_mismatch",
          error: "The Wahoo delivery account cannot be verified",
          retryable: false,
        });
      }
      let existingLink = await this.repository.getGroupEventRouteDeliveryResourceLink({
        eventId: groupEventId,
        profileId,
        provider: "wahoo",
      });
      if (
        existingLink &&
        (existingLink.integrationId !== integration.id ||
          existingLink.providerMetadata?.wahoo?.providerAccountExternalId !==
            integration.externalId)
      ) {
        return createSyncFailure({
          category: "integration",
          code: "provider_account_mismatch",
          error: "The delivered route belongs to a different Wahoo account",
          retryable: false,
        });
      }
      const existingSourceRouteId = existingLink?.providerMetadata?.wahoo?.sourceRouteId;
      if (
        route &&
        existingLink &&
        existingSourceRouteId &&
        existingSourceRouteId !== sourceRouteId
      ) {
        const removal = await this.removeGroupEventRouteDelivery({
          eventId: groupEventId,
          execution,
          existingLink,
          externalId: getWahooGroupEventRouteDeliveryExternalId({
            eventId: groupEventId,
            profileId,
            sourceRouteId: existingSourceRouteId,
          }),
          integration,
          profileId,
        });
        if (!removal.success) return removal;
        existingLink = null;
      }
      if (!route) {
        return this.removeGroupEventRouteDelivery({
          eventId: groupEventId,
          execution,
          existingLink,
          externalId,
          integration,
          profileId,
        });
      }
      const routeContent = await this.deps.storage.downloadRouteGpx(route.filePath);
      if (!routeContent) {
        return createSyncFailure({
          category: "eligibility",
          code: "missing_route",
          error: "Group event route file not found",
          retryable: false,
        });
      }
      let parsedRoute: ReturnType<typeof parseStoredRouteFile>;
      try {
        parsedRoute = parseStoredRouteFile(routeContent, route.filePath);
      } catch {
        return createSyncFailure({
          category: "eligibility",
          code: "invalid_plan",
          error: "Group event route file is invalid",
          retryable: false,
        });
      }
      const fit = encodeRouteCourseFit({ coordinates: parsedRoute.coordinates, name: route.name });
      const firstCoordinate = parsedRoute.coordinates[0];
      if (!fit.ok || !firstCoordinate) {
        return createSyncFailure({
          category: "eligibility",
          code: "invalid_plan",
          error: "Group event route could not be represented as a FIT course",
          retryable: false,
        });
      }
      const routeData: WahooRouteData = {
        ascent: route.totalAscent ?? 0,
        description: route.description,
        descent: route.totalDescent ?? 0,
        distance: route.totalDistance,
        externalId,
        file: `data:application/vnd.fit;base64,${Buffer.from(fit.bytes).toString("base64")}`,
        filename: `${route.name}.fit`,
        name: route.name,
        providerUpdatedAt: route.updatedAt,
        startLat: firstCoordinate.latitude,
        startLng: firstCoordinate.longitude,
        workoutTypeFamilyId: 255,
      };
      const payloadHash = createHash("sha256")
        .update(
          JSON.stringify({
            eventId: groupEventId,
            externalId,
            file: routeData.file,
            providerUpdatedAt: route.updatedAt,
            sourceRouteId,
          }),
        )
        .digest("hex");
      const freshIntegration = await resolveWahooCredentials({
        activateAccessToken: this.deps.activateAccessToken ?? activateWahooAccessToken,
        integration: { ...integration, expiresAt: integration.expiresAt ?? null },
        persistTokens: (tokens) =>
          this.repository.updateWahooIntegrationTokens({
            ...tokens,
            expectedCredentialGeneration: tokens.credentialGeneration,
            expectedIntegrationGeneration: tokens.integrationGeneration,
          }),
        markReconnectRequired: ({ credentialGeneration, id, integrationGeneration }) =>
          this.repository.markWahooReconnectRequired?.({
            expectedCredentialGeneration: credentialGeneration,
            expectedIntegrationGeneration: integrationGeneration,
            id,
          }) ?? Promise.resolve(false),
        readCurrentCredentials: () => this.repository.findWahooIntegrationByProfileId(profileId),
        refreshAccessToken: refreshWahooAccessToken,
      });
      if (freshIntegration.externalId !== execution.providerAccountExternalId) {
        return createSyncFailure({
          category: "integration",
          code: "provider_account_mismatch",
          error: "The Wahoo delivery account changed during synchronization",
          retryable: false,
        });
      }
      const wahooClient = (this.deps.wahooClientFactory ?? createWahooClient)({
        accessToken: freshIntegration.accessToken,
        ...(freshIntegration.refreshToken ? { refreshToken: freshIntegration.refreshToken } : {}),
      });
      const lookup = await this.getSingleRouteByExternalId({
        externalId,
        ...(execution.signal ? { signal: execution.signal } : {}),
        wahooClient,
      });
      if (lookup.ambiguous) {
        return createSyncFailure({
          category: "provider",
          code: "ambiguous_create",
          error: "Wahoo returned duplicate routes for the group event delivery identity",
          retryable: false,
        });
      }
      let remoteRoute = lookup.route;
      let action: SyncAction = "no_change";
      if (!remoteRoute) {
        // Authorization can change while parsing/downloading. Recheck immediately before the
        // irreversible provider create; cancellation, RSVP withdrawal, opt-out, or membership
        // removal then becomes a no-op rather than a permanent attendee-library route.
        const currentDelivery = await this.repository.getGroupEventRouteForDelivery({
          groupEventId,
          profileId,
          sourceRouteId,
        });
        if (!currentDelivery || currentDelivery.updatedAt !== route.updatedAt) {
          return { success: true, action: "no_change", terminalOutcome: "skipped" };
        }
        const superseded = await this.getSupersededProviderEffect(execution);
        if (superseded) return superseded;
        let trustedCreateResponse = false;
        try {
          const created = await wahooClient.createRoute(routeData, execution.signal);
          trustedCreateResponse = isExpectedOwnedWahooRoute(created, externalId);
          remoteRoute = trustedCreateResponse
            ? created
            : await this.reconcileSingleRouteAfterAmbiguousEffect({
                externalId,
                ...(execution.signal ? { signal: execution.signal } : {}),
                wahooClient,
              });
        } catch (error) {
          if (isDefinitiveProviderRejection(error)) {
            return createSyncFailure({
              category: "provider",
              code: "provider_failure",
              error: "Wahoo rejected group event route creation",
              retryable: false,
            });
          }
          remoteRoute = await this.reconcileSingleRouteAfterAmbiguousEffect({
            externalId,
            ...(execution.signal ? { signal: execution.signal } : {}),
            wahooClient,
          });
        }
        if (!remoteRoute) {
          return createSyncFailure({
            category: "provider",
            code: "ambiguous_create",
            error: "Wahoo group event route creation could not be reconciled",
            retryable: false,
          });
        }
        action = trustedCreateResponse ? "created" : "no_change";
      }
      const needsUpdate =
        action !== "created" &&
        (Date.parse(remoteRoute.provider_updated_at) !== Date.parse(route.updatedAt) ||
          existingLink?.payloadHash !== payloadHash);
      if (needsUpdate) {
        const currentDelivery = await this.repository.getGroupEventRouteForDelivery({
          groupEventId,
          profileId,
          sourceRouteId,
        });
        if (!currentDelivery || currentDelivery.updatedAt !== route.updatedAt) {
          return { success: true, action: "no_change", terminalOutcome: "skipped" };
        }
        const superseded = await this.getSupersededProviderEffect(execution);
        if (superseded) return superseded;
        try {
          const updated = await wahooClient.updateRoute(
            String(remoteRoute.id),
            routeData,
            execution.signal,
          );
          if (isExpectedOwnedWahooRoute(updated, externalId)) {
            remoteRoute = updated;
          } else {
            remoteRoute = await this.reconcileSingleRouteAfterAmbiguousEffect({
              externalId,
              ...(execution.signal ? { signal: execution.signal } : {}),
              wahooClient,
            });
            if (
              !remoteRoute ||
              Date.parse(remoteRoute.provider_updated_at) !== Date.parse(route.updatedAt)
            ) {
              return createSyncFailure({
                category: "provider",
                code: "ambiguous_create",
                error: "Wahoo group event route update could not be verified",
                retryable: false,
              });
            }
          }
          action = "updated";
        } catch (error) {
          if (isDefinitiveProviderRejection(error)) {
            return createSyncFailure({
              category: "provider",
              code: "provider_failure",
              error: "Wahoo rejected group event route update",
              retryable: false,
            });
          }
          const reconciled = await this.reconcileSingleRouteAfterAmbiguousEffect({
            externalId,
            ...(execution.signal ? { signal: execution.signal } : {}),
            wahooClient,
          });
          if (
            !reconciled ||
            Date.parse(reconciled.provider_updated_at) !== Date.parse(route.updatedAt)
          ) {
            return createSyncFailure({
              category: "provider",
              code: "ambiguous_create",
              error: "Wahoo group event route update could not be safely reconciled",
              retryable: false,
            });
          }
          remoteRoute = reconciled;
          action = "updated";
        }
      }
      const linkValues = {
        eventId: groupEventId,
        expectedIntegrationGeneration: execution.expectedIntegrationGeneration,
        externalId: String(remoteRoute.id),
        integrationId: execution.integrationId,
        payloadHash,
        profileId,
        providerMetadata: {
          wahoo: { providerAccountExternalId: freshIntegration.externalId, sourceRouteId },
        },
        providerUpdatedAt: route.updatedAt,
        sourceRouteId,
        syncedAt: new Date().toISOString(),
      };
      if (existingLink) {
        await this.repository.updateGroupEventRouteDeliveryResourceLink({
          ...linkValues,
          id: existingLink.id,
        });
      } else {
        await this.repository.createGroupEventRouteDeliveryResourceLink(linkValues);
      }
      return { success: true, action, routeId: String(remoteRoute.id) };
    } catch (error) {
      if (error instanceof WahooAuthorizationResetRequiredError) {
        return createSyncFailure({
          category: "integration",
          code: "authorization_reset_required",
          error: error.message,
          retryable: false,
        });
      }
      if (error instanceof WahooReconnectRequiredError) {
        return createSyncFailure({
          category: "integration",
          code: "reconnect_required",
          error: error.message,
          retryable: false,
        });
      }
      return createSyncFailure({
        category: "provider",
        code: "provider_failure",
        error: "Wahoo group event route delivery failed",
        retryable: true,
      });
    }
  }

  private async removeGroupEventRouteDelivery(input: {
    eventId: string;
    execution: WahooProviderEffectExecution;
    existingLink: Awaited<ReturnType<WahooRepository["getGroupEventRouteDeliveryResourceLink"]>>;
    externalId: string;
    integration: NonNullable<
      Awaited<ReturnType<WahooRepository["findWahooIntegrationByProfileId"]>>
    >;
    profileId: string;
  }): Promise<SyncResult> {
    const freshIntegration = await resolveWahooCredentials({
      activateAccessToken: this.deps.activateAccessToken ?? activateWahooAccessToken,
      integration: { ...input.integration, expiresAt: input.integration.expiresAt ?? null },
      persistTokens: (tokens) =>
        this.repository.updateWahooIntegrationTokens({
          ...tokens,
          expectedCredentialGeneration: tokens.credentialGeneration,
          expectedIntegrationGeneration: tokens.integrationGeneration,
        }),
      markReconnectRequired: ({ credentialGeneration, id, integrationGeneration }) =>
        this.repository.markWahooReconnectRequired?.({
          expectedCredentialGeneration: credentialGeneration,
          expectedIntegrationGeneration: integrationGeneration,
          id,
        }) ?? Promise.resolve(false),
      readCurrentCredentials: () =>
        this.repository.findWahooIntegrationByProfileId(input.profileId),
      refreshAccessToken: refreshWahooAccessToken,
    });
    if (freshIntegration.externalId !== input.execution.providerAccountExternalId) {
      return createSyncFailure({
        category: "integration",
        code: "provider_account_mismatch",
        error: "The Wahoo delivery account changed during route removal",
        retryable: false,
      });
    }
    const wahooClient = (this.deps.wahooClientFactory ?? createWahooClient)({
      accessToken: freshIntegration.accessToken,
      ...(freshIntegration.refreshToken ? { refreshToken: freshIntegration.refreshToken } : {}),
    });
    const lookup = await this.getSingleRouteByExternalId({
      externalId: input.externalId,
      ...(input.execution.signal ? { signal: input.execution.signal } : {}),
      wahooClient,
    });
    if (lookup.ambiguous) {
      return createSyncFailure({
        category: "provider",
        code: "ambiguous_create",
        error: "Wahoo returned duplicate routes for a revoked group event delivery",
        retryable: false,
      });
    }
    if (lookup.route) {
      const superseded = await this.getSupersededProviderEffect(input.execution);
      if (superseded) return superseded;
      try {
        await wahooClient.deleteRoute(String(lookup.route.id), input.execution.signal);
      } catch (error) {
        if (!isProviderNotFound(error)) {
          const remaining = await this.getSingleRouteByExternalId({
            externalId: input.externalId,
            ...(input.execution.signal ? { signal: input.execution.signal } : {}),
            wahooClient,
          });
          if (remaining.ambiguous || remaining.route) {
            return createSyncFailure({
              category: "provider",
              code: remaining.ambiguous ? "ambiguous_create" : "provider_failure",
              error: "Wahoo group event route removal could not be verified",
              retryable: !remaining.ambiguous,
            });
          }
        }
      }
    }
    if (input.existingLink) {
      await this.repository.deleteGroupEventRouteDeliveryResourceLink({
        eventId: input.eventId,
        expectedIntegrationGeneration: input.execution.expectedIntegrationGeneration,
        id: input.existingLink.id,
        integrationId: input.execution.integrationId,
        profileId: input.profileId,
      });
    }
    return {
      action: lookup.route ? "updated" : "no_change",
      success: true,
      terminalOutcome: "skipped",
    };
  }

  private async removeUnreferencedWahooPlan(input: {
    currentLinkId: string;
    execution: WahooProviderEffectExecution;
    planId: number;
    wahooClient: WahooClient;
  }): Promise<SyncResult | null> {
    const referenced = await this.repository.isWahooPlanReferencedByOtherEvent({
      excludeLinkId: input.currentLinkId,
      integrationId: input.execution.integrationId,
      planId: input.planId,
      profileId: input.execution.profileId,
    });
    if (referenced) return null;
    const superseded = await this.getSupersededProviderEffect(input.execution);
    if (superseded) return superseded;
    try {
      await input.wahooClient.deletePlan(input.planId, input.execution.signal);
      return null;
    } catch (error) {
      if (isProviderNotFound(error)) return null;
      return createSyncFailure({
        category: "provider",
        code: "provider_failure",
        error: "Wahoo plan cleanup failed",
        retryable: !isDefinitiveProviderRejection(error),
      });
    }
  }

  async unsyncOwnedRoute(
    routeId: string,
    profileId: string,
    externalId: string,
    execution: {
      expectedIntegrationGeneration: number;
      integrationId: string;
      signal?: AbortSignal;
    },
  ): Promise<SyncResult> {
    try {
      const integration = await this.repository.findWahooIntegrationByProfileId(profileId);
      if (!integration) {
        return createSyncFailure({
          category: "integration",
          code: "missing_integration",
          error: "Wahoo integration not found",
          retryable: false,
        });
      }
      if (
        !hasWahooRouteMirrorScopes(integration.scope) ||
        integration.id !== execution.integrationId ||
        integration.integrationGeneration !== execution.expectedIntegrationGeneration
      ) {
        return createSyncFailure({
          category: "integration",
          code: "reconnect_required",
          error: "Reconnect Wahoo to grant route-library permissions",
          retryable: false,
        });
      }
      const link = await this.repository.getRouteResourceLink({
        profileId,
        provider: "wahoo",
        routeId,
      });
      if (
        link &&
        (link.integrationId !== integration.id ||
          link.providerMetadata?.wahoo?.providerAccountExternalId !== integration.externalId)
      ) {
        return createSyncFailure({
          category: "integration",
          code: "provider_account_mismatch",
          error: "The mirrored route belongs to a different Wahoo account",
          retryable: false,
        });
      }
      const freshIntegration = await resolveWahooCredentials({
        activateAccessToken: this.deps.activateAccessToken ?? activateWahooAccessToken,
        integration: { ...integration, expiresAt: integration.expiresAt ?? null },
        persistTokens: (tokens) =>
          this.repository.updateWahooIntegrationTokens({
            ...tokens,
            expectedCredentialGeneration: tokens.credentialGeneration,
            expectedIntegrationGeneration: tokens.integrationGeneration,
          }),
        markReconnectRequired: ({ credentialGeneration, id, integrationGeneration }) =>
          this.repository.markWahooReconnectRequired?.({
            expectedCredentialGeneration: credentialGeneration,
            expectedIntegrationGeneration: integrationGeneration,
            id,
          }) ?? Promise.resolve(false),
        readCurrentCredentials: () => this.repository.findWahooIntegrationByProfileId(profileId),
        refreshAccessToken: refreshWahooAccessToken,
      });
      const wahooClient = (this.deps.wahooClientFactory ?? createWahooClient)({
        accessToken: freshIntegration.accessToken,
        ...(freshIntegration.refreshToken ? { refreshToken: freshIntegration.refreshToken } : {}),
      });
      const lookup = await this.getSingleRouteByExternalId({
        externalId,
        ...(execution.signal ? { signal: execution.signal } : {}),
        wahooClient,
      });
      if (lookup.ambiguous) {
        return createSyncFailure({
          category: "provider",
          code: "ambiguous_create",
          error: "Wahoo returned duplicate routes for the owned route identity",
          retryable: false,
        });
      }
      if (lookup.route) {
        const superseded = await this.getSupersededProviderEffect({
          expectedIntegrationGeneration: execution.expectedIntegrationGeneration,
          integrationId: execution.integrationId,
          profileId,
          providerAccountExternalId: freshIntegration.externalId,
          ...(execution.signal ? { signal: execution.signal } : {}),
        });
        if (superseded) return superseded;
        try {
          await wahooClient.deleteRoute(String(lookup.route.id), execution.signal);
        } catch (error) {
          if (!isProviderNotFound(error)) {
            if (isDefinitiveProviderRejection(error)) {
              return createSyncFailure({
                category: "provider",
                code: "provider_failure",
                error: "Wahoo rejected route deletion",
                retryable: false,
              });
            }
            const reconciled = await this.getSingleRouteByExternalId({
              externalId,
              ...(execution.signal ? { signal: execution.signal } : {}),
              wahooClient,
            });
            if (reconciled.ambiguous || reconciled.route) {
              return createSyncFailure({
                category: "provider",
                code: "provider_failure",
                error: "Wahoo route deletion could not be verified",
                retryable: true,
              });
            }
          }
        }
      }
      if (link) {
        await this.repository.deleteRouteResourceLink({
          expectedIntegrationGeneration: execution.expectedIntegrationGeneration,
          id: link.id,
          integrationId: execution.integrationId,
          profileId,
        });
      }
      return { action: "no_change", routeId, success: true };
    } catch (error) {
      if (error instanceof WahooReconnectRequiredError) {
        return createSyncFailure({
          category: "integration",
          code: "reconnect_required",
          error: error.message,
          retryable: false,
        });
      }
      return createSyncFailure({
        category: "provider",
        code: "provider_failure",
        error: "Wahoo owned-route deletion failed",
        retryable: true,
      });
    }
  }

  /**
   * Sync an event to Wahoo
   * Handles both new syncs and updates to existing syncs
   */
  async syncEvent(
    eventId: string,
    profileId: string,
    execution?: {
      performanceModelAsOf?: string;
      expectedProjectionHash?: string;
      expectedStartsAt?: string;
      expectedTimezone?: string;
      expectedIntegrationGeneration?: number;
      integrationId?: string;
      queuedProjectionSnapshot?: WahooProjectionSnapshot;
      signal?: AbortSignal;
      updateDesiredProjection?: (input: WahooDesiredProjectionRefresh) => Promise<boolean>;
    },
  ): Promise<SyncResult> {
    try {
      // 1. Fetch planned-activity event with all related data
      const planned = await this.repository.getPlannedEventForSync({
        eventId,
        profileId,
      });
      let existingSyncLookup: ReturnType<WahooRepository["getEventResourceLink"]> | undefined;
      const getExistingSync = () => {
        existingSyncLookup ??= this.repository.getEventResourceLink({
          eventId,
          profileId,
          provider: "wahoo",
        });
        return existingSyncLookup;
      };
      const rejectOrUnsync = async (failure: SyncResult): Promise<SyncResult> => {
        const existingSync = await getExistingSync();
        if (!existingSync) return failure;
        return this.unsyncEvent(
          eventId,
          profileId,
          { externalId: existingSync.externalId, resourceLinkId: existingSync.id },
          execution,
        );
      };

      if (!planned) {
        return rejectOrUnsync(
          createSyncFailure({
            category: "eligibility",
            code: "missing_event",
            error: "Planned activity event not found",
            retryable: false,
          }),
        );
      }
      // route_push is intentionally not part of this rollout. A queued publish may
      // race with route attachment, so converge any prior planned activity to absent.
      if (planned.routeId) {
        const existingSync = await getExistingSync();
        if (existingSync) {
          return this.unsyncEvent(
            eventId,
            profileId,
            { externalId: existingSync.externalId, resourceLinkId: existingSync.id },
            execution,
          );
        }
        return createSyncFailure({
          category: "eligibility",
          code: "unsupported_target",
          error: "Wahoo route-linked planned activities are not supported",
          retryable: false,
        });
      }

      const activityPlan = normalizeActivityPlanRelation(
        planned.activityPlan as WahooActivityPlanRelation,
      );

      if (!activityPlan) {
        const existingSync = await getExistingSync();
        const routeOnlyDecision = decideRouteOnlyWahooConvergence({
          hasActivityPlan: false,
          hasEventRoute: Boolean(planned.routeId),
          hasExistingResourceLink: Boolean(existingSync),
        });
        return rejectOrUnsync(
          createSyncFailure({
            category: "eligibility",
            code: routeOnlyDecision === "missing_plan" ? "missing_plan" : "unsupported_target",
            error:
              routeOnlyDecision !== "missing_plan"
                ? "Wahoo route-only planned events are not supported because the event has no activity category."
                : "Activity plan not found for this planned activity event.",
            retryable: false,
          }),
        );
      }

      const parsedStructure = activityPlanStructureSchema.safeParse(activityPlan.structure);
      if (!parsedStructure.success) {
        return rejectOrUnsync(
          createSyncFailure({
            category: "eligibility",
            code: "invalid_plan",
            error: "A valid activity-plan structure is required for Wahoo sync.",
            retryable: false,
          }),
        );
      }
      const structure = parsedStructure.data;
      const compiled = compileActivityPlan(structure);
      const normalizedPlanned: WahooPlannedEvent = {
        id: planned.id,
        starts_at: planned.startsAt,
        scheduled_starts_at: serializeWahooScheduledStart(planned.startsAt, planned.timezone),
        timezone: planned.timezone,
        activity_plan: activityPlan,
        routeId: planned.routeId,
      };
      if (
        execution?.expectedStartsAt &&
        Date.parse(execution.expectedStartsAt) !== Date.parse(planned.startsAt)
      ) {
        return {
          success: true,
          action: "no_change",
          terminalOutcome: "superseded",
          warnings: ["Queued Wahoo schedule was superseded before execution."],
        };
      }
      if (execution?.expectedTimezone && execution.expectedTimezone !== planned.timezone) {
        return {
          success: true,
          action: "no_change",
          terminalOutcome: "superseded",
          warnings: ["Queued Wahoo event timezone was superseded before execution."],
        };
      }

      const performanceModelAsOf = execution?.performanceModelAsOf;
      if (!performanceModelAsOf || Number.isNaN(Date.parse(performanceModelAsOf))) {
        return createSyncFailure({
          category: "eligibility",
          code: "missing_performance_model_context",
          error: "Wahoo planned-activity sync requires an explicit performance-model timestamp.",
          retryable: false,
        });
      }
      const publishedTargets = await this.deps.getPerformanceTargets({ profileId });
      if (publishedTargets.status !== "available") {
        return createSyncFailure({
          category: "eligibility",
          code: "missing_performance_model_context",
          error: `Published performance targets are ${publishedTargets.status}.`,
          retryable: publishedTargets.status === "stale",
        });
      }
      if (publishedTargets.targets.asOf !== performanceModelAsOf) {
        return {
          success: true,
          action: "no_change",
          terminalOutcome: "superseded",
          warnings: ["Queued Wahoo performance targets were superseded before execution."],
        };
      }
      const profile = resolveWahooSyncMetrics(publishedTargets.targets, compiled.activity_category);

      // 3. Fetch Wahoo integration
      const integration = await this.repository.findWahooIntegrationByProfileId(profileId);

      if (!integration) {
        return createSyncFailure({
          category: "integration",
          code: "missing_integration",
          error: "Wahoo integration not found. Please connect your Wahoo account.",
          retryable: false,
        });
      }
      if (!hasWahooPlannedActivityScopes(integration.scope)) {
        return createSyncFailure({
          category: "integration",
          code: "reconnect_required",
          error: "Reconnect Wahoo to grant planned-activity sync permissions",
          retryable: false,
        });
      }
      if (
        (execution?.integrationId && execution.integrationId !== integration.id) ||
        (execution?.expectedIntegrationGeneration !== undefined &&
          execution.expectedIntegrationGeneration !== integration.integrationGeneration)
      ) {
        return { success: true, action: "no_change", terminalOutcome: "superseded" };
      }

      // 4. Convert activity category to Wahoo activity type
      const activityType = toActivityType(compiled.activity_category);

      if (!isWahooSupported(activityType)) {
        return rejectOrUnsync(
          createSyncFailure({
            category: "eligibility",
            code: "unsupported_sport",
            error: `Activity category '${activityType}' is not supported by Wahoo. Only cycling and running activities can be synced to Wahoo.`,
            retryable: false,
          }),
        );
      }

      // Reject unsupported compiled semantics before credentials refresh, route creation,
      // plan deletion, or any other provider-side mutation.
      const validation = validateWahooCompatibility(
        structure,
        buildWahooConvertOptions({
          activityType,
          description: undefined,
          hasRoute: undefined,
          metrics: profile,
          name: activityPlan.name,
        }),
      );
      if (!validation.compatible) {
        const missingCalibrationIssue = validation.issues.find(
          (candidate) => candidate.code === "missing_metric",
        );
        const issue = missingCalibrationIssue ?? validation.issues[0];
        const failure = createSyncFailure({
          category: "eligibility",
          code: issue?.code ?? "invalid_plan",
          error: issue?.message ?? "Activity plan structure is not compatible with Wahoo",
          retryable: false,
          warnings: validation.warnings,
        });
        return missingCalibrationIssue ? failure : rejectOrUnsync(failure);
      }
      const projectionSnapshot = getWahooProjectionSnapshot(
        structure,
        buildWahooConvertOptions({
          activityType,
          description: activityPlan.description ?? undefined,
          hasRoute: Boolean(planned.routeId),
          metrics: profile,
          name: activityPlan.name,
        }),
      );
      const projectionHash = hashPlannedActivityPayload({
        projectionSnapshot,
        sourcePlanId: activityPlan.id,
        sourceRouteId: planned.routeId,
      });
      const queuedProjectionHash = execution?.queuedProjectionSnapshot
        ? hashPlannedActivityPayload({
            projectionSnapshot: execution.queuedProjectionSnapshot,
            sourcePlanId: activityPlan.id,
            sourceRouteId: planned.routeId,
          })
        : null;
      if (
        execution?.expectedProjectionHash &&
        (execution.expectedProjectionHash !== projectionHash ||
          queuedProjectionHash !== execution.expectedProjectionHash)
      ) {
        const desiredStateUpdated = await execution.updateDesiredProjection?.({
          performanceModelAsOf,
          projectionHash,
          projectionSnapshot,
        });
        if (!desiredStateUpdated) {
          throw new Error("Wahoo latest-target desired state could not be fenced");
        }
      }
      const syncWarnings = [...validation.warnings];

      // 4b. Route delivery is disabled for this slice; planned.routeId was rejected above.
      let routeData: RouteFileData | null = null;
      let gpxContent: string | null = null;
      let routeWarnings: string[] = [];
      const routeId = planned.routeId;

      if (routeId) {
        const route = await this.repository.getRouteForSync({
          profileId,
          routeId,
        });

        if (route) {
          const routeGpx = await this.deps.storage.downloadRouteGpx(route.filePath);

          if (routeGpx) {
            try {
              gpxContent = routeGpx;

              // Extract start coordinates from GPX
              const startCoords = extractStartCoordinates(gpxContent);

              routeData = {
                filePath: route.filePath,
                name: route.name,
                activityType,
                totalDistance: route.totalDistance,
                ...(route.description !== null ? { description: route.description } : {}),
                ...(route.totalAscent !== null ? { totalAscent: route.totalAscent } : {}),
                ...(route.totalDescent !== null ? { totalDescent: route.totalDescent } : {}),
                ...(startCoords?.latitude !== undefined ? { startLat: startCoords.latitude } : {}),
                ...(startCoords?.longitude !== undefined
                  ? { startLng: startCoords.longitude }
                  : {}),
              };
            } catch {
              logger.warn("Wahoo sync route preparation failed", {
                operation: "prepare_route",
                outcome: "failure",
                provider: "wahoo",
              });
              // Continue without route
            }
          }
        }

        if (!routeData || !gpxContent || !supportsRoutes(activityType)) {
          return createSyncFailure({
            category: "eligibility",
            code: "invalid_plan",
            error: "Event route is missing or cannot be synced.",
            retryable: false,
          });
        }

        const routeValidation = validateRouteForWahoo(routeData);
        if (!routeValidation.valid) {
          return createSyncFailure({
            category: "eligibility",
            code: "invalid_plan",
            error: `Route validation failed: ${routeValidation.errors.join(", ")}`,
            retryable: false,
            warnings: routeValidation.warnings,
          });
        }
        routeWarnings = routeValidation.warnings;
      }

      // 5. Check if already synced
      const existingSync = await getExistingSync();
      if (existingSync) {
        const linkedProviderAccountExternalId =
          existingSync.providerMetadata?.wahoo?.providerAccountExternalId;
        if (
          linkedProviderAccountExternalId === undefined ||
          linkedProviderAccountExternalId !== integration.externalId
        ) {
          return createSyncFailure({
            category: "integration",
            code: "provider_account_mismatch",
            error: "The existing Wahoo delivery account cannot be verified",
            retryable: false,
          });
        }
      }

      const freshIntegration = await resolveWahooCredentials({
        activateAccessToken: this.deps.activateAccessToken ?? activateWahooAccessToken,
        integration: {
          ...integration,
          expiresAt: integration.expiresAt ?? null,
        },
        persistTokens: (tokens) =>
          this.repository.updateWahooIntegrationTokens({
            ...tokens,
            expectedCredentialGeneration: tokens.credentialGeneration,
            expectedIntegrationGeneration: tokens.integrationGeneration,
          }),
        markReconnectRequired: ({ credentialGeneration, id, integrationGeneration }) =>
          this.repository.markWahooReconnectRequired?.({
            expectedCredentialGeneration: credentialGeneration,
            expectedIntegrationGeneration: integrationGeneration,
            id,
          }) ?? Promise.resolve(false),
        readCurrentCredentials: () => this.repository.findWahooIntegrationByProfileId(profileId),
        refreshAccessToken: refreshWahooAccessToken,
      });
      const wahooClient = (this.deps.wahooClientFactory ?? createWahooClient)({
        accessToken: freshIntegration.accessToken,
        ...(freshIntegration.refreshToken ? { refreshToken: freshIntegration.refreshToken } : {}),
      });

      const guardedExecution = {
        expectedIntegrationGeneration:
          execution?.expectedIntegrationGeneration ?? freshIntegration.integrationGeneration,
        integrationId: execution?.integrationId ?? freshIntegration.id,
        profileId,
        providerAccountExternalId: freshIntegration.externalId,
        ...(execution?.expectedProjectionHash
          ? { expectedProjectionHash: execution.expectedProjectionHash }
          : {}),
        ...(execution?.signal ? { signal: execution.signal } : {}),
      };

      syncWarnings.push(...routeWarnings);

      // 7. Determine sync action
      if (!existingSync) {
        // New Wahoo sync - create Wahoo plan and workout resources
        return await this.createNewSync(
          normalizedPlanned,
          structure,
          profile,
          freshIntegration,
          wahooClient,
          profileId,
          activityType,
          syncWarnings,
          routeData,
          gpxContent,
          projectionHash,
          guardedExecution,
        );
      } else {
        // Update existing sync
        return await this.updateExistingSync(
          normalizedPlanned,
          existingSync,
          structure,
          profile,
          wahooClient,
          profileId,
          activityType,
          syncWarnings,
          routeData,
          gpxContent,
          projectionHash,
          guardedExecution,
        );
      }
    } catch (error) {
      logger.warn("Wahoo sync failed", {
        operation: "sync",
        outcome: "failure",
        provider: "wahoo",
      });
      if (error instanceof WahooAuthorizationResetRequiredError) {
        return createSyncFailure({
          category: "integration",
          code: "authorization_reset_required",
          error: error.message,
          retryable: false,
        });
      }
      if (error instanceof WahooReconnectRequiredError) {
        return createSyncFailure({
          category: "integration",
          code: "reconnect_required",
          error: error.message,
          retryable: false,
        });
      }
      if (isDefinitiveProviderRejection(error)) {
        return createSyncFailure({
          category: "provider",
          code: "provider_failure",
          error: "Wahoo rejected planned-activity synchronization",
          retryable: false,
        });
      }
      return createSyncFailure({
        category: "provider",
        code: "provider_failure",
        error: error instanceof Error ? error.message : "Unknown error occurred during sync",
        retryable: true,
      });
    }
  }

  private async ensurePlan(input: {
    activityType: WahooActivityType;
    description: string;
    externalId: string;
    execution: WahooProviderEffectExecution;
    name: string;
    signal?: AbortSignal;
    structure: ReturnType<typeof convertToWahooPlan>;
    wahooClient: WahooClient;
  }): Promise<EnsurePlanResult> {
    const existingPlans = await input.wahooClient.getPlans(input.externalId, input.signal);
    const existingPlan = [...existingPlans].sort((left, right) => left.id - right.id)[0];
    if (existingPlan) return { success: true, plan: existingPlan };

    const superseded = await this.getSupersededProviderEffect(input.execution);
    if (superseded) return { success: false, result: superseded };

    try {
      const plan = await input.wahooClient.createPlan(
        {
          activityType: input.activityType,
          description: input.description,
          externalId: input.externalId,
          name: input.name,
          structure: input.structure,
        },
        input.signal,
      );
      return { success: true, plan };
    } catch (error) {
      if (isDefinitiveProviderRejection(error)) {
        return {
          success: false,
          result: createSyncFailure({
            category: "provider",
            code: "provider_failure",
            error: "Wahoo rejected planned-activity plan creation",
            retryable: false,
          }),
        };
      }
      if (getWahooErrorStatus(error) === 429) {
        return {
          success: false,
          result: createSyncFailure({
            category: "provider",
            code: "provider_failure",
            error: "Wahoo rate-limited planned-activity plan creation",
            retryable: true,
          }),
        };
      }

      const reconciledPlans = await input.wahooClient.getPlans(input.externalId, input.signal);
      const reconciledPlan = [...reconciledPlans].sort((left, right) => left.id - right.id)[0];
      if (reconciledPlan) return { success: true, plan: reconciledPlan };
      return {
        success: false,
        result: createSyncFailure({
          category: "provider",
          code: "ambiguous_create",
          error: "Wahoo plan creation could not be reconciled",
          retryable: false,
        }),
      };
    }
  }

  private async updateWorkoutAndVerify(input: {
    desired: { name: string; planId: number; scheduledDate: string };
    execution: WahooProviderEffectExecution;
    signal?: AbortSignal;
    wahooClient: WahooClient;
    workoutId: string;
  }): Promise<SyncResult | null> {
    const superseded = await this.getSupersededProviderEffect(input.execution);
    if (superseded) return superseded;
    try {
      await input.wahooClient.updateWorkout(
        input.workoutId,
        {
          name: input.desired.name,
          planId: input.desired.planId,
          scheduledDate: input.desired.scheduledDate,
        },
        input.signal,
      );
      return null;
    } catch (error) {
      if (isDefinitiveProviderRejection(error)) {
        return createSyncFailure({
          category: "provider",
          code: "provider_failure",
          error: "Wahoo rejected the planned-activity update",
          retryable: false,
        });
      }

      try {
        const current = await input.wahooClient.getWorkout(input.workoutId, input.signal);
        if (workoutMatchesDesiredState(current, input.desired)) return null;
      } catch (verificationError) {
        if (
          isDefinitiveProviderRejection(verificationError) &&
          !isProviderNotFound(verificationError)
        ) {
          return createSyncFailure({
            category: "provider",
            code: "provider_failure",
            error: "Wahoo rejected planned-activity update verification",
            retryable: false,
          });
        }
      }

      return createSyncFailure({
        category: "provider",
        code: "provider_failure",
        error: "Wahoo planned-activity update could not be verified",
        retryable: true,
      });
    }
  }

  private async ensureWorkout(input: {
    desired: {
      durationMinutes: number;
      name: string;
      planId: number;
      scheduledDate: string;
      workoutTypeId: number;
    };
    eventId: string;
    execution: WahooProviderEffectExecution;
    signal?: AbortSignal;
    wahooClient: WahooClient;
  }): Promise<EnsureWorkoutResult> {
    const lookup = await input.wahooClient.findWorkoutByToken({
      token: input.eventId,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    if (!lookup.complete) {
      return {
        success: false,
        result: createSyncFailure({
          category: "provider",
          code: "ambiguous_create",
          error: "Wahoo planned-activity resource reconciliation was incomplete",
          retryable: false,
        }),
      };
    }
    if (lookup.workout) {
      const updateFailure = await this.updateWorkoutAndVerify({
        desired: input.desired,
        execution: input.execution,
        wahooClient: input.wahooClient,
        workoutId: String(lookup.workout.id),
        ...(input.signal ? { signal: input.signal } : {}),
      });
      return updateFailure
        ? { success: false, result: updateFailure }
        : { success: true, created: false, workout: lookup.workout };
    }
    const superseded = await this.getSupersededProviderEffect(input.execution);
    if (superseded) return { success: false, result: superseded };

    try {
      const workout = await input.wahooClient.createWorkout(
        {
          durationMinutes: input.desired.durationMinutes,
          externalId: input.eventId,
          name: input.desired.name,
          planId: input.desired.planId,
          scheduledDate: input.desired.scheduledDate,
          workoutTypeId: input.desired.workoutTypeId,
        },
        input.signal,
      );
      return { success: true, created: true, workout };
    } catch (error) {
      if (isDefinitiveProviderRejection(error)) {
        return {
          success: false,
          result: createSyncFailure({
            category: "provider",
            code: "provider_failure",
            error: "Wahoo rejected planned-activity resource creation",
            retryable: false,
          }),
        };
      }
      if (getWahooErrorStatus(error) === 429) {
        return {
          success: false,
          result: createSyncFailure({
            category: "provider",
            code: "provider_failure",
            error: "Wahoo rate-limited planned-activity resource creation",
            retryable: true,
          }),
        };
      }

      const reconciled = await input.wahooClient.findWorkoutByToken({
        token: input.eventId,
        ...(input.signal ? { signal: input.signal } : {}),
      });
      if (!reconciled.complete) {
        return {
          success: false,
          result: createSyncFailure({
            category: "provider",
            code: "ambiguous_create",
            error: "Wahoo planned-activity resource creation could not be reconciled completely",
            retryable: false,
          }),
        };
      }
      if (reconciled.workout) {
        const updateFailure = await this.updateWorkoutAndVerify({
          desired: input.desired,
          execution: input.execution,
          wahooClient: input.wahooClient,
          workoutId: String(reconciled.workout.id),
          ...(input.signal ? { signal: input.signal } : {}),
        });
        return updateFailure
          ? { success: false, result: updateFailure }
          : { success: true, created: false, workout: reconciled.workout };
      }
      return {
        success: false,
        result: createSyncFailure({
          category: "provider",
          code: "ambiguous_create",
          error: "Wahoo planned-activity resource creation could not be reconciled",
          retryable: false,
        }),
      };
    }
  }

  /**
   * Create a new sync (first time syncing this planned activity)
   */
  private async createNewSync(
    planned: WahooPlannedEvent,
    structure: ActivityPlanStructure,
    profile: ReturnType<typeof resolveWahooSyncMetrics>,
    integration: { externalId: string; id: string },
    wahooClient: WahooClient,
    profileId: string,
    activityType: WahooActivityType,
    warnings: string[] | undefined,
    routeData: RouteFileData | null | undefined,
    gpxContent: string | null | undefined,
    projectionHash: string | undefined,
    execution: {
      expectedIntegrationGeneration: number;
      integrationId: string;
      profileId: string;
      providerAccountExternalId: string;
      signal?: AbortSignal;
    },
  ): Promise<SyncResult> {
    // Sync route first if present
    const syncedRoute = await this.syncRouteForWorkout({
      activityType,
      execution,
      requireRoute: Boolean(planned.routeId),
      wahooClient,
      ...(gpxContent !== undefined ? { gpxContent } : {}),
      ...(routeData !== undefined ? { routeData } : {}),
    });
    if (!syncedRoute.success) {
      return syncedRoute.result;
    }
    const wahooRouteId = syncedRoute.route?.routeId;
    warnings = [...(warnings || []), ...(syncedRoute.route?.warnings ?? [])];

    // Convert to Wahoo format
    let wahooPlan: ReturnType<typeof convertToWahooPlan>;
    try {
      wahooPlan = convertToWahooPlan(
        structure,
        buildWahooConvertOptions({
          activityType,
          description: planned.activity_plan.description ?? undefined,
          hasRoute: Boolean(wahooRouteId),
          metrics: profile,
          name: planned.activity_plan.name,
        }),
      );
    } catch (error) {
      const failure = classifyPlanConversionFailure(error);
      if (failure) return failure;
      throw error;
    }

    // Create plan in Wahoo's library
    logger.info("Wahoo sync request", { operation: "create_plan", provider: "wahoo" });
    const planExternalId = `gradientpeak:${planned.activity_plan.id}:${projectionHash ?? "current"}`;
    const ensuredPlan = await this.ensurePlan({
      activityType,
      description: planned.activity_plan.description ?? "",
      externalId: planExternalId,
      execution,
      name: planned.activity_plan.name,
      structure: wahooPlan,
      wahooClient,
      ...(execution.signal ? { signal: execution.signal } : {}),
    });
    if (!ensuredPlan.success) return ensuredPlan.result;
    const plan = ensuredPlan.plan;
    logger.info("Wahoo sync request completed", {
      operation: "create_plan",
      outcome: "success",
      provider: "wahoo",
    });

    // Get Wahoo workout type ID and duration
    const workoutTypeId = toWahooWorkoutTypeId(activityType, {
      hasRoute: Boolean(wahooRouteId),
    });
    if (workoutTypeId === null) {
      return createSyncFailure({
        category: "eligibility",
        code: "unsupported_sport",
        error: `Unable to map activity category '${activityType}' to Wahoo workout type`,
        retryable: false,
      });
    }

    const durationSeconds = calculateWorkoutDuration(structure);
    const durationMinutes = Math.ceil(durationSeconds / 60);

    const scheduledDate = new Date(planned.starts_at);
    const today = new Date();
    const daysUntilWorkout = Math.ceil(
      (scheduledDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    logger.info("Wahoo sync request", { operation: "create_workout", provider: "wahoo" });

    // Warn if the Wahoo workout resource is outside the 6-day device window
    if (daysUntilWorkout > 6) {
      logger.warn("Wahoo sync window warning", {
        operation: "create_workout",
        outcome: "outside_window",
        provider: "wahoo",
      });
      warnings = [
        ...(warnings || []),
        `Wahoo workout scheduled ${daysUntilWorkout} days from now. It will only appear on your device when within 6 days of the scheduled date.`,
      ];
    }

    const ensuredWorkout = await this.ensureWorkout({
      desired: {
        durationMinutes,
        name: planned.activity_plan.name,
        planId: plan.id,
        scheduledDate: planned.scheduled_starts_at,
        workoutTypeId,
      },
      eventId: planned.id,
      execution,
      wahooClient,
      ...(execution.signal ? { signal: execution.signal } : {}),
    });
    if (!ensuredWorkout.success) return ensuredWorkout.result;
    const workout = ensuredWorkout.workout;

    logger.info("Wahoo sync request completed", {
      operation: "create_workout",
      outcome: "success",
      provider: "wahoo",
    });

    // Store sync record (only workout_id, not plan_id)
    await this.repository.createEventResourceLink({
      profileId,
      eventId: planned.id,
      integrationId: integration.id,
      expectedIntegrationGeneration: execution.expectedIntegrationGeneration,
      provider: "wahoo",
      externalId: workout.id.toString(),
      providerMetadata: {
        wahoo: {
          planId: plan.id,
          providerAccountExternalId: integration.externalId,
          sourcePlanId: planned.activity_plan.id,
          ...(projectionHash !== undefined ? { projectionHash } : {}),
          ...(wahooRouteId !== undefined ? { routeId: wahooRouteId } : {}),
          ...(wahooRouteId !== undefined ? { sourceRouteId: planned.routeId } : {}),
        },
      },
      syncedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return {
      success: true,
      action: "created",
      workoutId: workout.id.toString(),
      warnings,
    };
  }

  private async syncRouteForWorkout(input: {
    activityType: WahooActivityType;
    execution: WahooProviderEffectExecution;
    gpxContent?: string | null;
    requireRoute: boolean;
    routeData?: RouteFileData | null;
    wahooClient: WahooClient;
  }): Promise<
    { success: true; route?: SyncedWahooRoute } | { success: false; result: SyncResult }
  > {
    const routeData = input.routeData;
    if (
      !routeData ||
      !input.gpxContent ||
      !supportsRoutes(input.activityType) ||
      !hasValidRouteStartCoordinates(routeData)
    ) {
      if (!input.requireRoute) return { success: true };
      return {
        success: false,
        result: createSyncFailure({
          category: "eligibility",
          code: "invalid_plan",
          error: "Activity plan requires a syncable route.",
          retryable: false,
        }),
      };
    }

    const superseded = await this.getSupersededProviderEffect(input.execution);
    if (superseded) return { success: false, result: superseded };

    try {
      const wahooRoute = await input.wahooClient.createRoute({
        file: prepareGPXForWahoo(input.gpxContent),
        filename: `${routeData.name}.gpx`,
        externalId: routeData.filePath,
        providerUpdatedAt: new Date().toISOString(),
        name: routeData.name,
        ...(routeData.description === undefined ? {} : { description: routeData.description }),
        workoutTypeFamilyId: getWorkoutTypeFamilyForRoute(routeData.activityType),
        startLat: routeData.startLat,
        startLng: routeData.startLng,
        distance: routeData.totalDistance,
        ascent: routeData.totalAscent || 0,
        descent: routeData.totalDescent || 0,
      });

      return {
        success: true,
        route: {
          routeId: wahooRoute.id,
          warnings: [],
        },
      };
    } catch (error) {
      logger.warn("Wahoo sync failed", {
        operation: "sync_route",
        outcome: "failure",
        provider: "wahoo",
      });
      if (input.requireRoute) {
        return {
          success: false,
          result: createSyncFailure({
            category: "provider",
            code: "provider_failure",
            error: error instanceof Error ? error.message : "Route sync failed",
            retryable: true,
          }),
        };
      }

      return {
        success: true,
        route: {
          warnings: ["Wahoo route sync failed; Wahoo workout resource created without route"],
        },
      };
    }
  }

  /**
   * Update an existing sync
   * Determines if metadata only changed or if structure changed
   */
  private async updateExistingSync(
    planned: WahooPlannedEvent,
    existingSync: {
      externalId: string;
      id: string;
      providerMetadata?: WahooEventResourceProviderMetadata | null;
      updatedAt: string | null;
    },
    structure: ActivityPlanStructure,
    profile: ReturnType<typeof resolveWahooSyncMetrics>,
    wahooClient: WahooClient,
    _profileId: string,
    activityType: WahooActivityType,
    warnings: string[] | undefined,
    routeData: RouteFileData | null | undefined,
    gpxContent: string | null | undefined,
    projectionHash: string | undefined,
    execution: {
      expectedIntegrationGeneration: number;
      integrationId: string;
      profileId: string;
      providerAccountExternalId: string;
      signal?: AbortSignal;
    },
  ): Promise<SyncResult> {
    const syncedRoute = await this.syncRouteForWorkout({
      activityType,
      execution,
      requireRoute: Boolean(planned.routeId),
      wahooClient,
      ...(gpxContent !== undefined ? { gpxContent } : {}),
      ...(routeData !== undefined ? { routeData } : {}),
    });
    if (!syncedRoute.success) {
      return syncedRoute.result;
    }
    const wahooRouteId = syncedRoute.route?.routeId;
    warnings = [...(warnings || []), ...(syncedRoute.route?.warnings ?? [])];

    const workoutTypeId = toWahooWorkoutTypeId(activityType, {
      hasRoute: Boolean(wahooRouteId),
    });
    if (workoutTypeId === null) {
      return createSyncFailure({
        category: "eligibility",
        code: "unsupported_sport",
        error: `Unable to map activity category '${activityType}' to Wahoo workout type`,
        retryable: false,
      });
    }

    let wahooPlan: ReturnType<typeof convertToWahooPlan>;
    try {
      wahooPlan = convertToWahooPlan(
        structure,
        buildWahooConvertOptions({
          activityType,
          description: planned.activity_plan.description ?? undefined,
          hasRoute: Boolean(wahooRouteId),
          metrics: profile,
          name: planned.activity_plan.name,
        }),
      );
    } catch (error) {
      const failure = classifyPlanConversionFailure(error);
      if (failure) return failure;
      throw error;
    }

    const planExternalId = `gradientpeak:${planned.activity_plan.id}:${projectionHash ?? "current"}`;
    const ensuredPlan = await this.ensurePlan({
      activityType,
      description: planned.activity_plan.description ?? "",
      externalId: planExternalId,
      execution,
      name: planned.activity_plan.name,
      structure: wahooPlan,
      wahooClient,
      ...(execution.signal ? { signal: execution.signal } : {}),
    });
    if (!ensuredPlan.success) return ensuredPlan.result;
    const planId = ensuredPlan.plan.id;
    const durationMinutes = Math.ceil(calculateWorkoutDuration(structure) / 60);

    const ensuredWorkout = await this.ensureWorkout({
      desired: {
        durationMinutes,
        name: planned.activity_plan.name,
        planId,
        scheduledDate: planned.scheduled_starts_at,
        workoutTypeId,
      },
      eventId: planned.id,
      execution,
      wahooClient,
      ...(execution.signal ? { signal: execution.signal } : {}),
    });
    if (!ensuredWorkout.success) return ensuredWorkout.result;
    const workout = ensuredWorkout.workout;

    const previousPlanId = existingSync.providerMetadata?.wahoo?.planId;
    if (previousPlanId !== undefined && previousPlanId !== planId) {
      const cleanup = await this.removeUnreferencedWahooPlan({
        currentLinkId: existingSync.id,
        execution,
        planId: previousPlanId,
        wahooClient,
      });
      if (cleanup) return cleanup;
    }

    await this.repository.updateEventResourceLink({
      id: existingSync.id,
      externalId: String(workout.id),
      expectedIntegrationGeneration: execution.expectedIntegrationGeneration,
      integrationId: execution.integrationId,
      profileId: _profileId,
      providerMetadata: {
        wahoo: {
          planId,
          providerAccountExternalId: execution.providerAccountExternalId,
          sourcePlanId: planned.activity_plan.id,
          ...(projectionHash !== undefined ? { projectionHash } : {}),
          ...(wahooRouteId !== undefined ? { routeId: wahooRouteId } : {}),
          ...(wahooRouteId !== undefined ? { sourceRouteId: planned.routeId } : {}),
        },
      },
      updatedAt: new Date().toISOString(),
    });

    return {
      success: true,
      action:
        existingSync.providerMetadata?.wahoo?.projectionHash === projectionHash
          ? "updated"
          : "recreated",
      workoutId: String(workout.id),
      warnings,
    };
  }

  /**
   * Remove sync - delete the Wahoo workout resource and remove the sync record
   */
  async unsyncEvent(
    eventId: string,
    profileId: string,
    capturedTarget?: { externalId: string; resourceLinkId: string },
    execution?: {
      expectedIntegrationGeneration?: number;
      integrationId?: string;
      signal?: AbortSignal;
    },
  ): Promise<SyncResult> {
    try {
      // 1. Fetch sync record
      const persistedSync = await this.repository.getEventResourceLink({
        eventId,
        profileId,
        provider: "wahoo",
      });
      const sync =
        persistedSync ??
        (capturedTarget
          ? { externalId: capturedTarget.externalId, id: capturedTarget.resourceLinkId }
          : null);

      if (!sync) {
        return createSyncFailure({
          category: "eligibility",
          code: "missing_event",
          error: "Sync record not found",
          retryable: false,
        });
      }

      // 2. Fetch Wahoo integration
      const integration = await this.repository.findWahooIntegrationByProfileId(profileId);

      if (!integration) {
        return createSyncFailure({
          category: "integration",
          code: "missing_integration",
          error: "Wahoo integration not found. Please connect your Wahoo account.",
          retryable: false,
        });
      }
      if (
        !hasWahooPlannedActivityScopes(integration.scope) ||
        (execution?.integrationId && execution.integrationId !== integration.id) ||
        (execution?.expectedIntegrationGeneration !== undefined &&
          execution.expectedIntegrationGeneration !== integration.integrationGeneration)
      ) {
        return createSyncFailure({
          category: "integration",
          code: "reconnect_required",
          error: "Wahoo planned-activity sync is unavailable",
          retryable: false,
        });
      }
      const linkedProviderAccountExternalId =
        persistedSync?.providerMetadata?.wahoo?.providerAccountExternalId;
      if (
        linkedProviderAccountExternalId === undefined ||
        linkedProviderAccountExternalId !== integration.externalId
      ) {
        return createSyncFailure({
          category: "integration",
          code: "provider_account_mismatch",
          error: "The Wahoo delivery account cannot be verified",
          retryable: false,
        });
      }

      // 3. Delete the Wahoo workout resource
      const freshIntegration = await resolveWahooCredentials({
        activateAccessToken: this.deps.activateAccessToken ?? activateWahooAccessToken,
        integration: {
          ...integration,
          expiresAt: integration.expiresAt ?? null,
        },
        persistTokens: (tokens) =>
          this.repository.updateWahooIntegrationTokens({
            ...tokens,
            expectedCredentialGeneration: tokens.credentialGeneration,
            expectedIntegrationGeneration: tokens.integrationGeneration,
          }),
        markReconnectRequired: ({ credentialGeneration, id, integrationGeneration }) =>
          this.repository.markWahooReconnectRequired?.({
            expectedCredentialGeneration: credentialGeneration,
            expectedIntegrationGeneration: integrationGeneration,
            id,
          }) ?? Promise.resolve(false),
        readCurrentCredentials: () => this.repository.findWahooIntegrationByProfileId(profileId),
        refreshAccessToken: refreshWahooAccessToken,
      });
      const wahooClient = (this.deps.wahooClientFactory ?? createWahooClient)({
        accessToken: freshIntegration.accessToken,
        ...(freshIntegration.refreshToken ? { refreshToken: freshIntegration.refreshToken } : {}),
      });
      const expectedIntegrationGeneration =
        execution?.expectedIntegrationGeneration ?? freshIntegration.integrationGeneration;
      const providerEffectExecution: WahooProviderEffectExecution = {
        expectedIntegrationGeneration,
        integrationId: execution?.integrationId ?? freshIntegration.id,
        profileId,
        providerAccountExternalId: freshIntegration.externalId,
        ...(execution?.signal ? { signal: execution.signal } : {}),
      };

      const superseded = await this.getSupersededProviderEffect(providerEffectExecution);
      if (superseded) return superseded;

      try {
        await wahooClient.deleteWorkout(sync.externalId, execution?.signal);
      } catch (error) {
        if (!isProviderNotFound(error)) {
          if (isDefinitiveProviderRejection(error)) {
            return createSyncFailure({
              category: "provider",
              code: "provider_failure",
              error: "Wahoo rejected planned-activity removal",
              retryable: false,
            });
          }
          try {
            await wahooClient.getWorkout(sync.externalId, execution?.signal);
            return createSyncFailure({
              category: "provider",
              code: "provider_failure",
              error: "Wahoo planned-activity removal was not confirmed",
              retryable: true,
            });
          } catch (verificationError) {
            if (!isProviderNotFound(verificationError)) {
              return createSyncFailure({
                category: "provider",
                code: "provider_failure",
                error: "Wahoo planned-activity removal could not be verified",
                retryable: true,
              });
            }
          }
        }
      }

      const planId = persistedSync?.providerMetadata?.wahoo?.planId;
      if (planId !== undefined) {
        const cleanup = await this.removeUnreferencedWahooPlan({
          currentLinkId: sync.id,
          execution: providerEffectExecution,
          planId,
          wahooClient,
        });
        if (cleanup) return cleanup;
      }

      // 4. Delete sync record
      await this.repository.deleteEventResourceLink({
        id: sync.id,
        integrationId: integration.id,
        profileId,
        expectedIntegrationGeneration,
      });

      return {
        success: true,
        action: "updated",
      };
    } catch (error) {
      logger.warn("Wahoo sync failed", {
        operation: "unsync",
        outcome: "failure",
        provider: "wahoo",
      });
      if (error instanceof WahooAuthorizationResetRequiredError) {
        return createSyncFailure({
          category: "integration",
          code: "authorization_reset_required",
          error: error.message,
          retryable: false,
        });
      }
      if (error instanceof WahooReconnectRequiredError) {
        return createSyncFailure({
          category: "integration",
          code: "reconnect_required",
          error: error.message,
          retryable: false,
        });
      }
      if (isDefinitiveProviderRejection(error)) {
        return createSyncFailure({
          category: "provider",
          code: "provider_failure",
          error: "Wahoo rejected planned-activity removal",
          retryable: false,
        });
      }
      return createSyncFailure({
        category: "provider",
        code: "provider_failure",
        error: error instanceof Error ? error.message : "Unknown error occurred during unsync",
        retryable: true,
      });
    }
  }

  /**
   * Get sync status for an event
   */
  async getEventSyncStatus(
    eventId: string,
    profileId: string,
  ): Promise<Awaited<ReturnType<WahooRepository["getEventResourceLink"]>>> {
    return this.repository.getEventResourceLink({
      eventId,
      profileId,
      provider: "wahoo",
    });
  }

  /**
   * Get all syncs for an event (all providers)
   */
  async getAllEventSyncs(
    eventId: string,
    profileId: string,
  ): Promise<Awaited<ReturnType<WahooRepository["listEventResourceLinks"]>>> {
    return this.repository.listEventResourceLinks({ eventId, profileId });
  }
}
