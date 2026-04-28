import { randomUUID } from "node:crypto";
import { type DrizzleDbClient, schema } from "@repo/db";
import { and, eq } from "drizzle-orm";
import type { CreateWahooRepositoryOptions, WahooRepository } from "../../repositories";

function toIsoString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function createWahooRepository({ db }: CreateWahooRepositoryOptions): WahooRepository {
  return {
    async createEventResourceLink(input) {
      await db.insert(schema.integrationResourceLinks).values({
        id: randomUUID(),
        created_at: new Date(),
        external_id: input.externalId,
        integration_id: input.integrationId,
        internal_resource_id: input.eventId,
        profile_id: input.profileId,
        provider: input.provider,
        resource_kind: "event",
        synced_at: new Date(input.syncedAt),
        updated_at: new Date(input.updatedAt),
      });
    },

    async deleteEventResourceLink(id) {
      await db
        .delete(schema.integrationResourceLinks)
        .where(eq(schema.integrationResourceLinks.id, id));
    },

    async findWahooIntegrationByProfileId(profileId) {
      const [row] = await db
        .select({
          accessToken: schema.integrations.access_token,
          externalId: schema.integrations.external_id,
          id: schema.integrations.id,
          profileId: schema.integrations.profile_id,
          refreshToken: schema.integrations.refresh_token,
        })
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.profile_id, profileId),
            eq(schema.integrations.provider, "wahoo"),
          ),
        )
        .limit(1);

      return row ?? null;
    },

    async findWahooIntegrationByExternalId(externalId) {
      const [row] = await db
        .select({
          integrationId: schema.integrations.id,
          profileId: schema.integrations.profile_id,
        })
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.provider, "wahoo"),
            eq(schema.integrations.external_id, externalId),
          ),
        )
        .limit(1);

      return row ?? null;
    },

    async findImportedActivityByExternalId(externalId) {
      const [row] = await db
        .select({ id: schema.activities.id })
        .from(schema.activities)
        .where(
          and(
            eq(schema.activities.provider, "wahoo"),
            eq(schema.activities.external_id, externalId),
          ),
        )
        .limit(1);

      return row ?? null;
    },

    async findLinkedPlannedEventId({ profileId, externalWorkoutId }) {
      const [row] = await db
        .select({ eventId: schema.integrationResourceLinks.internal_resource_id })
        .from(schema.integrationResourceLinks)
        .where(
          and(
            eq(schema.integrationResourceLinks.provider, "wahoo"),
            eq(schema.integrationResourceLinks.external_id, externalWorkoutId),
            eq(schema.integrationResourceLinks.profile_id, profileId),
            eq(schema.integrationResourceLinks.resource_kind, "event"),
          ),
        )
        .limit(1);

      return row?.eventId ?? null;
    },

    async getEventActivityPlanId({ eventId, profileId }) {
      const [row] = await db
        .select({ activityPlanId: schema.events.activity_plan_id })
        .from(schema.events)
        .where(
          and(
            eq(schema.events.id, eventId),
            eq(schema.events.event_type, "planned_activity"),
            eq(schema.events.profile_id, profileId),
          ),
        )
        .limit(1);

      return row?.activityPlanId ?? null;
    },

    async createImportedActivity(input) {
      const [row] = await db
        .insert(schema.activities)
        .values({
          id: randomUUID(),
          created_at: new Date(),
          updated_at: new Date(),
          is_private: false,
          profile_id: input.profileId,
          provider: input.provider,
          external_id: input.externalId,
          activity_plan_id: input.activityPlanId,
          started_at: new Date(input.startedAt),
          finished_at: new Date(input.finishedAt),
          type: input.type,
          name: input.name,
          distance_meters: input.distanceMeters,
          duration_seconds: input.durationSeconds,
          moving_seconds: input.movingSeconds,
          elevation_gain_meters: input.elevationGainMeters,
          calories: input.calories,
          avg_power: input.avgPower,
          normalized_power: input.normalizedPower,
          avg_heart_rate: input.avgHeartRate,
          avg_cadence: input.avgCadence,
          avg_speed_mps: input.avgSpeedMps,
          fit_file_path: input.fitFilePath,
          fit_file_size: input.fitFileSize,
        })
        .returning({ id: schema.activities.id });

      if (!row) {
        throw new Error("Failed to create imported Wahoo activity");
      }

      return row;
    },

    async getEventResourceLink({ eventId, profileId, provider }) {
      const [row] = await db
        .select({
          externalId: schema.integrationResourceLinks.external_id,
          id: schema.integrationResourceLinks.id,
          updatedAt: schema.integrationResourceLinks.updated_at,
        })
        .from(schema.integrationResourceLinks)
        .where(
          and(
            eq(schema.integrationResourceLinks.internal_resource_id, eventId),
            eq(schema.integrationResourceLinks.profile_id, profileId),
            eq(schema.integrationResourceLinks.provider, provider),
            eq(schema.integrationResourceLinks.resource_kind, "event"),
          ),
        )
        .limit(1);

      return row
        ? {
            ...row,
            updatedAt: toIsoString(row.updatedAt),
          }
        : null;
    },

    async getPlannedEventForSync({ eventId, profileId }) {
      const [row] = await db
        .select({
          id: schema.events.id,
          startsAt: schema.events.starts_at,
          activityPlan: {
            id: schema.activityPlans.id,
            name: schema.activityPlans.name,
            description: schema.activityPlans.description,
            activityCategory: schema.activityPlans.activity_category,
            structure: schema.activityPlans.structure,
            updatedAt: schema.activityPlans.updated_at,
            routeId: schema.activityPlans.route_id,
          },
        })
        .from(schema.events)
        .leftJoin(schema.activityPlans, eq(schema.events.activity_plan_id, schema.activityPlans.id))
        .where(
          and(
            eq(schema.events.id, eventId),
            eq(schema.events.profile_id, profileId),
            eq(schema.events.event_type, "planned_activity"),
          ),
        )
        .limit(1);

      if (!row) return null;

      return {
        id: row.id,
        startsAt: row.startsAt.toISOString(),
        activityPlan: row.activityPlan?.id
          ? {
              activityCategory: row.activityPlan.activityCategory,
              description: row.activityPlan.description,
              id: row.activityPlan.id,
              name: row.activityPlan.name,
              routeId: row.activityPlan.routeId,
              structure: row.activityPlan.structure,
              updatedAt: row.activityPlan.updatedAt.toISOString(),
            }
          : null,
      };
    },

    async getProfileSyncMetrics(profileId) {
      return { ftp: null, thresholdHr: null };
    },

    async getRouteForSync({ profileId, routeId }) {
      const [row] = await db
        .select({
          id: schema.activityRoutes.id,
          name: schema.activityRoutes.name,
          description: schema.activityRoutes.description,
          filePath: schema.activityRoutes.file_path,
          totalDistance: schema.activityRoutes.total_distance,
          totalAscent: schema.activityRoutes.total_ascent,
          totalDescent: schema.activityRoutes.total_descent,
        })
        .from(schema.activityRoutes)
        .where(
          and(
            eq(schema.activityRoutes.id, routeId),
            eq(schema.activityRoutes.profile_id, profileId),
          ),
        )
        .limit(1);

      if (!row || !row.filePath || row.totalDistance == null) return null;

      return {
        ...row,
        filePath: row.filePath,
        totalDistance: row.totalDistance,
      };
    },

    async listEventResourceLinks({ eventId, profileId }) {
      const rows = await db
        .select({
          externalId: schema.integrationResourceLinks.external_id,
          id: schema.integrationResourceLinks.id,
          provider: schema.integrationResourceLinks.provider,
          syncedAt: schema.integrationResourceLinks.synced_at,
          updatedAt: schema.integrationResourceLinks.updated_at,
        })
        .from(schema.integrationResourceLinks)
        .where(
          and(
            eq(schema.integrationResourceLinks.internal_resource_id, eventId),
            eq(schema.integrationResourceLinks.profile_id, profileId),
            eq(schema.integrationResourceLinks.resource_kind, "event"),
          ),
        );

      return rows.map((row) => ({
        externalId: row.externalId,
        id: row.id,
        provider: row.provider,
        syncedAt: toIsoString(row.syncedAt),
        updatedAt: toIsoString(row.updatedAt),
      }));
    },

    async updateEventResourceLink({ externalId, id, updatedAt }) {
      await db
        .update(schema.integrationResourceLinks)
        .set({
          ...(externalId ? { external_id: externalId } : {}),
          updated_at: new Date(updatedAt),
        })
        .where(eq(schema.integrationResourceLinks.id, id));
    },
  };
}
