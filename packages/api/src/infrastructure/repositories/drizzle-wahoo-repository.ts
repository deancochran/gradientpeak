import { randomUUID } from "node:crypto";
import { activityPlanStructureSchema } from "@repo/core/activity-plan";
import { schema } from "@repo/db";
import { and, asc, eq, gt, gte, isNull, lte, ne, or, sql } from "drizzle-orm";
import {
  decryptNullableProviderToken,
  decryptProviderToken,
  encryptProviderToken,
} from "../../lib/provider-token-crypto";
import type {
  CreateWahooRepositoryOptions,
  WahooEventResourceLinkGenerationGuard,
  WahooPlannedSessionResourceProviderMetadata,
  WahooRepository,
} from "../../repositories";
import { attachActivitySourceReference } from "../../repositories/activity-source-reference-repository";

function toIsoString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function toWahooPlannedSessionResourceProviderMetadata(
  value: unknown,
): WahooPlannedSessionResourceProviderMetadata | null {
  if (!value || typeof value !== "object" || !("wahoo" in value)) return null;

  const wahoo = (value as Record<string, unknown>).wahoo;
  if (!wahoo || typeof wahoo !== "object") return null;

  const wahooValue = wahoo as Record<string, unknown>;
  const metadata: NonNullable<WahooPlannedSessionResourceProviderMetadata["wahoo"]> = {};
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

/** @deprecated Generic-event delivery is disabled. */
export const toWahooEventResourceProviderMetadata = toWahooPlannedSessionResourceProviderMetadata;

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

export function wahooPlannedSessionResourceLinkOwnershipPredicate(
  input: WahooEventResourceLinkGenerationGuard & { id: string },
) {
  return and(
    eq(schema.integrationResourceLinks.id, input.id),
    eq(schema.integrationResourceLinks.integration_id, input.integrationId),
    eq(schema.integrationResourceLinks.profile_id, input.profileId),
    eq(schema.integrationResourceLinks.provider, "wahoo"),
    eq(schema.integrationResourceLinks.resource_kind, "planned_session"),
  );
}

/** @deprecated Generic-event delivery is disabled. */
export function wahooEventResourceLinkOwnershipPredicate(
  input: WahooEventResourceLinkGenerationGuard & { id: string },
) {
  return and(
    eq(schema.integrationResourceLinks.id, input.id),
    eq(schema.integrationResourceLinks.integration_id, input.integrationId),
    eq(schema.integrationResourceLinks.profile_id, input.profileId),
    eq(schema.integrationResourceLinks.provider, "wahoo"),
    eq(schema.integrationResourceLinks.resource_kind, "planned_session"),
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
    async applyProfileEnrichmentIfAbsent(input) {
      return db.transaction(async (tx) => {
        const [activeIntegration] = await tx
          .select({ id: schema.integrations.id })
          .from(schema.integrations)
          .where(
            wahooActiveIntegrationGenerationPredicate({
              expectedIntegrationGeneration: input.expectedIntegrationGeneration,
              integrationId: input.integrationId,
              profileId: input.profileId,
            }),
          )
          .limit(1)
          .for("share");
        if (!activeIntegration) throw new Error("integration_generation_inactive");

        const [profile] = await tx
          .select({ dob: schema.profiles.dob, gender: schema.profiles.gender })
          .from(schema.profiles)
          .where(eq(schema.profiles.id, input.profileId))
          .limit(1)
          .for("update");
        if (!profile) throw new Error("profile_not_found");

        const fieldsFilled: Array<"dob" | "gender" | "weight_kg"> = [];
        const fieldsKept: Array<"dob" | "gender" | "weight_kg"> = [];
        const profileUpdate: {
          dob?: Date;
          gender?: "male" | "female" | "other";
          updated_at?: Date;
        } = {};

        if (input.dob) {
          if (profile.dob === null) {
            profileUpdate.dob = input.dob;
            fieldsFilled.push("dob");
          } else {
            fieldsKept.push("dob");
          }
        }
        if (input.gender) {
          if (profile.gender === null) {
            profileUpdate.gender = input.gender;
            fieldsFilled.push("gender");
          } else {
            fieldsKept.push("gender");
          }
        }
        if (profileUpdate.dob || profileUpdate.gender) {
          profileUpdate.updated_at = new Date();
          await tx
            .update(schema.profiles)
            .set(profileUpdate)
            .where(eq(schema.profiles.id, input.profileId));
        }

        if (input.weightKg !== undefined) {
          const [existingWeight] = await tx
            .select({ id: schema.profileMetrics.id })
            .from(schema.profileMetrics)
            .where(
              and(
                eq(schema.profileMetrics.profile_id, input.profileId),
                eq(schema.profileMetrics.metric_type, "weight_kg"),
              ),
            )
            .limit(1);
          if (existingWeight) {
            fieldsKept.push("weight_kg");
          } else {
            const now = new Date();
            await tx.insert(schema.profileMetrics).values({
              id: randomUUID(),
              calculation_version: "wahoo-profile-enrichment-v1",
              created_at: now,
              method: "provider_profile_import",
              metric_type: "weight_kg",
              notes: "Imported from Wahoo",
              profile_id: input.profileId,
              provenance: {
                integration_generation: input.expectedIntegrationGeneration,
                integration_id: input.integrationId,
                provider: "wahoo",
              },
              recorded_at: now,
              source: "provider",
              unit: "kg",
              updated_at: now,
              value: input.weightKg,
            });
            fieldsFilled.push("weight_kg");
          }
        }

        return { fieldsFilled, fieldsKept };
      });
    },

    async createPlannedSessionResourceLink(input) {
      await db.transaction(async (tx) => {
        const [active] = await tx
          .select({ id: schema.integrations.id })
          .from(schema.integrations)
          .where(wahooActiveIntegrationGenerationPredicate(input))
          .limit(1)
          .for("share");
        if (!active) throw new Error("integration_generation_inactive");

        const [ownedSession] = await tx
          .select({ id: schema.plannedSessions.id })
          .from(schema.plannedSessions)
          .where(
            and(
              eq(schema.plannedSessions.id, input.plannedSessionId),
              eq(schema.plannedSessions.profile_id, input.profileId),
            ),
          )
          .limit(1)
          .for("share");
        if (!ownedSession) throw new Error("planned_session_not_owned");

        await tx.insert(schema.integrationResourceLinks).values({
          id: randomUUID(),
          created_at: new Date(),
          external_id: input.externalId,
          integration_id: input.integrationId,
          internal_resource_id: input.plannedSessionId,
          profile_id: input.profileId,
          provider: input.provider,
          provider_metadata: input.providerMetadata ?? null,
          resource_kind: "planned_session",
          synced_at: new Date(input.syncedAt),
          updated_at: new Date(input.updatedAt),
        });
      });
    },

    async createEventResourceLink(input) {
      await db.transaction(async (tx) => {
        const [active] = await tx
          .select({ id: schema.integrations.id })
          .from(schema.integrations)
          .where(wahooActiveIntegrationGenerationPredicate(input))
          .limit(1)
          .for("share");
        if (!active) throw new Error("integration_generation_inactive");
        const [ownedSession] = await tx
          .select({ id: schema.plannedSessions.id })
          .from(schema.plannedSessions)
          .where(
            and(
              eq(schema.plannedSessions.id, input.eventId),
              eq(schema.plannedSessions.profile_id, input.profileId),
            ),
          )
          .limit(1)
          .for("share");
        if (!ownedSession) throw new Error("planned_session_not_owned");
        await tx.insert(schema.integrationResourceLinks).values({
          id: randomUUID(),
          created_at: new Date(),
          external_id: input.externalId,
          integration_id: input.integrationId,
          internal_resource_id: input.eventId,
          profile_id: input.profileId,
          provider: input.provider,
          provider_metadata: input.providerMetadata ?? null,
          resource_kind: "planned_session",
          synced_at: new Date(input.syncedAt),
          updated_at: new Date(input.updatedAt),
        });
      });
    },

    async deletePlannedSessionResourceLink(input) {
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
          .where(wahooPlannedSessionResourceLinkOwnershipPredicate(input));
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
          .where(wahooPlannedSessionResourceLinkOwnershipPredicate(input));
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
          .select({
            id: schema.integrations.id,
            routeDeliveryEnabled: schema.integrations.wahoo_event_route_delivery_enabled,
          })
          .from(schema.integrations)
          .where(wahooActiveIntegrationGenerationPredicate(input))
          .limit(1)
          .for("share");
        if (!active) throw new Error("integration_generation_inactive");
        if (!active.routeDeliveryEnabled) throw new Error("group_event_route_delivery_disabled");

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
          .leftJoin(
            schema.groupEventRsvps,
            and(
              eq(schema.groupEventRsvps.group_event_id, schema.groupEvents.id),
              eq(schema.groupEventRsvps.profile_id, input.profileId),
            ),
          )
          .leftJoin(
            schema.groupEventSeriesRsvps,
            and(
              eq(schema.groupEventSeriesRsvps.group_event_series_id, schema.groupEvents.series_id),
              eq(schema.groupEventSeriesRsvps.profile_id, input.profileId),
            ),
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
              sql<boolean>`coalesce(${schema.groupEventRsvps.status}, ${schema.groupEventSeriesRsvps.status}, 'going') = 'going'`,
              gt(schema.groupEvents.starts_at, new Date()),
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

    async findImportedActivityByProviderExternalId({ externalId, profileId, provider }) {
      const [row] = await db
        .select({
          activityId: schema.activities.id,
          profileId: schema.activities.profile_id,
          activityFilePath: schema.activityArtifacts.path,
          activityFileSize: schema.activityArtifacts.byte_size,
          artifactId: schema.activityArtifacts.id,
          artifactSha256: schema.activityArtifacts.digest,
          providerRevision: schema.activitySourceReferences.provider_revision,
          materializerVersion: schema.activities.materializer_version,
          segmentsRevision: schema.activities.segments_revision,
          timingCoverage: schema.activities.timing_coverage,
          hasSwimSegment: sql<boolean>`exists (
            select 1 from ${schema.activitySegments}
            where ${schema.activitySegments.activity_id} = ${schema.activities.id}
              and ${schema.activitySegments.profile_id} = ${schema.activities.profile_id}
              and ${schema.activitySegments.role} = 'activity'
              and ${schema.activitySegments.activity_category} = 'swim'
          )`,
          analysisReady: sql<boolean>`exists (
            select 1 from ${schema.activityFileIngestions}
            where ${schema.activityFileIngestions.activity_id} = ${schema.activities.id}
              and ${schema.activityFileIngestions.source} = 'provider_sync'
              and ${schema.activityFileIngestions.status} = 'succeeded'
          )`,
        })
        .from(schema.activitySourceReferences)
        .innerJoin(
          schema.activities,
          and(
            eq(schema.activities.id, schema.activitySourceReferences.activity_id),
            eq(schema.activities.profile_id, schema.activitySourceReferences.profile_id),
          ),
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
            eq(schema.activitySourceReferences.profile_id, profileId),
            eq(schema.activitySourceReferences.provider, provider),
            eq(schema.activitySourceReferences.provider_external_id, externalId),
            eq(schema.activitySourceReferences.resolution_status, "confirmed"),
          ),
        )
        .limit(1);

      return row ?? null;
    },

    async enrichImportedActivitySourceReference(input) {
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
        const attached = await attachActivitySourceReference(tx, {
          profileId: input.profileId,
          activityId: input.activityId,
          integrationId: input.integrationId,
          provider: input.provider,
          providerExternalId: input.externalId,
          providerRevision: input.providerUpdatedAt,
          artifactSha256: input.artifactSha256,
          ...(input.importRunId === undefined ? {} : { importRunId: input.importRunId }),
          ...(input.originProvider === undefined ? {} : { originProvider: input.originProvider }),
          ...(input.originExternalId === undefined
            ? {}
            : { originExternalId: input.originExternalId }),
          ...(input.originTrust === undefined ? {} : { originTrust: input.originTrust }),
        });
        if (attached.activityId !== input.activityId)
          throw new Error("Provider activity source resolved to a different canonical activity");
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
            eq(schema.integrationResourceLinks.resource_kind, "planned_session"),
          ),
        )
        .limit(1);

      return row?.eventId ?? null;
    },

    // Compatibility for imported activity linking. The identifier is now a
    // planned-session ID and the activity-plan identity comes from its frozen manifest.
    async getEventActivityPlanId({ eventId, profileId }) {
      const [row] = await db
        .select({ manifest: schema.plannedSessions.resolution_manifest })
        .from(schema.plannedSessions)
        .where(
          and(
            eq(schema.plannedSessions.id, eventId),
            eq(schema.plannedSessions.profile_id, profileId),
          ),
        )
        .limit(1);
      return row?.manifest?.activity_plan_id ?? null;
    },

    async getPlannedSessionResourceLink({ plannedSessionId, forUpdate, profileId, provider }) {
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
            eq(schema.integrationResourceLinks.internal_resource_id, plannedSessionId),
            eq(schema.integrationResourceLinks.profile_id, profileId),
            eq(schema.integrationResourceLinks.provider, provider),
            eq(schema.integrationResourceLinks.resource_kind, "planned_session"),
          ),
        );
      const [row] = await (forUpdate ? query.for("update").limit(1) : query.limit(1));

      return row
        ? {
            ...row,
            providerMetadata: toWahooPlannedSessionResourceProviderMetadata(row.providerMetadata),
            updatedAt: toIsoString(row.updatedAt),
          }
        : null;
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
            eq(schema.integrationResourceLinks.resource_kind, "planned_session"),
          ),
        );
      const [row] = await (forUpdate ? query.for("update").limit(1) : query.limit(1));
      return row
        ? {
            ...row,
            providerMetadata: toWahooPlannedSessionResourceProviderMetadata(row.providerMetadata),
            updatedAt: toIsoString(row.updatedAt),
          }
        : null;
    },

    async getPlannedSessionForSync({ plannedSessionId, profileId }) {
      const [row] = await db
        .select({
          id: schema.plannedSessions.id,
          planningDate: schema.plannedSessions.planning_date,
          timezone: schema.profiles.planning_timezone,
          manifest: schema.plannedSessions.resolution_manifest,
          capturedAt: schema.plannedSessions.prescription_captured_at,
        })
        .from(schema.plannedSessions)
        .innerJoin(schema.profiles, eq(schema.profiles.id, schema.plannedSessions.profile_id))
        .where(
          and(
            eq(schema.plannedSessions.id, plannedSessionId),
            eq(schema.plannedSessions.profile_id, profileId),
            eq(schema.plannedSessions.status, "scheduled"),
          ),
        )
        .limit(1);

      if (!row) return null;

      const manifest = row.manifest;
      if (!manifest) return null;

      return {
        id: row.id,
        plannedSessionId: row.id,
        planningDate: row.planningDate,
        timezone: row.timezone ?? "UTC",
        activityPlan: {
          description: null,
          id: manifest.activity_plan_id,
          name: "Planned activity",
          structure: activityPlanStructureSchema.parse(manifest.resolved_structure),
          updatedAt: row.capturedAt.toISOString(),
        },
      };
    },

    // Legacy adapter surface is intentionally backed by the immutable planned-session snapshot,
    // never an event or mutable activity-plan row. Generic event enqueue is disabled upstream.
    async getPlannedEventForSync({ eventId, profileId }) {
      const [row] = await db
        .select({
          id: schema.plannedSessions.id,
          planningDate: schema.plannedSessions.planning_date,
          timezone: schema.profiles.planning_timezone,
          manifest: schema.plannedSessions.resolution_manifest,
          capturedAt: schema.plannedSessions.prescription_captured_at,
        })
        .from(schema.plannedSessions)
        .innerJoin(schema.profiles, eq(schema.profiles.id, schema.plannedSessions.profile_id))
        .where(
          and(
            eq(schema.plannedSessions.id, eventId),
            eq(schema.plannedSessions.profile_id, profileId),
            eq(schema.plannedSessions.status, "scheduled"),
          ),
        )
        .limit(1);
      if (!row) return null;
      const manifest = row.manifest;
      if (!manifest) return null;
      return {
        id: row.id,
        startsAt: `${row.planningDate}T12:00:00.000Z`,
        timezone: row.timezone ?? "UTC",
        routeId: null,
        activityPlan: {
          description: null,
          id: manifest.activity_plan_id,
          name: "Planned activity",
          structure: activityPlanStructureSchema.parse(manifest.resolved_structure),
          updatedAt: row.capturedAt.toISOString(),
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
        .leftJoin(
          schema.groupEventRsvps,
          and(
            eq(schema.groupEventRsvps.group_event_id, schema.groupEvents.id),
            eq(schema.groupEventRsvps.profile_id, profileId),
          ),
        )
        .leftJoin(
          schema.groupEventSeriesRsvps,
          and(
            eq(schema.groupEventSeriesRsvps.group_event_series_id, schema.groupEvents.series_id),
            eq(schema.groupEventSeriesRsvps.profile_id, profileId),
          ),
        )
        .innerJoin(
          schema.integrations,
          and(
            eq(schema.integrations.profile_id, profileId),
            eq(schema.integrations.provider, "wahoo"),
            eq(schema.integrations.lifecycle_status, "active"),
            eq(schema.integrations.wahoo_event_route_delivery_enabled, true),
          ),
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
            sql<boolean>`coalesce(${schema.groupEventRsvps.status}, ${schema.groupEventSeriesRsvps.status}, 'going') = 'going'`,
            gt(schema.groupEvents.starts_at, new Date()),
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
        .leftJoin(
          schema.groupEventRsvps,
          and(
            eq(schema.groupEventRsvps.group_event_id, schema.groupEvents.id),
            eq(schema.groupEventRsvps.profile_id, profileId),
          ),
        )
        .leftJoin(
          schema.groupEventSeriesRsvps,
          and(
            eq(schema.groupEventSeriesRsvps.group_event_series_id, schema.groupEvents.series_id),
            eq(schema.groupEventSeriesRsvps.profile_id, profileId),
          ),
        )
        .innerJoin(
          schema.integrations,
          and(
            eq(schema.integrations.profile_id, profileId),
            eq(schema.integrations.provider, "wahoo"),
            eq(schema.integrations.lifecycle_status, "active"),
            eq(schema.integrations.wahoo_event_route_delivery_enabled, true),
          ),
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
            sql<boolean>`coalesce(${schema.groupEventRsvps.status}, ${schema.groupEventSeriesRsvps.status}, 'going') = 'going'`,
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
