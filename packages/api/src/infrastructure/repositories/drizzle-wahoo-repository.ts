import { randomUUID } from "node:crypto";
import type { ThresholdMetricSource } from "@repo/core/athlete-inputs";
import { schema } from "@repo/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import type {
  CreateWahooRepositoryOptions,
  WahooEventResourceProviderMetadata,
  WahooRepository,
} from "../../repositories";

function toIsoString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toWahooEventResourceProviderMetadata(
  value: unknown,
): WahooEventResourceProviderMetadata | null {
  if (!value || typeof value !== "object" || !("wahoo" in value)) return null;

  const wahoo = (value as Record<string, unknown>)["wahoo"];
  if (!wahoo || typeof wahoo !== "object") return null;

  const wahooValue = wahoo as Record<string, unknown>;
  const metadata: NonNullable<WahooEventResourceProviderMetadata["wahoo"]> = {};
  if (typeof wahooValue["planId"] === "number") metadata.planId = wahooValue["planId"];
  if (typeof wahooValue["routeId"] === "number") metadata.routeId = wahooValue["routeId"];

  return Object.keys(metadata).length > 0 ? { wahoo: metadata } : null;
}

function thresholdMetricSource(source: string | null): ThresholdMetricSource {
  if (source === "manual") return "manual";
  if (source === "estimated") return "estimated";
  if (source === "derived" || source === "modeled") return "modeled";
  return "provider";
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
        provider_metadata: input.providerMetadata ?? null,
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
          accessToken: schema.integrationCredentials.access_token,
          expiresAt: schema.integrationCredentials.expires_at,
          externalId: schema.integrations.external_id,
          id: schema.integrations.id,
          profileId: schema.integrations.profile_id,
          refreshToken: schema.integrationCredentials.refresh_token,
        })
        .from(schema.integrations)
        .innerJoin(
          schema.integrationCredentials,
          eq(schema.integrationCredentials.integration_id, schema.integrations.id),
        )
        .where(
          and(
            eq(schema.integrations.profile_id, profileId),
            eq(schema.integrations.provider, "wahoo"),
          ),
        )
        .limit(1);

      return row ? { ...row, expiresAt: toIsoString(row.expiresAt) } : null;
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

    async findImportedActivityLinkByExternalId({ externalId, integrationId }) {
      const [row] = await db
        .select({
          activityId: schema.integrationResourceLinks.internal_resource_id,
          linkId: schema.integrationResourceLinks.id,
        })
        .from(schema.integrationResourceLinks)
        .where(
          and(
            eq(schema.integrationResourceLinks.integration_id, integrationId),
            eq(schema.integrationResourceLinks.resource_kind, "activity"),
            eq(schema.integrationResourceLinks.external_id, externalId),
          ),
        )
        .limit(1);

      return row ?? null;
    },

    async findImportedActivityByProviderExternalId({ externalId, provider }) {
      const [row] = await db
        .select({
          activityId: schema.activityImports.activity_id,
          profileId: schema.activityImports.profile_id,
        })
        .from(schema.activityImports)
        .where(
          and(
            eq(schema.activityImports.provider, provider),
            eq(schema.activityImports.external_id, externalId),
          ),
        )
        .limit(1);

      return row ?? null;
    },

    async createImportedActivityResourceLink(input) {
      await db
        .insert(schema.integrationResourceLinks)
        .values({
          id: randomUUID(),
          created_at: new Date(),
          external_id: input.externalId,
          integration_id: input.integrationId,
          internal_resource_id: input.activityId,
          profile_id: input.profileId,
          provider: input.provider,
          provider_updated_at: input.providerUpdatedAt ? new Date(input.providerUpdatedAt) : null,
          resource_kind: "activity",
          synced_at: new Date(),
          updated_at: new Date(),
        })
        .onConflictDoNothing({
          target: [
            schema.integrationResourceLinks.integration_id,
            schema.integrationResourceLinks.resource_kind,
            schema.integrationResourceLinks.external_id,
          ],
        });
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
        .select({ activityPlanId: schema.eventScheduleLinks.activity_plan_id })
        .from(schema.events)
        .leftJoin(
          schema.eventScheduleLinks,
          eq(schema.events.id, schema.eventScheduleLinks.event_id),
        )
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

    async getEventResourceLink({ eventId, profileId, provider }) {
      const [row] = await db
        .select({
          externalId: schema.integrationResourceLinks.external_id,
          id: schema.integrationResourceLinks.id,
          providerMetadata: schema.integrationResourceLinks.provider_metadata,
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
            providerMetadata: toWahooEventResourceProviderMetadata(row.providerMetadata),
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
        .leftJoin(
          schema.eventScheduleLinks,
          eq(schema.events.id, schema.eventScheduleLinks.event_id),
        )
        .leftJoin(
          schema.activityPlans,
          eq(schema.eventScheduleLinks.activity_plan_id, schema.activityPlans.id),
        )
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
      const [metricRows, bikePowerEfforts] = await Promise.all([
        db
          .select({
            recordedAt: schema.profileMetrics.recorded_at,
            source: schema.profileMetrics.source,
            type: schema.profileMetrics.metric_type,
            value: schema.profileMetrics.value,
          })
          .from(schema.profileMetrics)
          .where(
            and(
              eq(schema.profileMetrics.profile_id, profileId),
              inArray(schema.profileMetrics.metric_type, ["ftp", "lthr", "max_hr"]),
            ),
          )
          .orderBy(desc(schema.profileMetrics.recorded_at)),
        db
          .select({
            activityId: schema.activityEfforts.activity_id,
            observedAt: schema.activityEfforts.recorded_at,
            source: schema.activityEfforts.source,
            value: schema.activityEfforts.value,
          })
          .from(schema.activityEfforts)
          .where(
            and(
              eq(schema.activityEfforts.profile_id, profileId),
              eq(schema.activityEfforts.activity_category, "bike"),
              eq(schema.activityEfforts.effort_type, "power"),
              eq(schema.activityEfforts.duration_seconds, 1200),
            ),
          )
          .orderBy(desc(schema.activityEfforts.recorded_at)),
      ]);

      const latest = new Map<string, number>();
      for (const row of metricRows) {
        if (!latest.has(row.type)) latest.set(row.type, row.value);
      }

      return {
        bikePowerEfforts: bikePowerEfforts.map((effort) => ({
          observationKind:
            effort.activityId !== null &&
            effort.source !== "derived" &&
            effort.source !== "estimated"
              ? "actual"
              : "derived",
          observedAt: effort.observedAt.toISOString(),
          value: effort.value,
        })),
        ftpMetrics: metricRows
          .filter((metric) => metric.type === "ftp")
          .map((metric) => ({
            observedAt: metric.recordedAt.toISOString(),
            source: thresholdMetricSource(metric.source),
            value: metric.value,
          })),
        maxHr: latest.get("max_hr") ?? null,
        thresholdHr: latest.get("lthr") ?? null,
      };
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

    async updateEventResourceLink({ externalId, id, providerMetadata, updatedAt }) {
      await db
        .update(schema.integrationResourceLinks)
        .set({
          ...(externalId ? { external_id: externalId } : {}),
          ...(providerMetadata !== undefined ? { provider_metadata: providerMetadata } : {}),
          updated_at: new Date(updatedAt),
        })
        .where(eq(schema.integrationResourceLinks.id, id));
    },

    async updateWahooIntegrationTokens({ accessToken, expiresAt, id, refreshToken }) {
      await db
        .insert(schema.integrationCredentials)
        .values({
          access_token: accessToken,
          expires_at: expiresAt ? new Date(expiresAt) : null,
          integration_id: id,
          refresh_token: refreshToken,
          updated_at: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.integrationCredentials.integration_id,
          set: {
            access_token: accessToken,
            expires_at: expiresAt ? new Date(expiresAt) : null,
            refresh_token: refreshToken,
            updated_at: new Date(),
          },
        });

      await db
        .update(schema.integrations)
        .set({ updated_at: new Date() })
        .where(and(eq(schema.integrations.id, id), eq(schema.integrations.provider, "wahoo")));
    },
  };
}
