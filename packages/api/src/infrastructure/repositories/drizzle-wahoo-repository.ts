import { randomUUID } from "node:crypto";
import { compileActivityPlanV3 } from "@repo/core";
import {
  getActivityEffortThresholdEvidence,
  type ThresholdMetricSource,
} from "@repo/core/athlete-inputs";
import { schema } from "@repo/db";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  decryptNullableProviderToken,
  decryptProviderToken,
  encryptProviderToken,
  hasProviderTokenEncryptionKey,
  isEncryptedProviderToken,
} from "../../lib/provider-token-crypto";
import type {
  CreateWahooRepositoryOptions,
  WahooEventResourceProviderMetadata,
  WahooRepository,
} from "../../repositories";
import {
  filterSupersededProfileOverrides,
  isActiveManualFtpOverride,
  resolveLatestObservationsByKey,
} from "../../utils/profile-override-observations";

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
  const metadata: NonNullable<WahooEventResourceProviderMetadata["wahoo"]> & {
    sourcePlanId?: string;
    sourceRouteId?: string | null;
  } = {};
  if (typeof wahooValue["planId"] === "number") metadata.planId = wahooValue["planId"];
  if (typeof wahooValue["routeId"] === "number") metadata.routeId = wahooValue["routeId"];
  if (typeof wahooValue["sourcePlanId"] === "string") {
    metadata.sourcePlanId = wahooValue["sourcePlanId"];
  }
  if (typeof wahooValue["sourceRouteId"] === "string" || wahooValue["sourceRouteId"] === null) {
    metadata.sourceRouteId = wahooValue["sourceRouteId"];
  }

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

      if (!row) return null;

      const accessToken = decryptProviderToken(row.accessToken);
      const refreshToken = decryptNullableProviderToken(row.refreshToken);
      const hasLegacyCredential =
        !isEncryptedProviderToken(row.accessToken) ||
        (row.refreshToken !== null && !isEncryptedProviderToken(row.refreshToken));

      if (hasLegacyCredential && hasProviderTokenEncryptionKey()) {
        await db
          .update(schema.integrationCredentials)
          .set({
            access_token: encryptProviderToken(accessToken),
            refresh_token: refreshToken === null ? null : encryptProviderToken(refreshToken),
            updated_at: new Date(),
          })
          .where(
            and(
              eq(schema.integrationCredentials.integration_id, row.id),
              eq(schema.integrationCredentials.access_token, row.accessToken),
              row.refreshToken === null
                ? isNull(schema.integrationCredentials.refresh_token)
                : eq(schema.integrationCredentials.refresh_token, row.refreshToken),
            ),
          );
      }

      return {
        ...row,
        accessToken,
        refreshToken,
        expiresAt: toIsoString(row.expiresAt),
      };
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
          profileId: schema.activities.profile_id,
          activityFilePath: schema.activityArtifacts.path,
          activityFileSize: schema.activityArtifacts.byte_size,
          analysisReady: sql<boolean>`exists (
            select 1 from ${schema.activityFileIngestions}
            where ${schema.activityFileIngestions.activity_id} = ${schema.integrationResourceLinks.internal_resource_id}
              and ${schema.activityFileIngestions.source} = 'provider_sync'
              and ${schema.activityFileIngestions.status} = 'ready'
          )`,
        })
        .from(schema.integrationResourceLinks)
        .innerJoin(
          schema.activities,
          eq(schema.activities.id, schema.integrationResourceLinks.internal_resource_id),
        )
        .leftJoin(
          schema.activityArtifactLinks,
          and(
            eq(schema.activityArtifactLinks.activity_id, schema.activities.id),
            eq(schema.activityArtifactLinks.profile_id, schema.activities.profile_id),
            eq(schema.activityArtifactLinks.role, "source"),
            eq(schema.activityArtifactLinks.is_current, true),
          ),
        )
        .leftJoin(
          schema.activityArtifacts,
          and(
            eq(schema.activityArtifacts.id, schema.activityArtifactLinks.artifact_id),
            eq(schema.activityArtifacts.profile_id, schema.activities.profile_id),
            eq(schema.activityArtifacts.availability, "accepted"),
          ),
        )
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
          activityId: schema.activities.id,
          profileId: schema.activities.profile_id,
          activityFilePath: schema.activityArtifacts.path,
          activityFileSize: schema.activityArtifacts.byte_size,
          analysisReady: sql<boolean>`exists (
            select 1 from ${schema.activityFileIngestions}
            where ${schema.activityFileIngestions.activity_id} = ${schema.activities.id}
              and ${schema.activityFileIngestions.source} = 'provider_sync'
              and ${schema.activityFileIngestions.status} = 'ready'
          )`,
        })
        .from(schema.activities)
        .leftJoin(
          schema.activityArtifactLinks,
          and(
            eq(schema.activityArtifactLinks.activity_id, schema.activities.id),
            eq(schema.activityArtifactLinks.profile_id, schema.activities.profile_id),
            eq(schema.activityArtifactLinks.role, "source"),
            eq(schema.activityArtifactLinks.is_current, true),
          ),
        )
        .leftJoin(
          schema.activityArtifacts,
          and(
            eq(schema.activityArtifacts.id, schema.activityArtifactLinks.artifact_id),
            eq(schema.activityArtifacts.profile_id, schema.activities.profile_id),
            eq(schema.activityArtifacts.availability, "accepted"),
          ),
        )
        .where(
          and(
            eq(schema.activities.provider, provider),
            eq(schema.activities.external_id, externalId),
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
        .select({ activityPlanId: schema.events.activity_plan_id })
        .from(schema.events)

        .where(
          and(
            eq(schema.events.id, eventId),
            eq(schema.events.event_type, "planned"),
            eq(schema.events.profile_id, profileId),
          ),
        )
        .limit(1);

      return row?.activityPlanId ?? null;
    },

    async getEventResourceLink({ eventId, forUpdate, profileId, provider }) {
      const query = db
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
        );
      const [row] = await (forUpdate ? query.for("update").limit(1) : query.limit(1));

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
            structure: schema.activityPlans.structure,
            updatedAt: schema.activityPlans.updated_at,
          },
          routeId: schema.events.route_id,
        })
        .from(schema.events)

        .leftJoin(schema.activityPlans, eq(schema.events.activity_plan_id, schema.activityPlans.id))
        .where(
          and(
            eq(schema.events.id, eventId),
            eq(schema.events.profile_id, profileId),
            eq(schema.events.event_type, "planned"),
          ),
        )
        .limit(1);

      if (!row) return null;

      const activityPlan = row.activityPlan?.id
        ? {
            activityCategory: compileActivityPlanV3(row.activityPlan.structure).primaryCategory,
            description: row.activityPlan.description,
            id: row.activityPlan.id,
            name: row.activityPlan.name,
            routeId: row.routeId,
            structure: row.activityPlan.structure,
            updatedAt: row.activityPlan.updatedAt.toISOString(),
          }
        : null;

      return {
        id: row.id,
        startsAt: row.startsAt.toISOString(),
        activityPlan,
      };
    },

    async getProfileSyncMetrics(profileId) {
      const [metricRows, bikePowerEfforts] = await Promise.all([
        db
          .select({
            id: schema.profileMetrics.id,
            referenceActivityId: schema.profileMetrics.reference_activity_id,
            recordedAt: schema.profileMetrics.recorded_at,
            source: schema.profileMetrics.source,
            type: schema.profileMetrics.metric_type,
            value: schema.profileMetrics.value,
            method: schema.profileMetrics.method,
            provenance: schema.profileMetrics.provenance,
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
            id: schema.activityEfforts.id,
            activityId: schema.activityEfforts.activity_id,
            observedAt: schema.activityEfforts.recorded_at,
            source: schema.activityEfforts.source,
            value: schema.activityEfforts.value,
            unit: schema.activityEfforts.unit,
            method: schema.activityEfforts.method,
            provenance: schema.activityEfforts.provenance,
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
          .orderBy(desc(schema.activityEfforts.recorded_at), desc(schema.activityEfforts.id)),
      ]);

      const linkedLthrActivityIds = metricRows.flatMap((metric) =>
        metric.type === "lthr" && metric.source !== "manual" && metric.referenceActivityId
          ? [metric.referenceActivityId]
          : [],
      );
      const linkedLthrActivities =
        linkedLthrActivityIds.length === 0
          ? []
          : await db
              .select({
                id: schema.activitySegments.activity_id,
                category: schema.activitySegments.category,
              })
              .from(schema.activitySegments)
              .where(
                and(
                  inArray(schema.activitySegments.activity_id, linkedLthrActivityIds),
                  eq(schema.activitySegments.role, "activity"),
                ),
              );
      const linkedLthrCategories = new Map<string, Set<string>>();
      for (const segment of linkedLthrActivities) {
        if (!segment.category) continue;
        const categories = linkedLthrCategories.get(segment.id) ?? new Set<string>();
        categories.add(segment.category);
        linkedLthrCategories.set(segment.id, categories);
      }
      const linkedLthrSport = new Map<string, string>();
      for (const [activityId, categories] of linkedLthrCategories) {
        if (categories.size !== 1) continue;
        const category = categories.values().next().value;
        if (category) linkedLthrSport.set(activityId, category);
      }

      const resolvedMetrics = resolveLatestObservationsByKey(metricRows, (row) => {
        if (row.type !== "lthr") return row.type;
        if (row.source === "manual" || !row.referenceActivityId) return "lthr:generic";
        const sport = linkedLthrSport.get(row.referenceActivityId);
        return sport === "bike" || sport === "run" || sport === "swim"
          ? `lthr:${sport}`
          : `lthr:unclassified:${row.referenceActivityId}`;
      });
      const latest = new Map<string, number>();
      for (const [type, row] of resolvedMetrics) if (row) latest.set(type, row.value);
      const currentMetricRows = [...resolvedMetrics.values()].filter((row) => row !== null);
      const currentBikePowerEfforts = filterSupersededProfileOverrides(
        bikePowerEfforts,
        (effort) => `bike:power:1200:${effort.unit}`,
      );
      const isManualFtp = (effort: (typeof currentBikePowerEfforts)[number]) =>
        isActiveManualFtpOverride({
          ...effort,
          activity_id: effort.activityId,
          activity_category: "bike",
          duration_seconds: 1200,
          effort_type: "power",
        });
      const manualFtpEffort = currentBikePowerEfforts.find(isManualFtp);

      return {
        bikePowerEfforts: currentBikePowerEfforts
          .filter((effort) => !isManualFtp(effort))
          .map((effort) => ({
            observationKind:
              effort.activityId !== null &&
              effort.source !== "derived" &&
              effort.source !== "estimated"
                ? "actual"
                : "derived",
            observedAt: effort.observedAt.toISOString(),
            value: effort.value,
            evidence:
              getActivityEffortThresholdEvidence({
                activityCategory: "bike",
                activityId: effort.activityId,
                durationSeconds: 1200,
                effortType: "power",
                method: effort.method,
                provenance: effort.provenance,
                source: effort.source,
                unit: effort.unit,
                value: effort.value,
              }) ?? undefined,
          })),
        ftpMetrics: [
          ...currentMetricRows
            .filter((metric) => metric.type === "ftp")
            .map((metric) => ({
              observedAt: metric.recordedAt.toISOString(),
              source: thresholdMetricSource(metric.source),
              value: metric.value,
            })),
          ...(manualFtpEffort
            ? [
                {
                  observedAt: manualFtpEffort.observedAt.toISOString(),
                  source: "manual" as const,
                  value: manualFtpEffort.value * 0.95,
                },
              ]
            : []),
        ],
        maxHr: latest.get("max_hr") ?? null,
        thresholdHr: latest.get("lthr:generic") ?? null,
        thresholdHrBySport: {
          bike: latest.get("lthr:bike"),
          run: latest.get("lthr:run"),
          swim: latest.get("lthr:swim"),
        },
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
            or(
              eq(schema.activityRoutes.profile_id, profileId),
              eq(schema.activityRoutes.is_public, true),
              eq(schema.activityRoutes.is_system_template, true),
            ),
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
          access_token: encryptProviderToken(accessToken),
          expires_at: expiresAt ? new Date(expiresAt) : null,
          integration_id: id,
          refresh_token: refreshToken === null ? null : encryptProviderToken(refreshToken),
          updated_at: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.integrationCredentials.integration_id,
          set: {
            access_token: encryptProviderToken(accessToken),
            expires_at: expiresAt ? new Date(expiresAt) : null,
            refresh_token: refreshToken === null ? null : encryptProviderToken(refreshToken),
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
