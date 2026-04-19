/**
 * Wahoo Sync Service
 * Orchestrates syncing planned activities to Wahoo
 */

import type { ActivityPlanStructureV2 } from "@repo/core";
import type {
  PublicActivityCategory,
  PublicActivityPlansRow,
  PublicEffortType,
  PublicEventStatus,
  PublicEventType,
  PublicProfileMetricType,
} from "@repo/db";
import { toActivityType, toWahooWorkoutTypeId } from "./activity-type-utils";
import { createWahooClient, supportsRoutes } from "./client";
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

interface WahooRepository {
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
  findWahooIntegrationByProfileId(profileId: string): Promise<{
    accessToken: string;
    externalId: string;
    id: string;
    profileId: string;
    refreshToken: string | null;
  } | null>;
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
  ): Promise<{ ftp: number | null; thresholdHr: number | null } | null>;
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
  getEventResourceLink(input: {
    eventId: string;
    profileId: string;
    provider: "wahoo";
  }): Promise<{ externalId: string; id: string; updatedAt: string | null } | null>;
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
    updatedAt: string;
  }): Promise<void>;
}

type WahooActivityPlan = Pick<
  PublicActivityPlansRow,
  "id" | "name" | "description" | "activity_category" | "structure" | "updated_at" | "route_id"
>;

type WahooActivityPlanRelation = WahooActivityPlan | WahooActivityPlan[] | null;

type WahooPlannedEvent = {
  id: string;
  starts_at: string;
  activity_plan: WahooActivityPlan;
};

function normalizeActivityPlanRelation(
  relation: WahooActivityPlanRelation,
): WahooActivityPlan | null {
  return Array.isArray(relation) ? (relation[0] ?? null) : relation;
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
                activityType: toActivityType(route.activityCategory as PublicActivityCategory),
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

      const wahooClient = createWahooClient({
        accessToken: integration.accessToken,
        refreshToken: integration.refreshToken || undefined,
      });

      // 6. Validate compatibility
      const structure = activityPlan.structure as ActivityPlanStructureV2;
      const validation = validateWahooCompatibility(structure);

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
          integration,
          wahooClient,
          profileId,
          activityType,
          validation.warnings,
          routeData,
          gpxContent,
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
  ): Promise<SyncResult> {
    // Sync route first if present
    let wahooRouteId: number | undefined;
    if (routeData && gpxContent && supportsRoutes(activityType as any)) {
      try {
        // Validate route for Wahoo
        const validation = validateRouteForWahoo(routeData);
        if (!validation.valid) {
          return {
            success: false,
            action: "no_change",
            error: `Route validation failed: ${validation.errors.join(", ")}`,
            warnings: validation.warnings,
          };
        }

        // Check if we have start coordinates
        if (!routeData.startLat || !routeData.startLng) {
          return {
            success: false,
            action: "no_change",
            error: "Route has no starting coordinates",
          };
        }

        // Prepare GPX file for Wahoo (base64 encode)
        const base64Gpx = prepareGPXForWahoo(gpxContent);

        // Create route in Wahoo
        const wahooRoute = await wahooClient.createRoute({
          file: base64Gpx,
          filename: `${routeData.name}.gpx`,
          externalId: routeData.filePath,
          providerUpdatedAt: new Date().toISOString(),
          name: routeData.name,
          description: routeData.description,
          workoutTypeFamilyId: getWorkoutTypeFamilyForRoute(routeData.activityType),
          startLat: routeData.startLat,
          startLng: routeData.startLng,
          distance: routeData.totalDistance,
          ascent: routeData.totalAscent || 0,
          descent: routeData.totalDescent || 0,
        });

        wahooRouteId = wahooRoute.id;
        warnings = [...(warnings || []), ...validation.warnings];
      } catch (error) {
        console.error("Failed to sync route to Wahoo:", error);
        // Continue without route - workout can still be created
        warnings = [...(warnings || []), "Route sync failed, workout created without route"];
      }
    }

    // Convert to Wahoo format
    const wahooPlan = convertToWahooPlan(structure, {
      activityType: activityType as any,
      hasRoute: Boolean(routeData),
      name: planned.activity_plan.name,
      description: planned.activity_plan.description ?? undefined,
      ftp: profile?.ftp || undefined,
      threshold_hr: profile?.threshold_hr || undefined,
    });

    // Create plan in Wahoo's library
    console.log(`[Wahoo Sync] Creating plan for "${planned.activity_plan.name}"`);
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
    profileId: string,
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
        threshold_hr: profile?.threshold_hr || undefined,
      });

      // Create new plan
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
      const wahooClient = createWahooClient({
        accessToken: integration.accessToken,
        refreshToken: integration.refreshToken || undefined,
      });

      try {
        await wahooClient.deleteWorkout(sync.externalId);
      } catch (error) {
        console.warn("Failed to delete Wahoo workout:", error);
        // Continue to delete sync record even if Wahoo delete fails
      }

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
