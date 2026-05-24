/**
 * Wahoo Sync Service
 * Orchestrates syncing planned activities to Wahoo
 */

import type { ActivityPlanStructureV2 } from "@repo/core";
import type { PublicActivityCategory } from "@repo/db";
import { toActivityType, toWahooWorkoutTypeId } from "./activity-type-utils";
import { createWahooClient, refreshWahooAccessToken, supportsRoutes } from "./client";
import {
  calculateWorkoutDuration,
  convertToWahooPlan,
  isActivityTypeSupportedByWahoo,
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

type WahooEventResourceProviderMetadata = {
  wahoo?: {
    planId?: number;
    routeId?: number;
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
  updateWahooIntegrationTokens?(input: {
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
  getProfileSyncMetrics(
    profileId: string,
  ): Promise<{ ftp: number | null; maxHr: number | null; thresholdHr: number | null } | null>;
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
  route_id: string | null;
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
      route_id: activityPlan.routeId,
      structure: activityPlan.structure,
      updated_at: activityPlan.updatedAt,
    } as WahooActivityPlan;
  }

  return activityPlan;
}

function hasWorkoutIntervals(structure: unknown): structure is ActivityPlanStructureV2 {
  return Boolean(
    structure &&
      typeof structure === "object" &&
      "intervals" in structure &&
      Array.isArray((structure as ActivityPlanStructureV2).intervals) &&
      (structure as ActivityPlanStructureV2).intervals.length > 0,
  );
}

function isRouteOnlyActivityPlan(activityPlan: WahooActivityPlan): boolean {
  return Boolean(activityPlan.route_id && !hasWorkoutIntervals(activityPlan.structure));
}

export interface SyncResult {
  success: boolean;
  action: SyncAction;
  workoutId?: string;
  warnings?: string[];
  error?: string;
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

  private async ensureFreshIntegrationAccessToken(integration: {
    accessToken: string;
    expiresAt?: string | null;
    id: string;
    refreshToken: string | null;
  }) {
    if (!integration.expiresAt || Date.parse(integration.expiresAt) > Date.now() + 60_000) {
      return integration;
    }

    if (!integration.refreshToken) {
      return integration;
    }

    const refreshed = await refreshWahooAccessToken(integration.refreshToken);

    await this.repository.updateWahooIntegrationTokens?.({
      accessToken: refreshed.accessToken,
      expiresAt: refreshed.expiresAt,
      id: integration.id,
      refreshToken: refreshed.refreshToken,
    });

    return {
      ...integration,
      accessToken: refreshed.accessToken,
      expiresAt: refreshed.expiresAt,
      refreshToken: refreshed.refreshToken,
    };
  }

  /**
   * Sync an event to Wahoo
   * Handles both new syncs and updates to existing syncs
   */
  async syncEvent(eventId: string, profileId: string): Promise<SyncResult> {
    try {
      // 1. Fetch planned-activity event with all related data
      const planned = await this.repository.getPlannedEventForSync({ eventId, profileId });

      if (!planned) {
        return {
          success: false,
          action: "no_change",
          error: "Planned activity event not found",
        };
      }

      const activityPlan = normalizeActivityPlanRelation(
        planned.activityPlan as WahooActivityPlanRelation,
      );

      if (!activityPlan) {
        return {
          success: false,
          action: "no_change",
          error: "Activity plan not found for this planned activity event.",
        };
      }

      const normalizedPlanned: WahooPlannedEvent = {
        id: planned.id,
        starts_at: planned.startsAt,
        activity_plan: activityPlan,
      };

      // 2. Fetch user's profile for FTP and threshold HR
      const profile = await this.repository.getProfileSyncMetrics(profileId);

      // 3. Fetch Wahoo integration
      const integration = await this.repository.findWahooIntegrationByProfileId(profileId);

      if (!integration) {
        return {
          success: false,
          action: "no_change",
          error: "Wahoo integration not found. Please connect your Wahoo account.",
        };
      }

      // 4. Convert activity category to activity type
      const activityType = toActivityType(activityPlan.activity_category);

      if (!isActivityTypeSupportedByWahoo(activityType)) {
        return {
          success: false,
          action: "no_change",
          error: `Activity type '${activityType}' is not supported by Wahoo. Only cycling and running activities can be synced to Wahoo.`,
        };
      }

      // 4b. Fetch route data if route_id is present
      let routeData: RouteFileData | null = null;
      let gpxContent: string | null = null;
      const routeId = activityPlan.route_id;

      if (routeId) {
        const route = await this.repository.getRouteForSync({ profileId, routeId });

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
      }

      // 5. Check if already synced
      const existingSync = await this.repository.getEventResourceLink({
        eventId,
        profileId,
        provider: "wahoo",
      });

      const freshIntegration = await this.ensureFreshIntegrationAccessToken(integration);
      const wahooClient = createWahooClient({
        accessToken: freshIntegration.accessToken,
        refreshToken: freshIntegration.refreshToken || undefined,
      });

      const routeOnly = isRouteOnlyActivityPlan(activityPlan);

      // 6. Validate compatibility
      const structure = activityPlan.structure as ActivityPlanStructureV2;
      const validation = routeOnly
        ? { compatible: true, warnings: [] }
        : validateWahooCompatibility(structure);

      if (!validation.compatible) {
        return {
          success: false,
          action: "no_change",
          error: "Workout structure is not compatible with Wahoo",
          warnings: validation.warnings,
        };
      }

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
          validation.warnings,
          routeData,
          gpxContent,
          routeOnly,
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
          validation.warnings,
        );
      }
    } catch (error) {
      console.error("Wahoo sync error:", error);
      return {
        success: false,
        action: "no_change",
        error: error instanceof Error ? error.message : "Unknown error occurred during sync",
      };
    }
  }

  /**
   * Create a new sync (first time syncing this planned activity)
   */
  private async createNewSync(
    planned: WahooPlannedEvent,
    structure: ActivityPlanStructureV2,
    profile: any,
    integration: { id: string },
    wahooClient: any,
    profileId: string,
    activityType: string,
    warnings?: string[],
    routeData?: RouteFileData | null,
    gpxContent?: string | null,
    routeOnly?: boolean,
  ): Promise<SyncResult> {
    // Sync route first if present
    const syncedRoute = await this.syncRouteForWorkout({
      activityType,
      gpxContent,
      requireRoute: Boolean(routeOnly),
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
    const wahooPlan = convertToWahooPlan(structure, {
      activityType: activityType as any,
      hasRoute: Boolean(routeData),
      name: planned.activity_plan.name,
      description: planned.activity_plan.description ?? undefined,
      ftp: profile?.ftp || undefined,
      max_hr: profile?.maxHr || undefined,
      threshold_hr: profile?.thresholdHr || undefined,
    });

    // Create plan in Wahoo's library
    console.log(`[Wahoo Sync] Creating plan for "${planned.activity_plan.name}"`);
    await this.deleteExistingPlansForExternalId(wahooClient, planned.activity_plan.id);
    const plan = await wahooClient.createPlan({
      structure: wahooPlan,
      name: planned.activity_plan.name,
      description: planned.activity_plan.description,
      activityType: activityType as any,
      externalId: planned.activity_plan.id,
    });
    console.log(`[Wahoo Sync] Plan created with ID: ${plan.id}`);

    // Get workout type ID and duration
    const workoutTypeId = toWahooWorkoutTypeId(activityType as any, {
      hasRoute: Boolean(routeData),
    });
    if (workoutTypeId === null) {
      return {
        success: false,
        action: "no_change",
        error: `Unable to map activity type '${activityType}' to Wahoo workout type`,
      };
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
      providerMetadata: { wahoo: { planId: plan.id, routeId: wahooRouteId } },
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
    activityType: string;
    gpxContent?: string | null;
    requireRoute: boolean;
    routeData?: RouteFileData | null;
    wahooClient: any;
  }): Promise<
    { success: true; route?: SyncedWahooRoute } | { success: false; result: SyncResult }
  > {
    if (!input.routeData || !input.gpxContent || !supportsRoutes(input.activityType as any)) {
      if (!input.requireRoute) return { success: true };
      return {
        success: false,
        result: {
          success: false,
          action: "no_change",
          error: "Route-only activity plan requires a syncable route.",
        },
      };
    }

    try {
      const validation = validateRouteForWahoo(input.routeData);
      if (!validation.valid) {
        return {
          success: false,
          result: {
            success: false,
            action: "no_change",
            error: `Route validation failed: ${validation.errors.join(", ")}`,
            warnings: validation.warnings,
          },
        };
      }

      if (!input.routeData.startLat || !input.routeData.startLng) {
        return {
          success: false,
          result: {
            success: false,
            action: "no_change",
            error: "Route has no starting coordinates",
          },
        };
      }

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
          warnings: validation.warnings,
        },
      };
    } catch (error) {
      console.error("Failed to sync route to Wahoo:", error);
      if (input.requireRoute) {
        return {
          success: false,
          result: {
            success: false,
            action: "no_change",
            error: error instanceof Error ? error.message : "Route sync failed",
          },
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
    activityType: string;
    integration: { id: string };
    planned: WahooPlannedEvent;
    profileId: string;
    routeId?: number;
    wahooClient: any;
    warnings?: string[];
  }): Promise<SyncResult> {
    if (!input.routeId) {
      return {
        success: false,
        action: "no_change",
        error: "Route-only activity plan requires a Wahoo route.",
      };
    }

    const workoutTypeId = toWahooWorkoutTypeId(input.activityType as any, { hasRoute: true });
    if (workoutTypeId === null) {
      return {
        success: false,
        action: "no_change",
        error: `Unable to map activity type '${input.activityType}' to Wahoo workout type`,
      };
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
      providerMetadata: { wahoo: { routeId: input.routeId } },
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
    existingSync: any,
    structure: ActivityPlanStructureV2,
    profile: any,
    wahooClient: any,
    _profileId: string,
    activityType: string,
    warnings?: string[],
  ): Promise<SyncResult> {
    // Determine what changed by comparing timestamps or hashing structure
    const activityPlanUpdatedAt = new Date(planned.activity_plan.updated_at).getTime();
    const syncUpdatedAt = new Date(existingSync.updatedAt ?? 0).getTime();
    const structureChanged = activityPlanUpdatedAt > syncUpdatedAt;

    if (!structureChanged) {
      // Only metadata might have changed (name or date)
      // Update the workout
      await wahooClient.updateWorkout(existingSync.externalId, {
        name: planned.activity_plan.name,
        scheduledDate: new Date(planned.starts_at).toISOString(),
      });

      // Update sync record timestamp
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
    } else {
      // Structure changed - need to recreate
      // Convert to Wahoo format
      const wahooPlan = convertToWahooPlan(structure, {
        activityType: activityType as any,
        hasRoute: Boolean(planned.activity_plan.route_id),
        name: planned.activity_plan.name,
        description: planned.activity_plan.description ?? undefined,
        ftp: profile?.ftp || undefined,
        max_hr: profile?.maxHr || undefined,
        threshold_hr: profile?.thresholdHr || undefined,
      });

      // Create new plan
      await this.deleteExistingPlansForExternalId(
        wahooClient,
        planned.activity_plan.id,
        existingSync.providerMetadata?.wahoo?.planId,
      );
      const plan = await wahooClient.createPlan({
        structure: wahooPlan,
        name: planned.activity_plan.name,
        description: planned.activity_plan.description ?? undefined,
        activityType: activityType as any,
        externalId: planned.activity_plan.id,
      });

      // Get workout type ID and duration
      const workoutTypeId = toWahooWorkoutTypeId(activityType as any, {
        hasRoute: Boolean(planned.activity_plan.route_id),
      });
      if (workoutTypeId === null) {
        return {
          success: false,
          action: "no_change",
          error: `Unable to map activity type '${activityType}' to Wahoo workout type`,
        };
      }

      const durationSeconds = calculateWorkoutDuration(structure);
      const durationMinutes = Math.ceil(durationSeconds / 60);

      // Create new workout
      const workout = await wahooClient.createWorkout({
        planId: plan.id,
        name: planned.activity_plan.name,
        scheduledDate: new Date(planned.starts_at).toISOString(),
        externalId: planned.id,
        workoutTypeId: workoutTypeId,
        durationMinutes: durationMinutes,
      });

      // Delete old workout
      try {
        await wahooClient.deleteWorkout(existingSync.externalId);
      } catch (error) {
        // Log but don't fail if old workout can't be deleted
        console.warn("Failed to delete old Wahoo workout:", error);
      }

      // Update sync record with new workout ID
      await this.repository.updateEventResourceLink({
        id: existingSync.id,
        externalId: workout.id.toString(),
        providerMetadata: { wahoo: { planId: plan.id } },
        updatedAt: new Date().toISOString(),
      });

      return {
        success: true,
        action: "recreated",
        workoutId: workout.id.toString(),
        warnings,
      };
    }
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
        return {
          success: false,
          action: "no_change",
          error: "Sync record not found",
        };
      }

      // 2. Fetch Wahoo integration
      const integration = await this.repository.findWahooIntegrationByProfileId(profileId);

      if (!integration) {
        return {
          success: false,
          action: "no_change",
          error: "Wahoo integration not found",
        };
      }

      // 3. Delete workout from Wahoo
      const freshIntegration = await this.ensureFreshIntegrationAccessToken(integration);
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
      return {
        success: false,
        action: "no_change",
        error: error instanceof Error ? error.message : "Unknown error occurred during unsync",
      };
    }
  }

  /**
   * Get sync status for an event
   */
  async getEventSyncStatus(eventId: string, profileId: string): Promise<any> {
    return this.repository.getEventResourceLink({ eventId, profileId, provider: "wahoo" });
  }

  /**
   * Get all syncs for an event (all providers)
   */
  async getAllEventSyncs(eventId: string, profileId: string): Promise<any[]> {
    return this.repository.listEventResourceLinks({ eventId, profileId });
  }
}
