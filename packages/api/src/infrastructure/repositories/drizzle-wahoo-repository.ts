import { randomUUID } from "node:crypto";
import {
  getActivityEffortThresholdEvidence,
  type ThresholdMetricSource,
} from "@repo/core/athlete-inputs";
import { schema } from "@repo/db";
import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import {
  decryptNullableProviderToken,
  decryptProviderToken,
  encryptProviderToken,
} from "../../lib/provider-token-crypto";
import type {
  CreateWahooRepositoryOptions,
  WahooEventResourceLinkGenerationGuard,
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

export function toWahooEventResourceProviderMetadata(
  value: unknown,
): WahooEventResourceProviderMetadata | null {
  if (!value || typeof value !== "object" || !("wahoo" in value)) return null;

  const wahoo = (value as Record<string, unknown>).wahoo;
  if (!wahoo || typeof wahoo !== "object") return null;

  const wahooValue = wahoo as Record<string, unknown>;
  const metadata: NonNullable<WahooEventResourceProviderMetadata["wahoo"]> = {};
  if (typeof wahooValue.planId === "number") metadata.planId = wahooValue.planId;
  if (typeof wahooValue.providerAccountExternalId === "string") {
    metadata.providerAccountExternalId = wahooValue.providerAccountExternalId;
  }
  if (typeof wahooValue.routeId === "number") metadata.routeId = wahooValue.routeId;
  if (typeof wahooValue.projectionHash === "string") {
    metadata.projectionHash = wahooValue.projectionHash;
  }
  if (typeof wahooValue.sourcePlanId === "string") {
    metadata.sourcePlanId = wahooValue.sourcePlanId;
  }
  if (typeof wahooValue.sourceRouteId === "string" || wahooValue.sourceRouteId === null) {
    metadata.sourceRouteId = wahooValue.sourceRouteId;
  }

  return Object.keys(metadata).length > 0 ? { wahoo: metadata } : null;
}

function thresholdMetricSource(source: string | null): ThresholdMetricSource {
  if (source === "manual") return "manual";
  if (source === "estimated") return "estimated";
  if (source === "derived" || source === "modeled") return "modeled";
  return "provider";
}

export function wahooActiveIntegrationGenerationPredicate(
  input: WahooEventResourceLinkGenerationGuard,
) {
  return and(
    eq(schema.integrations.id, input.integrationId),
    eq(schema.integrations.profile_id, input.profileId),
    eq(schema.integrations.provider, "wahoo"),
    eq(schema.integrations.lifecycle_status, "active"),
    eq(schema.integrations.generation, input.expectedIntegrationGeneration),
  );
}

export function wahooEventResourceLinkOwnershipPredicate(
  input: WahooEventResourceLinkGenerationGuard & { id: string },
) {
  return and(
    eq(schema.integrationResourceLinks.id, input.id),
    eq(schema.integrationResourceLinks.integration_id, input.integrationId),
    eq(schema.integrationResourceLinks.profile_id, input.profileId),
    eq(schema.integrationResourceLinks.provider, "wahoo"),
    eq(schema.integrationResourceLinks.resource_kind, "event"),
  );
}

export function wahooRouteResourceLinkOwnershipPredicate(
  input: WahooEventResourceLinkGenerationGuard & { id: string },
) {
  return and(
    eq(schema.integrationResourceLinks.id, input.id),
    eq(schema.integrationResourceLinks.integration_id, input.integrationId),
    eq(schema.integrationResourceLinks.profile_id, input.profileId),
    eq(schema.integrationResourceLinks.provider, "wahoo"),
    eq(schema.integrationResourceLinks.resource_kind, "activity_route"),
  );
}

export function wahooGroupEventRouteDeliveryResourceLinkOwnershipPredicate(
  input: WahooEventResourceLinkGenerationGuard & { id: string },
) {
  return and(
    eq(schema.integrationResourceLinks.id, input.id),
    eq(schema.integrationResourceLinks.integration_id, input.integrationId),
    eq(schema.integrationResourceLinks.profile_id, input.profileId),
    eq(schema.integrationResourceLinks.provider, "wahoo"),
    eq(schema.integrationResourceLinks.resource_kind, "group_event_route_delivery"),
  );
}

export function createWahooRepository({ db }: CreateWahooRepositoryOptions): WahooRepository {
  return {
    async createEventResourceLink(input) {
      await db.transaction(async (tx) => {
        const [active] = await tx
          .select({ id: schema.integrations.id })
          .from(schema.integrations)
          .where(wahooActiveIntegrationGenerationPredicate(input))
          .limit(1)
          .for("share");
        if (!active) throw new Error("integration_generation_inactive");

        const [ownedEvent] = await tx
          .select({ id: schema.events.id })
          .from(schema.events)
          .where(
            and(eq(schema.events.id, input.eventId), eq(schema.events.profile_id, input.profileId)),
          )
          .limit(1)
          .for("share");
        if (!ownedEvent) throw new Error("planned_activity_not_owned");

        await tx.insert(schema.integrationResourceLinks).values({
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
      });
    },

    async deleteEventResourceLink(input) {
      await db.transaction(async (tx) => {
        const [active] = await tx
          .select({ id: schema.integrations.id })
          .from(schema.integrations)
          .where(wahooActiveIntegrationGenerationPredicate(input))
          .limit(1)
          .for("share");
        if (!active) throw new Error("integration_generation_inactive");

        await tx
          .delete(schema.integrationResourceLinks)
          .where(wahooEventResourceLinkOwnershipPredicate(input));
      });
    },

    async createRouteResourceLink(input) {
      await db.transaction(async (tx) => {
        const [active] = await tx
          .select({ id: schema.integrations.id })
          .from(schema.integrations)
          .where(wahooActiveIntegrationGenerationPredicate(input))
          .limit(1)
          .for("share");
        if (!active) throw new Error("integration_generation_inactive");

        const [ownedRoute] = await tx
          .select({ id: schema.activityRoutes.id })
          .from(schema.activityRoutes)
          .where(
            and(
              eq(schema.activityRoutes.id, input.routeId),
              eq(schema.activityRoutes.profile_id, input.profileId),
            ),
          )
          .limit(1)
          .for("share");
        if (!ownedRoute) throw new Error("route_not_owned");

        await tx.insert(schema.integrationResourceLinks).values({
          created_at: new Date(),
          external_id: input.externalId,
          id: randomUUID(),
          integration_id: input.integrationId,
          internal_resource_id: input.routeId,
          payload_hash: input.payloadHash,
          profile_id: input.profileId,
          provider: "wahoo",
          provider_metadata: input.providerMetadata,
          provider_updated_at: new Date(input.providerUpdatedAt),
          resource_kind: "activity_route",
          synced_at: new Date(input.syncedAt),
          updated_at: new Date(input.syncedAt),
        });
      });
    },

    async createGroupEventRouteDeliveryResourceLink(input) {
      await db.transaction(async (tx) => {
        const [active] = await tx
          .select({ id: schema.integrations.id })
          .from(schema.integrations)
          .where(wahooActiveIntegrationGenerationPredicate(input))
          .limit(1)
          .for("share");
        if (!active) throw new Error("integration_generation_inactive");

        const [eligible] = await tx
          .select({ id: schema.groupEvents.id })
          .from(schema.groupEvents)
          .innerJoin(
            schema.activityRoutes,
            and(
              eq(schema.activityRoutes.id, schema.groupEvents.route_id),
              eq(schema.activityRoutes.id, input.sourceRouteId),
            ),
          )
          .innerJoin(
            schema.groupMemberships,
            and(
              eq(schema.groupMemberships.group_id, schema.groupEvents.group_id),
              eq(schema.groupMemberships.profile_id, input.profileId),
              eq(schema.groupMemberships.status, "active"),
            ),
          )
          .innerJoin(
            schema.groupEventRsvps,
            and(
              eq(schema.groupEventRsvps.group_event_id, schema.groupEvents.id),
              eq(schema.groupEventRsvps.profile_id, input.profileId),
              eq(schema.groupEventRsvps.status, "accepted"),
            ),
          )
          .innerJoin(
            schema.profileTrainingSettings,
            eq(schema.profileTrainingSettings.profile_id, input.profileId),
          )
          .where(
            and(
              eq(schema.groupEvents.id, input.eventId),
              sql<boolean>`exists (
                select 1 from ${schema.groups}
                where ${schema.groups.id} = ${schema.groupEvents.group_id}
                  and ${schema.groups.deleted_at} is null
              )`,
              isNull(schema.groupEvents.cancelled_at),
              gt(schema.groupEvents.starts_at, new Date()),
              sql<boolean>`coalesce(${schema.profileTrainingSettings.settings}->>'wahooEventRouteDeliveryEnabled', 'false') = 'true'`,
              or(
                eq(schema.activityRoutes.profile_id, input.profileId),
                eq(schema.activityRoutes.is_public, true),
                eq(schema.activityRoutes.is_system_template, true),
              ),
            ),
          )
          .limit(1)
          .for("share");
        if (!eligible) throw new Error("group_event_route_delivery_ineligible");

        await tx.insert(schema.integrationResourceLinks).values({
          id: randomUUID(),
          created_at: new Date(),
          external_id: input.externalId,
          integration_id: input.integrationId,
          internal_resource_id: input.eventId,
          payload_hash: input.payloadHash,
          profile_id: input.profileId,
          provider: "wahoo",
          provider_metadata: input.providerMetadata,
          provider_updated_at: new Date(input.providerUpdatedAt),
          resource_kind: "group_event_route_delivery",
          synced_at: new Date(input.syncedAt),
          updated_at: new Date(input.syncedAt),
        });
      });
    },

    async deleteRouteResourceLink(input) {
      await db.transaction(async (tx) => {
        const [active] = await tx
          .select({ id: schema.integrations.id })
          .from(schema.integrations)
          .where(wahooActiveIntegrationGenerationPredicate(input))
          .limit(1)
          .for("share");
        if (!active) throw new Error("integration_generation_inactive");
        await tx
          .delete(schema.integrationResourceLinks)
          .where(wahooRouteResourceLinkOwnershipPredicate(input));
      });
    },

    async deleteGroupEventRouteDeliveryResourceLink(input) {
      await db.transaction(async (tx) => {
        const [active] = await tx
          .select({ id: schema.integrations.id })
          .from(schema.integrations)
          .where(wahooActiveIntegrationGenerationPredicate(input))
          .limit(1)
          .for("share");
        if (!active) throw new Error("integration_generation_inactive");
        await tx
          .delete(schema.integrationResourceLinks)
          .where(
            and(
              wahooGroupEventRouteDeliveryResourceLinkOwnershipPredicate(input),
              eq(schema.integrationResourceLinks.internal_resource_id, input.eventId),
            ),
          );
      });
    },

    async findWahooIntegrationByProfileId(profileId) {
      const [row] = await db
        .select({
          accessToken: schema.integrationCredentials.access_token,
          expiresAt: schema.integrationCredentials.expires_at,
          externalId: schema.integrations.external_id,
          credentialGeneration: schema.integrationCredentials.generation,
          id: schema.integrations.id,
          integrationGeneration: schema.integrations.generation,
          lifecycleStatus: schema.integrations.lifecycle_status,
          profileId: schema.integrations.profile_id,
          reconnectRequiredAt: schema.integrationCredentials.reconnect_required_at,
          refreshToken: schema.integrationCredentials.refresh_token,
          scope: schema.integrationCredentials.scope,
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
            eq(schema.integrations.lifecycle_status, "active"),
          ),
        )
        .limit(1);

      if (!row) return null;

      const accessToken = decryptProviderToken(row.accessToken);
      const refreshToken = decryptNullableProviderToken(row.refreshToken);
      return {
        ...row,
        accessToken,
        refreshToken,
        expiresAt: toIsoString(row.expiresAt),
        reconnectRequiredAt: toIsoString(row.reconnectRequiredAt),
        credentialGeneration: row.credentialGeneration,
        lifecycleStatus: row.lifecycleStatus as "active" | "disconnect_pending" | "disconnected",
      };
    },

    async findWahooIntegrationByExternalId(externalId) {
      const rows = await db
        .select({
          integrationGeneration: schema.integrations.generation,
          integrationId: schema.integrations.id,
          profileId: schema.integrations.profile_id,
        })
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.provider, "wahoo"),
            eq(schema.integrations.external_id, externalId),
            eq(schema.integrations.lifecycle_status, "active"),
          ),
        )
        .limit(2);

      return rows.length === 1 ? (rows[0] ?? null) : null;
    },

    async findWahooIntegrationByIdAndGeneration({ integrationGeneration, integrationId }) {
      const [row] = await db
        .select({ profileId: schema.integrations.profile_id })
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrations.id, integrationId),
            eq(schema.integrations.generation, integrationGeneration),
            eq(schema.integrations.lifecycle_status, "active"),
            eq(schema.integrations.provider, "wahoo"),
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
      await db.transaction(async (tx) => {
        const [activeIntegration] = await tx
          .select({ id: schema.integrations.id })
          .from(schema.integrations)
          .where(
            and(
              eq(schema.integrations.id, input.integrationId),
              eq(schema.integrations.profile_id, input.profileId),
              eq(schema.integrations.provider, "wahoo"),
              eq(schema.integrations.lifecycle_status, "active"),
              eq(schema.integrations.generation, input.integrationGeneration),
            ),
          )
          .limit(1)
          .for("share");
        if (!activeIntegration) throw new Error("integration_generation_inactive");
        await tx
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
            description: row.activityPlan.description,
            id: row.activityPlan.id,
            name: row.activityPlan.name,
            structure: row.activityPlan.structure,
            updatedAt: row.activityPlan.updatedAt.toISOString(),
          }
        : null;

      return {
        id: row.id,
        routeId: row.routeId,
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
                activity_category: schema.activitySegments.activity_category,
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
        if (!segment.activity_category) continue;
        const activity_categories = linkedLthrCategories.get(segment.id) ?? new Set<string>();
        activity_categories.add(segment.activity_category);
        linkedLthrCategories.set(segment.id, activity_categories);
      }
      const linkedLthrActivityCategory = new Map<string, string>();
      for (const [activityId, activity_categories] of linkedLthrCategories) {
        if (activity_categories.size !== 1) continue;
        const activity_category = activity_categories.values().next().value;
        if (activity_category) linkedLthrActivityCategory.set(activityId, activity_category);
      }

      const resolvedMetrics = resolveLatestObservationsByKey(metricRows, (row) => {
        if (row.type !== "lthr") return row.type;
        if (row.source === "manual" || !row.referenceActivityId) return "lthr:generic";
        const activity_category = linkedLthrActivityCategory.get(row.referenceActivityId);
        return activity_category === "bike" ||
          activity_category === "run" ||
          activity_category === "swim"
          ? `lthr:${activity_category}`
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
        thresholdHrByActivityCategory: {
          bike: latest.get("lthr:bike"),
          run: latest.get("lthr:run"),
          swim: latest.get("lthr:swim"),
        },
      };
    },

    async getOwnedRouteForMirror({ profileId, routeId }) {
      const [row] = await db
        .select({
          description: schema.activityRoutes.description,
          filePath: schema.activityRoutes.file_path,
          id: schema.activityRoutes.id,
          name: schema.activityRoutes.name,
          totalAscent: schema.activityRoutes.total_ascent,
          totalDescent: schema.activityRoutes.total_descent,
          totalDistance: schema.activityRoutes.total_distance,
          updatedAt: schema.activityRoutes.updated_at,
        })
        .from(schema.activityRoutes)
        .where(
          and(
            eq(schema.activityRoutes.id, routeId),
            eq(schema.activityRoutes.profile_id, profileId),
            eq(schema.activityRoutes.is_system_template, false),
          ),
        )
        .limit(1);
      return row ? { ...row, updatedAt: row.updatedAt.toISOString() } : null;
    },

    async getGroupEventRouteForDelivery({ groupEventId, profileId, sourceRouteId }) {
      const [row] = await db
        .select({
          description: schema.activityRoutes.description,
          filePath: schema.activityRoutes.file_path,
          id: schema.activityRoutes.id,
          name: schema.activityRoutes.name,
          totalAscent: schema.activityRoutes.total_ascent,
          totalDescent: schema.activityRoutes.total_descent,
          totalDistance: schema.activityRoutes.total_distance,
          updatedAt: schema.activityRoutes.updated_at,
        })
        .from(schema.groupEvents)
        .innerJoin(
          schema.activityRoutes,
          and(
            eq(schema.activityRoutes.id, schema.groupEvents.route_id),
            eq(schema.activityRoutes.id, sourceRouteId),
          ),
        )
        .innerJoin(
          schema.groupMemberships,
          and(
            eq(schema.groupMemberships.group_id, schema.groupEvents.group_id),
            eq(schema.groupMemberships.profile_id, profileId),
            eq(schema.groupMemberships.status, "active"),
          ),
        )
        .innerJoin(
          schema.groupEventRsvps,
          and(
            eq(schema.groupEventRsvps.group_event_id, schema.groupEvents.id),
            eq(schema.groupEventRsvps.profile_id, profileId),
            eq(schema.groupEventRsvps.status, "accepted"),
          ),
        )
        .innerJoin(
          schema.profileTrainingSettings,
          eq(schema.profileTrainingSettings.profile_id, profileId),
        )
        .where(
          and(
            eq(schema.groupEvents.id, groupEventId),
            sql<boolean>`exists (
              select 1 from ${schema.groups}
              where ${schema.groups.id} = ${schema.groupEvents.group_id}
                and ${schema.groups.deleted_at} is null
            )`,
            isNull(schema.groupEvents.cancelled_at),
            gt(schema.groupEvents.starts_at, new Date()),
            sql<boolean>`coalesce(${schema.profileTrainingSettings.settings}->>'wahooEventRouteDeliveryEnabled', 'false') = 'true'`,
            or(
              eq(schema.activityRoutes.profile_id, profileId),
              eq(schema.activityRoutes.is_public, true),
              eq(schema.activityRoutes.is_system_template, true),
            ),
          ),
        )
        .limit(1);

      return row?.filePath && row.totalDistance !== null
        ? {
            ...row,
            filePath: row.filePath,
            totalDistance: row.totalDistance,
            updatedAt: row.updatedAt.toISOString(),
          }
        : null;
    },

    async listEligibleGroupEventRouteDeliveries({ after, limit, profileId }) {
      const rows = await db
        .select({
          eventId: schema.groupEvents.id,
          eventUpdatedAt: schema.groupEvents.updated_at,
          routeUpdatedAt: schema.activityRoutes.updated_at,
          sourceRouteId: schema.activityRoutes.id,
          startsAt: schema.groupEvents.starts_at,
        })
        .from(schema.groupEvents)
        .innerJoin(schema.activityRoutes, eq(schema.activityRoutes.id, schema.groupEvents.route_id))
        .innerJoin(
          schema.groupMemberships,
          and(
            eq(schema.groupMemberships.group_id, schema.groupEvents.group_id),
            eq(schema.groupMemberships.profile_id, profileId),
            eq(schema.groupMemberships.status, "active"),
          ),
        )
        .innerJoin(
          schema.groupEventRsvps,
          and(
            eq(schema.groupEventRsvps.group_event_id, schema.groupEvents.id),
            eq(schema.groupEventRsvps.profile_id, profileId),
            eq(schema.groupEventRsvps.status, "accepted"),
          ),
        )
        .innerJoin(
          schema.profileTrainingSettings,
          eq(schema.profileTrainingSettings.profile_id, profileId),
        )
        .where(
          and(
            isNull(schema.groupEvents.series_id),
            isNull(schema.groupEvents.recurrence_rule),
            sql<boolean>`exists (
              select 1 from ${schema.groups}
              where ${schema.groups.id} = ${schema.groupEvents.group_id}
                and ${schema.groups.deleted_at} is null
            )`,
            isNull(schema.groupEvents.cancelled_at),
            gt(schema.groupEvents.starts_at, new Date()),
            after
              ? or(
                  gt(schema.groupEvents.starts_at, new Date(after.startsAt)),
                  and(
                    eq(schema.groupEvents.starts_at, new Date(after.startsAt)),
                    gt(schema.groupEvents.id, after.eventId),
                  ),
                )
              : undefined,
            sql<boolean>`coalesce(${schema.profileTrainingSettings.settings}->>'wahooEventRouteDeliveryEnabled', 'false') = 'true'`,
            or(
              eq(schema.activityRoutes.profile_id, profileId),
              eq(schema.activityRoutes.is_public, true),
              eq(schema.activityRoutes.is_system_template, true),
            ),
          ),
        )
        .orderBy(asc(schema.groupEvents.starts_at), asc(schema.groupEvents.id))
        .limit(limit);

      return rows.map((row) => ({
        eventId: row.eventId,
        eventUpdatedAt: row.eventUpdatedAt.toISOString(),
        routeUpdatedAt: row.routeUpdatedAt.toISOString(),
        sourceRouteId: row.sourceRouteId,
        startsAt: row.startsAt.toISOString(),
      }));
    },

    async listGroupEventRouteDeliveryResourceLinks({ afterEventId, limit, profileId }) {
      const rows = await db
        .select({
          eventId: schema.integrationResourceLinks.internal_resource_id,
          providerMetadata: schema.integrationResourceLinks.provider_metadata,
        })
        .from(schema.integrationResourceLinks)
        .where(
          and(
            eq(schema.integrationResourceLinks.profile_id, profileId),
            eq(schema.integrationResourceLinks.provider, "wahoo"),
            eq(schema.integrationResourceLinks.resource_kind, "group_event_route_delivery"),
            afterEventId
              ? gt(schema.integrationResourceLinks.internal_resource_id, afterEventId)
              : undefined,
          ),
        )
        .orderBy(asc(schema.integrationResourceLinks.internal_resource_id))
        .limit(limit);
      return rows.map((row) => ({
        eventId: row.eventId,
        sourceRouteId:
          toWahooEventResourceProviderMetadata(row.providerMetadata)?.wahoo?.sourceRouteId ?? null,
      }));
    },

    async isWahooPlanReferencedByOtherEvent({ excludeLinkId, integrationId, planId, profileId }) {
      const [row] = await db
        .select({ id: schema.integrationResourceLinks.id })
        .from(schema.integrationResourceLinks)
        .where(
          and(
            eq(schema.integrationResourceLinks.integration_id, integrationId),
            eq(schema.integrationResourceLinks.profile_id, profileId),
            eq(schema.integrationResourceLinks.provider, "wahoo"),
            eq(schema.integrationResourceLinks.resource_kind, "event"),
            ne(schema.integrationResourceLinks.id, excludeLinkId),
            sql`${schema.integrationResourceLinks.provider_metadata} -> 'wahoo' ->> 'planId' = ${String(planId)}`,
          ),
        )
        .limit(1);
      return Boolean(row);
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

    async getRouteResourceLink({ profileId, provider, routeId }) {
      const [row] = await db
        .select({
          externalId: schema.integrationResourceLinks.external_id,
          id: schema.integrationResourceLinks.id,
          integrationId: schema.integrationResourceLinks.integration_id,
          payloadHash: schema.integrationResourceLinks.payload_hash,
          providerMetadata: schema.integrationResourceLinks.provider_metadata,
          providerUpdatedAt: schema.integrationResourceLinks.provider_updated_at,
          updatedAt: schema.integrationResourceLinks.updated_at,
        })
        .from(schema.integrationResourceLinks)
        .where(
          and(
            eq(schema.integrationResourceLinks.internal_resource_id, routeId),
            eq(schema.integrationResourceLinks.profile_id, profileId),
            eq(schema.integrationResourceLinks.provider, provider),
            eq(schema.integrationResourceLinks.resource_kind, "activity_route"),
          ),
        )
        .limit(1);
      return row
        ? {
            ...row,
            providerMetadata: toWahooEventResourceProviderMetadata(row.providerMetadata),
            providerUpdatedAt: toIsoString(row.providerUpdatedAt),
            updatedAt: toIsoString(row.updatedAt),
          }
        : null;
    },

    async getGroupEventRouteDeliveryResourceLink({ eventId, profileId, provider }) {
      const [row] = await db
        .select({
          externalId: schema.integrationResourceLinks.external_id,
          id: schema.integrationResourceLinks.id,
          integrationId: schema.integrationResourceLinks.integration_id,
          payloadHash: schema.integrationResourceLinks.payload_hash,
          providerMetadata: schema.integrationResourceLinks.provider_metadata,
          providerUpdatedAt: schema.integrationResourceLinks.provider_updated_at,
          updatedAt: schema.integrationResourceLinks.updated_at,
        })
        .from(schema.integrationResourceLinks)
        .where(
          and(
            eq(schema.integrationResourceLinks.internal_resource_id, eventId),
            eq(schema.integrationResourceLinks.profile_id, profileId),
            eq(schema.integrationResourceLinks.provider, provider),
            eq(schema.integrationResourceLinks.resource_kind, "group_event_route_delivery"),
          ),
        )
        .limit(1);
      return row
        ? {
            ...row,
            providerMetadata: toWahooEventResourceProviderMetadata(row.providerMetadata),
            providerUpdatedAt: toIsoString(row.providerUpdatedAt),
            updatedAt: toIsoString(row.updatedAt),
          }
        : null;
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

    async listOwnedRoutesForMirror({ afterId, limit, profileId }) {
      const rows = await db
        .select({ id: schema.activityRoutes.id, updatedAt: schema.activityRoutes.updated_at })
        .from(schema.activityRoutes)
        .where(
          and(
            eq(schema.activityRoutes.profile_id, profileId),
            eq(schema.activityRoutes.is_system_template, false),
            ...(afterId ? [gt(schema.activityRoutes.id, afterId)] : []),
          ),
        )
        .orderBy(schema.activityRoutes.id)
        .limit(limit);
      return rows.map((row) => ({ id: row.id, updatedAt: row.updatedAt.toISOString() }));
    },

    async updateEventResourceLink(input) {
      const { externalId, id, providerMetadata, updatedAt } = input;
      await db.transaction(async (tx) => {
        const [active] = await tx
          .select({ id: schema.integrations.id })
          .from(schema.integrations)
          .where(wahooActiveIntegrationGenerationPredicate(input))
          .limit(1)
          .for("share");
        if (!active) throw new Error("integration_generation_inactive");

        const [updated] = await tx
          .update(schema.integrationResourceLinks)
          .set({
            ...(externalId ? { external_id: externalId } : {}),
            ...(providerMetadata !== undefined ? { provider_metadata: providerMetadata } : {}),
            updated_at: new Date(updatedAt),
          })
          .where(wahooEventResourceLinkOwnershipPredicate({ ...input, id }))
          .returning({ id: schema.integrationResourceLinks.id });
        if (!updated) throw new Error("event_resource_link_not_authoritative");
      });
    },

    async updateRouteResourceLink(input) {
      await db.transaction(async (tx) => {
        const [active] = await tx
          .select({ id: schema.integrations.id })
          .from(schema.integrations)
          .where(wahooActiveIntegrationGenerationPredicate(input))
          .limit(1)
          .for("share");
        if (!active) throw new Error("integration_generation_inactive");

        const [updated] = await tx
          .update(schema.integrationResourceLinks)
          .set({
            external_id: input.externalId,
            payload_hash: input.payloadHash,
            provider_metadata: input.providerMetadata,
            provider_updated_at: new Date(input.providerUpdatedAt),
            synced_at: new Date(input.syncedAt),
            updated_at: new Date(input.syncedAt),
          })
          .where(wahooRouteResourceLinkOwnershipPredicate(input))
          .returning({ id: schema.integrationResourceLinks.id });
        if (!updated) throw new Error("route_resource_link_not_authoritative");
      });
    },

    async updateGroupEventRouteDeliveryResourceLink(input) {
      await db.transaction(async (tx) => {
        const [active] = await tx
          .select({ id: schema.integrations.id })
          .from(schema.integrations)
          .where(wahooActiveIntegrationGenerationPredicate(input))
          .limit(1)
          .for("share");
        if (!active) throw new Error("integration_generation_inactive");

        const [updated] = await tx
          .update(schema.integrationResourceLinks)
          .set({
            external_id: input.externalId,
            payload_hash: input.payloadHash,
            provider_metadata: input.providerMetadata,
            provider_updated_at: new Date(input.providerUpdatedAt),
            synced_at: new Date(input.syncedAt),
            updated_at: new Date(input.syncedAt),
          })
          .where(
            and(
              wahooGroupEventRouteDeliveryResourceLinkOwnershipPredicate(input),
              eq(schema.integrationResourceLinks.internal_resource_id, input.eventId),
            ),
          )
          .returning({ id: schema.integrationResourceLinks.id });
        if (!updated) throw new Error("group_event_route_delivery_link_not_authoritative");
      });
    },

    async updateWahooIntegrationTokens({
      accessToken,
      expectedCredentialGeneration,
      expectedIntegrationGeneration,
      expiresAt,
      id,
      refreshToken,
    }) {
      const [updated] = await db
        .update(schema.integrationCredentials)
        .set({
          access_token: encryptProviderToken(accessToken),
          expires_at: expiresAt ? new Date(expiresAt) : null,
          generation: sql`${schema.integrationCredentials.generation} + 1`,
          reconnect_required_at: null,
          refresh_token: refreshToken === null ? null : encryptProviderToken(refreshToken),
          updated_at: new Date(),
        })
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrationCredentials.integration_id, id),
            eq(schema.integrationCredentials.generation, expectedCredentialGeneration),
            isNull(schema.integrationCredentials.reconnect_required_at),
            eq(schema.integrations.id, id),
            eq(schema.integrations.provider, "wahoo"),
            eq(schema.integrations.lifecycle_status, "active"),
            eq(schema.integrations.generation, expectedIntegrationGeneration),
          ),
        )
        .returning({ generation: schema.integrationCredentials.generation });
      return updated?.generation ?? null;
    },

    async markWahooReconnectRequired({
      expectedCredentialGeneration,
      expectedIntegrationGeneration,
      id,
    }) {
      const [updated] = await db
        .update(schema.integrationCredentials)
        .set({
          generation: sql`${schema.integrationCredentials.generation} + 1`,
          reconnect_required_at: new Date(),
          updated_at: new Date(),
        })
        .from(schema.integrations)
        .where(
          and(
            eq(schema.integrationCredentials.integration_id, id),
            eq(schema.integrationCredentials.generation, expectedCredentialGeneration),
            isNull(schema.integrationCredentials.reconnect_required_at),
            eq(schema.integrations.id, id),
            eq(schema.integrations.provider, "wahoo"),
            eq(schema.integrations.lifecycle_status, "active"),
            eq(schema.integrations.generation, expectedIntegrationGeneration),
          ),
        )
        .returning({ id: schema.integrationCredentials.integration_id });
      return Boolean(updated);
    },
  };
}
