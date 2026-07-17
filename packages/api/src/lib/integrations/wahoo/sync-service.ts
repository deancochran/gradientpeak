/**
 * Wahoo Sync Service
 * Orchestrates syncing planned activities to Wahoo
 */

import {
  type ActivityPlanStructureV3,
  activityPlanStructureSchemaV3,
  compileActivityPlanV3,
} from "@repo/core";
import {
  type ActivityEffortThresholdEvidence,
  resolveCanonicalThresholds,
  type ThresholdMetricSource,
} from "@repo/core/athlete-inputs";
import type { PublicActivityCategory } from "@repo/db";
import { hashPlannedWorkoutPayload } from "../../provider-sync/planned-workouts/planned-workout-hash";
import {
  isWahooSupported,
  supportsRoutes,
  toActivityType,
  toWahooWorkoutTypeId,
  type WahooActivityType,
} from "./activity-type-utils";
import { createWahooClient, refreshWahooAccessToken } from "./client";
import { resolveWahooCredentials, WahooReconnectRequiredError } from "./credentials";
import {
  calculateWorkoutDuration,
  convertToWahooPlan,
  getWahooProjectionSnapshot,
  validateWahooCompatibility,
} from "./plan-converter";
import {
  extractStartCoordinates,
  getWorkoutTypeFamilyForRoute,
  prepareGPXForWahoo,
  type RouteFileData,
  validateRouteForWahoo,
} from "./route-converter";

type SyncAction = "created" | "updated" | "recreated" | "no_change";

const FTP_FRESHNESS_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

type WahooEventResourceProviderMetadata = {
  wahoo?: {
    planId?: number;
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
    profileId: string;
    provider: "wahoo";
    providerMetadata?: WahooEventResourceProviderMetadata | null;
    syncedAt: string;
    updatedAt: string;
  }): Promise<void>;
  deleteEventResourceLink(id: string): Promise<void>;
  findWahooIntegrationByProfileId(profileId: string): Promise<{
    accessToken: string;
    expiresAt?: string | null;
    externalId: string;
    id: string;
    profileId: string;
    refreshToken: string | null;
  } | null>;
  updateWahooIntegrationTokens(input: {
    accessToken: string;
    expiresAt: string | null;
    id: string;
    refreshToken: string | null;
  }): Promise<void>;
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
  getProfileSyncMetrics(profileId: string): Promise<WahooSyncProfileMetrics | null>;
  getRouteForSync(input: { profileId: string; routeId: string }): Promise<{
    description: string | null;
    filePath: string;
    id: string;
    name: string;
    totalAscent: number | null;
    totalDescent: number | null;
    totalDistance: number;
  } | null>;
  getEventResourceLink(input: { eventId: string; profileId: string; provider: "wahoo" }): Promise<{
    externalId: string;
    id: string;
    providerMetadata?: WahooEventResourceProviderMetadata | null;
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
    id: string;
    providerMetadata?: WahooEventResourceProviderMetadata | null;
    updatedAt: string;
  }): Promise<void>;
}

type WahooActivityPlan = {
  activity_category: PublicActivityCategory;
  description: string | null;
  id: string;
  name: string;
  routeId: string | null;
  structure: unknown;
  updated_at: string;
};

type WahooRepositoryActivityPlan = {
  activityCategory: PublicActivityCategory;
  description: string | null;
  id: string;
  name: string;
  routeId: string | null;
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
  activity_plan: WahooActivityPlan;
};

type WahooSyncProfileMetrics = {
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
};

function normalizeActivityPlanRelation(
  relation: WahooActivityPlanRelation,
): WahooActivityPlan | null {
  const activityPlan = Array.isArray(relation) ? (relation[0] ?? null) : relation;
  if (!activityPlan) return null;

  if ("activityCategory" in activityPlan) {
    return {
      activity_category: activityPlan.activityCategory,
      description: activityPlan.description,
      id: activityPlan.id,
      name: activityPlan.name,
      routeId: activityPlan.routeId,
      structure: activityPlan.structure,
      updated_at: activityPlan.updatedAt,
    } as WahooActivityPlan;
  }

  return activityPlan;
}

export function resolveWahooSyncMetrics(
  profile: WahooSyncProfileMetrics | null,
  activityCategory: WahooActivityPlan["activity_category"],
) {
  if (!profile) return null;

  const ftp = resolveCanonicalThresholds({
    now: new Date().toISOString(),
    freshnessWindowMs: FTP_FRESHNESS_WINDOW_MS,
    directMetrics: profile.ftpMetrics.map((metric) => ({
      threshold: "cycling_ftp" as const,
      ...metric,
    })),
    activityEfforts: profile.bikePowerEfforts.map((effort) => ({
      sport: "bike" as const,
      metric: "power" as const,
      durationSeconds: 1200,
      ...effort,
    })),
  }).cycling_ftp;

  return {
    ftp: ftp.value,
    maxHr: profile.maxHr,
    thresholdHr:
      (activityCategory === "bike" || activityCategory === "run" || activityCategory === "swim"
        ? profile.thresholdHrBySport?.[activityCategory]
        : null) ?? profile.thresholdHr,
  };
}

export type SyncFailureCategory = "eligibility" | "integration" | "provider";

export type SyncFailureCode =
  | "missing_metric"
  | "unsupported_target"
  | "unsupported_segment"
  | "unsupported_sport"
  | "invalid_plan"
  | "missing_plan"
  | "missing_event"
  | "missing_integration"
  | "reconnect_required"
  | "provider_failure";

export type SyncResult =
  | {
      success: true;
      action: SyncAction;
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

function classifyPlanConversionFailure(error: unknown): SyncResult | null {
  if (!(error instanceof Error)) return null;

  const missingMetric =
    error.message ===
      "A positive FTP is required to sync a workout with FTP-relative targets to Wahoo." ||
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
      repository: WahooRepository;
      storage: WahooSyncStorage;
    },
  ) {}

  private get repository() {
    return this.deps.repository;
  }

  /**
   * Sync an event to Wahoo
   * Handles both new syncs and updates to existing syncs
   */
  async syncEvent(
    eventId: string,
    profileId: string,
    execution?: { expectedProjectionHash?: string },
  ): Promise<SyncResult> {
    try {
      // 1. Fetch planned-activity event with all related data
      const planned = await this.repository.getPlannedEventForSync({
        eventId,
        profileId,
      });

      if (!planned) {
        return createSyncFailure({
          category: "eligibility",
          code: "missing_event",
          error: "Planned activity event not found",
          retryable: false,
        });
      }

      const activityPlan = normalizeActivityPlanRelation(
        planned.activityPlan as WahooActivityPlanRelation,
      );

      if (!activityPlan) {
        return createSyncFailure({
          category: "eligibility",
          code: "missing_plan",
          error: "Activity plan not found for this planned activity event.",
          retryable: false,
        });
      }

      const parsedStructure = activityPlanStructureSchemaV3.safeParse(activityPlan.structure);
      if (!parsedStructure.success) {
        return createSyncFailure({
          category: "eligibility",
          code: "invalid_plan",
          error: "A valid Activity Plan V3 structure is required for Wahoo sync.",
          retryable: false,
        });
      }
      const structure = parsedStructure.data;
      const compiled = compileActivityPlanV3(structure);
      const routeOnly = false;

      const normalizedPlanned: WahooPlannedEvent = {
        id: planned.id,
        starts_at: planned.startsAt,
        activity_plan: activityPlan,
      };

      // 2. Fetch user's profile for FTP and threshold HR
      const profile = resolveWahooSyncMetrics(
        await this.repository.getProfileSyncMetrics(profileId),
        compiled.primaryCategory,
      );

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

      // 4. Convert activity category to activity type
      const activityType = toActivityType(compiled.primaryCategory);

      if (!isWahooSupported(activityType)) {
        return createSyncFailure({
          category: "eligibility",
          code: "unsupported_sport",
          error: `Activity type '${activityType}' is not supported by Wahoo. Only cycling and running activities can be synced to Wahoo.`,
          retryable: false,
        });
      }

      // Reject unsupported compiled semantics before credentials refresh, route creation,
      // plan deletion, or any other provider-side mutation.
      const validation = validateWahooCompatibility(structure, {
        activityType,
        name: activityPlan.name,
        ftp: profile?.ftp || undefined,
        max_hr: profile?.maxHr || undefined,
        threshold_hr: profile?.thresholdHr || undefined,
      });
      if (!validation.compatible) {
        const issue = validation.issues[0];
        return createSyncFailure({
          category: "eligibility",
          code: issue?.code ?? "invalid_plan",
          error: issue?.message ?? "Workout structure is not compatible with Wahoo",
          retryable: false,
          warnings: validation.warnings,
        });
      }
      const projectionHash = hashPlannedWorkoutPayload({
        projectionSnapshot: getWahooProjectionSnapshot(structure, {
          activityType,
          description: activityPlan.description ?? undefined,
          hasRoute: Boolean(activityPlan.routeId),
          name: activityPlan.name,
          ftp: profile?.ftp || undefined,
          max_hr: profile?.maxHr || undefined,
          threshold_hr: profile?.thresholdHr || undefined,
        }),
        sourcePlanId: activityPlan.id,
        sourceRouteId: activityPlan.routeId,
      });
      if (
        execution?.expectedProjectionHash &&
        execution.expectedProjectionHash !== projectionHash
      ) {
        return {
          success: true,
          action: "no_change",
          terminalOutcome: "superseded",
          warnings: ["Queued Wahoo projection was superseded before execution."],
        };
      }
      const syncWarnings = [...validation.warnings];

      // 4b. Fetch route data if the event links a route.
      let routeData: RouteFileData | null = null;
      let gpxContent: string | null = null;
      let routeWarnings: string[] = [];
      const routeId = activityPlan.routeId;

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
                description: route.description ?? undefined,
                activityType,
                totalDistance: route.totalDistance,
                totalAscent: route.totalAscent ?? undefined,
                totalDescent: route.totalDescent ?? undefined,
                startLat: startCoords?.latitude,
                startLng: startCoords?.longitude,
              };
            } catch (error) {
              console.warn("Failed to load route file:", error);
              // Continue without route
            }
          }
        }

        if (!routeData || !gpxContent || !supportsRoutes(activityType)) {
          return createSyncFailure({
            category: "eligibility",
            code: "invalid_plan",
            error: "Activity plan route is missing or cannot be synced.",
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

        if (!Number.isFinite(routeData.startLat) || !Number.isFinite(routeData.startLng)) {
          return createSyncFailure({
            category: "eligibility",
            code: "invalid_plan",
            error: "Route has no starting coordinates",
            retryable: false,
          });
        }
      }

      // 5. Check if already synced
      const existingSync = await this.repository.getEventResourceLink({
        eventId,
        profileId,
        provider: "wahoo",
      });

      const freshIntegration = await resolveWahooCredentials({
        integration: {
          ...integration,
          expiresAt: integration.expiresAt ?? null,
        },
        persistTokens: (tokens) => this.repository.updateWahooIntegrationTokens(tokens),
        refreshAccessToken: refreshWahooAccessToken,
      });
      const wahooClient = createWahooClient({
        accessToken: freshIntegration.accessToken,
        refreshToken: freshIntegration.refreshToken || undefined,
      });

      syncWarnings.push(...routeWarnings);

      // 7. Determine sync action
      if (!existingSync) {
        // New sync - create plan and workout
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
          routeOnly,
          projectionHash,
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
          routeOnly,
          projectionHash,
        );
      }
    } catch (error) {
      console.error("Wahoo sync error:", error);
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
        error: error instanceof Error ? error.message : "Unknown error occurred during sync",
        retryable: true,
      });
    }
  }

  /**
   * Create a new sync (first time syncing this planned activity)
   */
  private async createNewSync(
    planned: WahooPlannedEvent,
    structure: ActivityPlanStructureV3,
    profile: any,
    integration: { id: string },
    wahooClient: any,
    profileId: string,
    activityType: WahooActivityType,
    warnings?: string[],
    routeData?: RouteFileData | null,
    gpxContent?: string | null,
    routeOnly?: boolean,
    projectionHash?: string,
  ): Promise<SyncResult> {
    // Sync route first if present
    const syncedRoute = await this.syncRouteForWorkout({
      activityType,
      gpxContent,
      requireRoute: Boolean(planned.activity_plan.routeId),
      routeData,
      wahooClient,
    });
    if (!syncedRoute.success) {
      return syncedRoute.result;
    }
    const wahooRouteId = syncedRoute.route?.routeId;
    warnings = [...(warnings || []), ...(syncedRoute.route?.warnings ?? [])];

    if (routeOnly) {
      return await this.createRouteOnlySync({
        activityType,
        integration,
        planned,
        profileId,
        routeId: wahooRouteId,
        wahooClient,
        warnings,
      });
    }

    // Convert to Wahoo format
    let wahooPlan: ReturnType<typeof convertToWahooPlan>;
    try {
      wahooPlan = convertToWahooPlan(structure, {
        activityType,
        hasRoute: Boolean(wahooRouteId),
        name: planned.activity_plan.name,
        description: planned.activity_plan.description ?? undefined,
        ftp: profile?.ftp || undefined,
        max_hr: profile?.maxHr || undefined,
        threshold_hr: profile?.thresholdHr || undefined,
      });
    } catch (error) {
      const failure = classifyPlanConversionFailure(error);
      if (failure) return failure;
      throw error;
    }

    // Create plan in Wahoo's library
    console.log(`[Wahoo Sync] Creating plan for "${planned.activity_plan.name}"`);
    await this.deleteExistingPlansForExternalId(wahooClient, planned.activity_plan.id);
    const plan = await wahooClient.createPlan({
      structure: wahooPlan,
      name: planned.activity_plan.name,
      description: planned.activity_plan.description,
      activityType,
      externalId: planned.activity_plan.id,
    });
    console.log(`[Wahoo Sync] Plan created with ID: ${plan.id}`);

    // Get workout type ID and duration
    const workoutTypeId = toWahooWorkoutTypeId(activityType, {
      hasRoute: Boolean(wahooRouteId),
    });
    if (workoutTypeId === null) {
      return createSyncFailure({
        category: "eligibility",
        code: "unsupported_sport",
        error: `Unable to map activity type '${activityType}' to Wahoo workout type`,
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

    console.log(`[Wahoo Sync] Workout details:`, {
      name: planned.activity_plan.name,
      scheduledDate: scheduledDate.toISOString(),
      daysUntilWorkout,
      workoutTypeId,
      durationMinutes,
      planId: plan.id,
      routeId: wahooRouteId,
    });

    // Warn if workout is outside Wahoo's 6-day window
    if (daysUntilWorkout > 6) {
      console.warn(
        `[Wahoo Sync] WARNING: Workout scheduled ${daysUntilWorkout} days from now. Wahoo only displays workouts scheduled within 6 days on devices.`,
      );
      warnings = [
        ...(warnings || []),
        `Workout scheduled ${daysUntilWorkout} days from now. It will only appear on your device when within 6 days of the scheduled date.`,
      ];
    }

    // Create workout on Wahoo's calendar with optional route
    const workout = await wahooClient.createWorkout({
      planId: plan.id,
      name: planned.activity_plan.name,
      scheduledDate: scheduledDate.toISOString(),
      externalId: planned.id,
      routeId: wahooRouteId,
      workoutTypeId: workoutTypeId,
      durationMinutes: durationMinutes,
    });

    console.log(`[Wahoo Sync] Workout created successfully with ID: ${workout.id}`);

    // Store sync record (only workout_id, not plan_id)
    await this.repository.createEventResourceLink({
      profileId,
      eventId: planned.id,
      integrationId: integration.id,
      provider: "wahoo",
      externalId: workout.id.toString(),
      providerMetadata: {
        wahoo: {
          planId: plan.id,
          projectionHash,
          routeId: wahooRouteId,
          sourcePlanId: planned.activity_plan.id,
          ...(wahooRouteId !== undefined ? { sourceRouteId: planned.activity_plan.routeId } : {}),
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
    gpxContent?: string | null;
    requireRoute: boolean;
    routeData?: RouteFileData | null;
    wahooClient: any;
  }): Promise<
    { success: true; route?: SyncedWahooRoute } | { success: false; result: SyncResult }
  > {
    if (!input.routeData || !input.gpxContent || !supportsRoutes(input.activityType)) {
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

    try {
      const wahooRoute = await input.wahooClient.createRoute({
        file: prepareGPXForWahoo(input.gpxContent),
        filename: `${input.routeData.name}.gpx`,
        externalId: input.routeData.filePath,
        providerUpdatedAt: new Date().toISOString(),
        name: input.routeData.name,
        description: input.routeData.description,
        workoutTypeFamilyId: getWorkoutTypeFamilyForRoute(input.routeData.activityType),
        startLat: input.routeData.startLat,
        startLng: input.routeData.startLng,
        distance: input.routeData.totalDistance,
        ascent: input.routeData.totalAscent || 0,
        descent: input.routeData.totalDescent || 0,
      });

      return {
        success: true,
        route: {
          routeId: wahooRoute.id,
          warnings: [],
        },
      };
    } catch (error) {
      console.error("Failed to sync route to Wahoo:", error);
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
          warnings: ["Route sync failed, workout created without route"],
        },
      };
    }
  }

  private async createRouteOnlySync(input: {
    activityType: WahooActivityType;
    integration: { id: string };
    planned: WahooPlannedEvent;
    profileId: string;
    routeId?: number;
    wahooClient: any;
    warnings?: string[];
  }): Promise<SyncResult> {
    if (!input.routeId) {
      return createSyncFailure({
        category: "eligibility",
        code: "invalid_plan",
        error: "Route-only activity plan requires a Wahoo route.",
        retryable: false,
      });
    }

    const workoutTypeId = toWahooWorkoutTypeId(input.activityType, {
      hasRoute: true,
    });
    if (workoutTypeId === null) {
      return createSyncFailure({
        category: "eligibility",
        code: "unsupported_sport",
        error: `Unable to map activity type '${input.activityType}' to Wahoo workout type`,
        retryable: false,
      });
    }

    const workout = await input.wahooClient.createWorkout({
      name: input.planned.activity_plan.name,
      scheduledDate: new Date(input.planned.starts_at).toISOString(),
      externalId: input.planned.id,
      routeId: input.routeId,
      workoutTypeId,
      durationMinutes: 1,
    });

    await this.repository.createEventResourceLink({
      profileId: input.profileId,
      eventId: input.planned.id,
      integrationId: input.integration.id,
      provider: "wahoo",
      externalId: workout.id.toString(),
      providerMetadata: {
        wahoo: {
          routeId: input.routeId,
          sourcePlanId: input.planned.activity_plan.id,
          ...(input.routeId !== undefined
            ? { sourceRouteId: input.planned.activity_plan.routeId }
            : {}),
        },
      },
      syncedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return {
      success: true,
      action: "created",
      workoutId: workout.id.toString(),
      warnings: input.warnings,
    };
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
    structure: ActivityPlanStructureV3,
    profile: any,
    wahooClient: any,
    _profileId: string,
    activityType: WahooActivityType,
    warnings?: string[],
    routeData?: RouteFileData | null,
    gpxContent?: string | null,
    routeOnly?: boolean,
    projectionHash?: string,
  ): Promise<SyncResult> {
    const activityPlanUpdatedAt = new Date(planned.activity_plan.updated_at).getTime();
    const syncUpdatedAt = new Date(existingSync.updatedAt ?? 0).getTime();
    const providerMetadata = existingSync.providerMetadata?.wahoo;
    const sourcePlanChanged = providerMetadata?.sourcePlanId !== planned.activity_plan.id;
    const sourceRouteChanged =
      (providerMetadata?.sourceRouteId ?? null) !== planned.activity_plan.routeId;
    const projectionChanged = providerMetadata?.projectionHash !== projectionHash;
    const requiresRecreation =
      activityPlanUpdatedAt > syncUpdatedAt ||
      sourcePlanChanged ||
      sourceRouteChanged ||
      projectionChanged;

    if (!requiresRecreation) {
      await wahooClient.updateWorkout(existingSync.externalId, {
        name: planned.activity_plan.name,
        scheduledDate: new Date(planned.starts_at).toISOString(),
      });

      await this.repository.updateEventResourceLink({
        id: existingSync.id,
        updatedAt: new Date().toISOString(),
      });

      return {
        success: true,
        action: "updated",
        workoutId: existingSync.externalId,
        warnings,
      };
    }

    const syncedRoute = await this.syncRouteForWorkout({
      activityType,
      gpxContent,
      requireRoute: Boolean(planned.activity_plan.routeId),
      routeData,
      wahooClient,
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
        error: `Unable to map activity type '${activityType}' to Wahoo workout type`,
        retryable: false,
      });
    }

    let planId: number | undefined;
    let durationMinutes = 1;

    if (!routeOnly) {
      let wahooPlan: ReturnType<typeof convertToWahooPlan>;
      try {
        wahooPlan = convertToWahooPlan(structure, {
          activityType,
          hasRoute: Boolean(wahooRouteId),
          name: planned.activity_plan.name,
          description: planned.activity_plan.description ?? undefined,
          ftp: profile?.ftp || undefined,
          max_hr: profile?.maxHr || undefined,
          threshold_hr: profile?.thresholdHr || undefined,
        });
      } catch (error) {
        const failure = classifyPlanConversionFailure(error);
        if (failure) return failure;
        throw error;
      }

      await this.deleteExistingPlansForExternalId(
        wahooClient,
        planned.activity_plan.id,
        providerMetadata?.planId,
      );
      const plan = await wahooClient.createPlan({
        structure: wahooPlan,
        name: planned.activity_plan.name,
        description: planned.activity_plan.description ?? undefined,
        activityType,
        externalId: planned.activity_plan.id,
      });
      planId = plan.id;
      durationMinutes = Math.ceil(calculateWorkoutDuration(structure) / 60);
    } else if (providerMetadata?.planId && typeof wahooClient.deletePlan === "function") {
      try {
        await wahooClient.deletePlan(providerMetadata.planId);
      } catch (error) {
        console.warn("Failed to delete old Wahoo plan:", error);
      }
    }

    const workout = await wahooClient.createWorkout({
      planId,
      name: planned.activity_plan.name,
      scheduledDate: new Date(planned.starts_at).toISOString(),
      externalId: planned.id,
      routeId: wahooRouteId,
      workoutTypeId,
      durationMinutes,
    });

    try {
      await wahooClient.deleteWorkout(existingSync.externalId);
    } catch (error) {
      console.warn("Failed to delete old Wahoo workout:", error);
    }

    await this.repository.updateEventResourceLink({
      id: existingSync.id,
      externalId: workout.id.toString(),
      providerMetadata: {
        wahoo: {
          planId,
          projectionHash,
          routeId: wahooRouteId,
          sourcePlanId: planned.activity_plan.id,
          ...(wahooRouteId !== undefined ? { sourceRouteId: planned.activity_plan.routeId } : {}),
        },
      },
      updatedAt: new Date().toISOString(),
    });

    return {
      success: true,
      action: "recreated",
      workoutId: workout.id.toString(),
      warnings,
    };
  }

  private async deleteExistingPlansForExternalId(
    wahooClient: any,
    externalId: string,
    storedPlanId?: number,
  ) {
    if (typeof wahooClient.deletePlan !== "function") {
      return;
    }

    const deletedPlanIds = new Set<number>();
    if (storedPlanId) {
      try {
        await wahooClient.deletePlan(storedPlanId);
        deletedPlanIds.add(storedPlanId);
      } catch (error) {
        console.warn("Failed to delete stored Wahoo plan before replacement:", error);
      }
    }

    if (typeof wahooClient.getPlans !== "function") {
      return;
    }

    const existingPlans = await wahooClient.getPlans(externalId);
    for (const plan of existingPlans) {
      if (plan?.id && !deletedPlanIds.has(plan.id)) {
        await wahooClient.deletePlan(plan.id);
      }
    }
  }

  /**
   * Remove sync - delete workout from Wahoo and remove sync record
   */
  async unsyncEvent(eventId: string, profileId: string): Promise<SyncResult> {
    try {
      // 1. Fetch sync record
      const sync = await this.repository.getEventResourceLink({
        eventId,
        profileId,
        provider: "wahoo",
      });

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

      // 3. Delete workout from Wahoo
      const freshIntegration = await resolveWahooCredentials({
        integration: {
          ...integration,
          expiresAt: integration.expiresAt ?? null,
        },
        persistTokens: (tokens) => this.repository.updateWahooIntegrationTokens(tokens),
        refreshAccessToken: refreshWahooAccessToken,
      });
      const wahooClient = createWahooClient({
        accessToken: freshIntegration.accessToken,
        refreshToken: freshIntegration.refreshToken || undefined,
      });

      await wahooClient.deleteWorkout(sync.externalId);

      // 4. Delete sync record
      await this.repository.deleteEventResourceLink(sync.id);

      return {
        success: true,
        action: "updated",
      };
    } catch (error) {
      console.error("Wahoo unsync error:", error);
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
        error: error instanceof Error ? error.message : "Unknown error occurred during unsync",
        retryable: true,
      });
    }
  }

  /**
   * Get sync status for an event
   */
  async getEventSyncStatus(eventId: string, profileId: string): Promise<any> {
    return this.repository.getEventResourceLink({
      eventId,
      profileId,
      provider: "wahoo",
    });
  }

  /**
   * Get all syncs for an event (all providers)
   */
  async getAllEventSyncs(eventId: string, profileId: string): Promise<any[]> {
    return this.repository.listEventResourceLinks({ eventId, profileId });
  }
}
