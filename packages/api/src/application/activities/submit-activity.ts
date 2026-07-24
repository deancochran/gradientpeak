import { createHash, randomUUID } from "node:crypto";
import { activityLapRecordListSchema, type ContentVisibility } from "@repo/core";
import {
  type CompletedActivitySegmentSetV1,
  completedActivitySegmentSetSchemaV1,
} from "@repo/core/activity-segments";
import type { ActivityFileType } from "@repo/core/server/activity-files";
import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  type activityEfforts,
  activityFileIngestions,
  activitySegments,
  integrationResourceLinks,
} from "@repo/db";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { deriveNormalizedPowerCompatibilityProjection } from "../../lib/activity-analysis/activity-normalized-power";
import { ActivityFileIngestionClaimLostError } from "../activity-file-ingestion/ingestion-state";
import { reconcileGeneratedActivityEvidence } from "./reconcile-activity-evidence";

type DbClient = ReturnType<typeof getRequiredDb>;
type TransactionClient = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

export const DECODED_CONTRACT_VERSION = "decoded-activity-artifact-v1";
export const MATERIALIZER_VERSION = "activity-segments-v1";
export const SUBMISSION_PARSER_VERSION = "canonical-submission-v1";

export function providerProjectionDecision(input: {
  existingProviderUpdatedAt: Date | null;
  incomingProviderUpdatedAt: Date | null;
  existingDigest: string | null;
  incomingDigest: string;
  existingParserVersion: string | null;
  existingDecodedVersion: string | null;
  existingMaterializerVersion: string | null;
}): "apply" | "conflict" | "exact-redelivery" | "stale" {
  const versionMismatch =
    input.existingParserVersion !== SUBMISSION_PARSER_VERSION ||
    input.existingDecodedVersion !== DECODED_CONTRACT_VERSION ||
    input.existingMaterializerVersion !== MATERIALIZER_VERSION;
  if (
    input.existingProviderUpdatedAt &&
    (!input.incomingProviderUpdatedAt ||
      input.incomingProviderUpdatedAt < input.existingProviderUpdatedAt)
  ) {
    return "stale";
  }
  if (
    versionMismatch &&
    input.existingProviderUpdatedAt &&
    (!input.incomingProviderUpdatedAt ||
      input.incomingProviderUpdatedAt <= input.existingProviderUpdatedAt)
  ) {
    return "stale";
  }
  if (!versionMismatch && input.existingDigest === input.incomingDigest) {
    return "exact-redelivery";
  }
  if (input.existingDigest !== null && input.existingDigest !== input.incomingDigest) {
    return input.incomingProviderUpdatedAt &&
      input.existingProviderUpdatedAt &&
      input.incomingProviderUpdatedAt > input.existingProviderUpdatedAt
      ? "apply"
      : "conflict";
  }
  return "apply";
}

function uuidFromIdentity(identity: string): string {
  const hash = createHash("sha256").update(identity).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function recordingSessionActivityId(profileId: string, sessionId: string): string {
  return uuidFromIdentity(`${profileId}:${sessionId}`);
}

export function activityArtifactId(profileId: string, sha256: string, byteSize: number): string {
  return uuidFromIdentity(`artifact:${profileId}:sha256:${sha256}:${byteSize}`);
}

export function providerActivityId(
  profileId: string,
  provider: string,
  externalId: string,
): string {
  return uuidFromIdentity(`provider-activity:${profileId}:${provider}:${externalId}`);
}

export function manualImportActivityId(profileId: string, sha256: string): string {
  return uuidFromIdentity(`manual-import:${profileId}:sha256:${sha256}`);
}

export interface ActivityArtifactSubmission {
  sha256: string;
  byteSize: number;
  bucket: string;
  path: string;
  mediaType: string;
  format: ActivityFileType;
  originalName?: string | null;
}

export interface ActivitySubmissionComposition<Result = unknown> {
  persist(tx: TransactionClient, context: { activityId: string; now: Date }): Promise<Result>;
}

interface ReadyIngestionSubmission {
  source: "mobile_recording" | "manual_import" | "provider_sync";
  provider?: "strava" | "wahoo" | "trainingpeaks" | "garmin" | "zwift" | null;
  externalId?: string | null;
  operationKey?: string;
  claimToken?: string;
  artifact?: ActivityArtifactSubmission;
  fileType?: ActivityFileType;
}

function ingestionOperationKey(ingestion: ReadyIngestionSubmission, activityId: string): string {
  return (
    ingestion.operationKey ??
    [
      ingestion.source,
      ingestion.provider ?? "direct",
      ingestion.externalId ?? activityId,
      ingestion.artifact?.sha256 ?? "no-artifact",
    ].join(":")
  );
}

function assignEffortSegments(
  efforts: Array<typeof activityEfforts.$inferInsert>,
  segmentSet: CompletedActivitySegmentSetV1,
) {
  return efforts.map((effort) => {
    const startMs = (effort.start_offset ?? 0) * 1000;
    const endMs = startMs + effort.duration_seconds * 1000;
    const matches = segmentSet.segments.filter(
      (segment) =>
        segment.role === "activity" &&
        segment.category === effort.activity_category &&
        startMs >= segment.startOffsetMs &&
        endMs <= segment.endOffsetMs,
    );
    if (matches.length !== 1) {
      throw new Error(
        `Generated effort must map to exactly one ${effort.activity_category} segment without crossing boundaries`,
      );
    }
    return { ...effort, segment_id: matches[0]?.id };
  });
}

export interface ActivitySubmission {
  kind?: "create";
  requestedActivityId?: string;
  profileId: string;
  name: string;
  notes: string | null;
  activityPlanId?: string | null;
  isPrivate: boolean;
  contentVisibility?: ContentVisibility;
  startedAt: Date;
  finishedAt: Date;
  elapsedMs: number;
  activeMs?: number | null;
  movingMs?: number | null;
  timingCoverage?: "complete" | "partial" | "unavailable";
  distanceMeters: number;
  calories: number | null;
  elevationGainMeters: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  avgPower: number | null;
  maxPower: number | null;
  normalizedPower: number | null;
  avgCadence: number | null;
  maxCadence: number | null;
  avgSpeedMps: number | null;
  maxSpeedMps: number | null;
  normalizedSpeedMps: number | null;
  normalizedGradedSpeedMps: number | null;
  efficiencyFactor: number | null;
  aerobicDecoupling: number | null;
  avgTemperature: number | null;
  poolLength?: number | null;
  deviceManufacturer: unknown;
  deviceProduct: unknown;
  laps: unknown[] | null;
  mapBounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null;
  polyline: string | null;
  providerProvenance?: {
    provider: "wahoo";
    externalId: string;
    integrationId: string;
    providerUpdatedAt: string | null;
  };
  segmentSet?: CompletedActivitySegmentSetV1;
  analysis?: {
    efforts: Array<typeof activityEfforts.$inferInsert>;
    detectedLTHR: number | null;
    activityCompletedAt: Date;
    ingestion?: ReadyIngestionSubmission;
  };
  composition?: ActivitySubmissionComposition;
}

export interface ExistingActivityEnrichmentSubmission {
  kind: "enrich";
  activityId: string;
  profileId: string;
  deviceManufacturer: unknown;
  deviceProduct: unknown;
  laps?: unknown[] | null;
  mapBounds?: (typeof activities.$inferInsert)["map_bounds"];
  polyline?: (typeof activities.$inferInsert)["polyline"];
  summaryValues: Partial<typeof activities.$inferInsert> & {
    activity_id?: string;
    profile_id?: string;
  };
  segmentSet?: CompletedActivitySegmentSetV1;
  efforts: Array<typeof activityEfforts.$inferInsert>;
  detectedLTHR: number | null;
  activityCompletedAt: Date;
  activityPlanId?: string | null;
  name?: string;
  notes?: string | null;
  isPrivate?: boolean;
  contentVisibility?: ContentVisibility;
  startedAt?: Date;
  finishedAt?: Date;
  ingestion?: ReadyIngestionSubmission;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

async function persistArtifactAndLink(
  tx: TransactionClient,
  input: {
    activityId: string;
    profileId: string;
    artifact: ActivityArtifactSubmission;
    providerRevision?: string | null;
    now: Date;
  },
) {
  if (!/^[0-9a-f]{64}$/.test(input.artifact.sha256) || input.artifact.byteSize <= 0) {
    throw new Error("Accepted activity artifacts require a valid SHA-256 digest and byte size");
  }
  const expectedPath = `artifacts/sha256/${input.profileId}/${input.artifact.sha256}`;
  if (input.artifact.path !== expectedPath) {
    throw new Error("Accepted activity artifact path is not immutable content-addressed storage");
  }
  const artifactId = activityArtifactId(
    input.profileId,
    input.artifact.sha256,
    input.artifact.byteSize,
  );
  const [createdArtifact] = await tx
    .insert(activityArtifacts)
    .values({
      id: artifactId,
      profile_id: input.profileId,
      digest_algorithm: "sha256",
      digest: input.artifact.sha256,
      byte_size: input.artifact.byteSize,
      bucket: input.artifact.bucket,
      path: input.artifact.path,
      media_type: input.artifact.mediaType,
      format: input.artifact.format,
      original_name: input.artifact.originalName ?? null,
      availability: "accepted",
      first_accepted_at: input.now,
    })
    .onConflictDoNothing()
    .returning({ id: activityArtifacts.id });
  if (!createdArtifact) {
    const [verified] = await tx
      .select({ id: activityArtifacts.id, path: activityArtifacts.path })
      .from(activityArtifacts)
      .where(
        and(
          eq(activityArtifacts.id, artifactId),
          eq(activityArtifacts.profile_id, input.profileId),
          eq(activityArtifacts.digest, input.artifact.sha256),
          eq(activityArtifacts.byte_size, input.artifact.byteSize),
          eq(activityArtifacts.path, input.artifact.path),
        ),
      )
      .limit(1);
    if (!verified) throw new Error("Artifact acceptance conflict did not match immutable bytes");
  }
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.activityId}))`);
  const [existingLink] = await tx
    .select()
    .from(activityArtifactLinks)
    .where(
      and(
        eq(activityArtifactLinks.activity_id, input.activityId),
        eq(activityArtifactLinks.artifact_id, artifactId),
        eq(activityArtifactLinks.profile_id, input.profileId),
      ),
    )
    .limit(1);
  if (existingLink?.is_current) return artifactId;
  const [latest] = await tx
    .select({ ordinal: activityArtifactLinks.ordinal })
    .from(activityArtifactLinks)
    .where(eq(activityArtifactLinks.activity_id, input.activityId))
    .orderBy(desc(activityArtifactLinks.ordinal))
    .limit(1);
  const retired = await tx
    .update(activityArtifactLinks)
    .set({ is_current: false })
    .where(
      and(
        eq(activityArtifactLinks.activity_id, input.activityId),
        eq(activityArtifactLinks.profile_id, input.profileId),
        eq(activityArtifactLinks.role, "source"),
      ),
    )
    .returning({ id: activityArtifactLinks.id });
  if (latest && retired.length === 0) {
    throw new Error("Current artifact source revision changed concurrently");
  }
  if (existingLink) {
    const [promoted] = await tx
      .update(activityArtifactLinks)
      .set({ is_current: true, provider_revision: input.providerRevision ?? null })
      .where(eq(activityArtifactLinks.id, existingLink.id))
      .returning({ id: activityArtifactLinks.id });
    if (!promoted) throw new Error("Failed to promote existing artifact source revision");
  } else {
    const [linked] = await tx
      .insert(activityArtifactLinks)
      .values({
        id: uuidFromIdentity(`artifact-link:${input.activityId}:${artifactId}`),
        activity_id: input.activityId,
        artifact_id: artifactId,
        profile_id: input.profileId,
        role: "source",
        ordinal: (latest?.ordinal ?? -1) + 1,
        is_current: true,
        provider_revision: input.providerRevision ?? null,
        linked_at: input.now,
      })
      .returning({ id: activityArtifactLinks.id });
    if (!linked) throw new Error("Failed to append artifact source revision");
  }
  return artifactId;
}

async function replaceSegments(
  tx: TransactionClient,
  input: {
    activityId: string;
    profileId: string;
    artifactId?: string;
    segmentSet: CompletedActivitySegmentSetV1;
    revision: number;
    parserVersion: string;
    now: Date;
  },
) {
  const segmentSet = completedActivitySegmentSetSchemaV1.parse(input.segmentSet);
  await tx.delete(activitySegments).where(eq(activitySegments.activity_id, input.activityId));
  await tx.insert(activitySegments).values(
    segmentSet.segments.map((segment) => {
      const timing = segment.summary.timing;
      const source = segment.source;
      return {
        id: segment.id,
        activity_id: input.activityId,
        profile_id: input.profileId,
        ordinal: segment.ordinal,
        role: segment.role,
        category: segment.role === "activity" ? segment.category : null,
        start_offset_ms: segment.startOffsetMs,
        end_offset_ms: segment.endOffsetMs,
        source_artifact_id:
          source?.kind === "artifact" ? (input.artifactId ?? source.artifactId) : null,
        source_session_index:
          source?.kind === "artifact" ? (source.sessionMessageIndex ?? null) : null,
        source_message_index: source?.kind === "artifact" ? (source.messageIndex ?? null) : null,
        raw_type_string: typeof source?.rawType === "string" ? source.rawType : null,
        raw_type_integer: typeof source?.rawType === "number" ? source.rawType : null,
        raw_sport_string: typeof source?.rawSport === "string" ? source.rawSport : null,
        raw_sport_integer: typeof source?.rawSport === "number" ? source.rawSport : null,
        summary: segment.summary,
        summary_version: 1,
        timing_coverage: timing.timingCoverage,
        active_ms: "activeMs" in timing ? (timing.activeMs ?? null) : null,
        moving_ms: "movingMs" in timing ? (timing.movingMs ?? null) : null,
        segment_revision: input.revision,
        parser_version: input.parserVersion,
        materializer_version: MATERIALIZER_VERSION,
        created_at: input.now,
      };
    }),
  );
}

async function persistReadyActivityFileIngestion(
  tx: TransactionClient,
  input: {
    activityId: string;
    artifactId: string;
    profileId: string;
    ingestion: ReadyIngestionSubmission;
    now: Date;
  },
) {
  const operationKey = ingestionOperationKey(input.ingestion, input.activityId);
  if (input.ingestion.claimToken) {
    const [ready] = await tx
      .update(activityFileIngestions)
      .set({
        activity_id: input.activityId,
        artifact_id: input.artifactId,
        status: "ready",
        claim_token: null,
        lease_expires_at: null,
        completed_at: input.now,
        updated_at: input.now,
      })
      .where(
        and(
          eq(activityFileIngestions.profile_id, input.profileId),
          eq(activityFileIngestions.operation_key, operationKey),
          eq(activityFileIngestions.status, "processing"),
          eq(activityFileIngestions.claim_token, input.ingestion.claimToken),
          gt(activityFileIngestions.lease_expires_at, sql`clock_timestamp()`),
        ),
      )
      .returning({ id: activityFileIngestions.id });
    if (!ready) throw new ActivityFileIngestionClaimLostError();
    return;
  }
  const [ready] = await tx
    .insert(activityFileIngestions)
    .values({
      id: uuidFromIdentity(`ingestion:${input.profileId}:${operationKey}`),
      activity_id: input.activityId,
      artifact_id: input.artifactId,
      profile_id: input.profileId,
      source: input.ingestion.source,
      provider: input.ingestion.provider ?? null,
      external_id: input.ingestion.externalId ?? null,
      operation_key: operationKey,
      status: "ready",
      attempt_count: 1,
      requested_at: input.now,
      received_at: input.now,
      started_at: input.now,
      completed_at: input.now,
      created_at: input.now,
      updated_at: input.now,
    })
    .onConflictDoUpdate({
      target: [activityFileIngestions.profile_id, activityFileIngestions.operation_key],
      set: {
        activity_id: input.activityId,
        artifact_id: input.artifactId,
        status: "ready",
        claim_token: null,
        lease_expires_at: null,
        completed_at: input.now,
        updated_at: input.now,
      },
    })
    .returning({ id: activityFileIngestions.id });
  if (!ready) throw new Error("Failed to persist ready activity file ingestion");
}

export async function updateCanonicalActivityFields(
  tx: TransactionClient,
  input: {
    activityId: string;
    profileId: string;
    fields: Partial<
      Pick<typeof activities.$inferInsert, "name" | "notes" | "is_private" | "content_visibility">
    >;
    now?: Date;
  },
) {
  const [activity] = await tx
    .update(activities)
    .set({ ...input.fields, updated_at: input.now ?? new Date() })
    .where(and(eq(activities.id, input.activityId), eq(activities.profile_id, input.profileId)))
    .returning();
  return activity;
}

/** The sole atomic writer for parent, ordered segments, current artifact, and ready ingestion. */
export async function submitActivity(
  db: DbClient,
  input: ActivitySubmission | ExistingActivityEnrichmentSubmission,
) {
  let activityId =
    input.kind === "enrich" ? input.activityId : (input.requestedActivityId ?? randomUUID());
  let compositionResult: unknown;
  let noOp = false;
  await db.transaction(async (tx) => {
    const now = new Date();
    const provenance = input.kind === "enrich" ? undefined : input.providerProvenance;
    const ingestion = input.kind === "enrich" ? input.ingestion : input.analysis?.ingestion;
    if (ingestion?.claimToken) {
      const [claim] = await tx
        .select({ id: activityFileIngestions.id })
        .from(activityFileIngestions)
        .where(
          and(
            eq(activityFileIngestions.profile_id, input.profileId),
            eq(activityFileIngestions.operation_key, ingestionOperationKey(ingestion, activityId)),
            eq(activityFileIngestions.status, "processing"),
            eq(activityFileIngestions.claim_token, ingestion.claimToken),
            gt(activityFileIngestions.lease_expires_at, sql`clock_timestamp()`),
          ),
        )
        .limit(1);
      if (!claim) throw new ActivityFileIngestionClaimLostError();
    }
    if (provenance) {
      const [byProviderIdentity] = await tx
        .select()
        .from(activities)
        .where(
          and(
            eq(activities.profile_id, input.profileId),
            eq(activities.provider, provenance.provider),
            eq(activities.external_id, provenance.externalId),
          ),
        )
        .limit(1);
      if (byProviderIdentity) activityId = byProviderIdentity.id;
    }

    const [existing] = await tx
      .select()
      .from(activities)
      .where(and(eq(activities.id, activityId), eq(activities.profile_id, input.profileId)))
      .limit(1);
    if (input.kind === "enrich" && !existing) throw new Error("Activity not found for profile");

    if (provenance && existing) {
      const [resource] = await tx
        .select()
        .from(integrationResourceLinks)
        .where(
          and(
            eq(integrationResourceLinks.profile_id, input.profileId),
            eq(integrationResourceLinks.provider, provenance.provider),
            eq(integrationResourceLinks.external_id, provenance.externalId),
            eq(integrationResourceLinks.resource_kind, "activity"),
          ),
        )
        .limit(1);
      const incomingUpdatedAt = provenance.providerUpdatedAt
        ? new Date(provenance.providerUpdatedAt)
        : null;
      if (ingestion?.artifact) {
        const [current] = await tx
          .select({ digest: activityArtifacts.digest })
          .from(activityArtifactLinks)
          .innerJoin(activityArtifacts, eq(activityArtifacts.id, activityArtifactLinks.artifact_id))
          .where(
            and(
              eq(activityArtifactLinks.activity_id, activityId),
              eq(activityArtifactLinks.role, "source"),
              eq(activityArtifactLinks.is_current, true),
            ),
          )
          .limit(1);
        const decision = providerProjectionDecision({
          existingProviderUpdatedAt: resource?.provider_updated_at ?? null,
          incomingProviderUpdatedAt: incomingUpdatedAt,
          existingDigest: current?.digest ?? null,
          incomingDigest: ingestion.artifact.sha256,
          existingParserVersion: existing.parser_version,
          existingDecodedVersion: existing.decoded_contract_version,
          existingMaterializerVersion: existing.materializer_version,
        });
        if (decision === "stale") {
          noOp = true;
          return;
        }
        if (decision === "conflict") {
          throw new Error("Provider payload digest conflicts with the current provider revision");
        }
        if (decision === "exact-redelivery") {
          if (
            resource &&
            incomingUpdatedAt &&
            incomingUpdatedAt > (resource.provider_updated_at ?? new Date(0))
          ) {
            await tx
              .update(integrationResourceLinks)
              .set({ provider_updated_at: incomingUpdatedAt, synced_at: now, updated_at: now })
              .where(eq(integrationResourceLinks.id, resource.id));
          }
          await persistReadyActivityFileIngestion(tx, {
            activityId,
            artifactId: activityArtifactId(
              input.profileId,
              ingestion.artifact.sha256,
              ingestion.artifact.byteSize,
            ),
            profileId: input.profileId,
            ingestion,
            now,
          });
          noOp = true;
          return;
        }
      }
    }

    const elapsedMs =
      input.kind === "enrich"
        ? (input.summaryValues.elapsed_ms ??
          (input.startedAt && input.finishedAt
            ? input.finishedAt.getTime() - input.startedAt.getTime()
            : existing?.elapsed_ms))
        : input.elapsedMs;
    if (!elapsedMs || elapsedMs <= 0) throw new Error("Activity elapsed time must be positive");
    const movingMs =
      input.kind === "enrich"
        ? (input.summaryValues.moving_ms ?? existing?.moving_ms ?? null)
        : (input.movingMs ?? null);
    if (!input.segmentSet)
      throw new Error("Activity submission requires an ordered segment manifest");
    const segmentSet = completedActivitySegmentSetSchemaV1.parse(input.segmentSet);
    // `activities.normalized_power` is retained solely for legacy consumers. Never accept
    // caller/provider parent values over the validated provenance-bearing segment summary.
    const normalizedPowerProjection = deriveNormalizedPowerCompatibilityProjection(segmentSet);
    const revision = (existing?.segments_revision ?? 0) + 1;
    const parserVersion = SUBMISSION_PARSER_VERSION;
    const laps =
      input.laps === undefined ? undefined : activityLapRecordListSchema.parse(input.laps ?? []);
    const visibility =
      input.contentVisibility ??
      (input.isPrivate === undefined
        ? (existing?.content_visibility ?? "private")
        : input.isPrivate
          ? "private"
          : "followers");
    const baseValues = {
      activity_plan_id:
        input.activityPlanId === undefined
          ? (existing?.activity_plan_id ?? null)
          : input.activityPlanId,
      name: input.name ?? existing?.name ?? "Activity",
      notes: input.notes === undefined ? (existing?.notes ?? null) : input.notes,
      is_private: input.isPrivate ?? existing?.is_private ?? true,
      content_visibility: visibility,
      started_at: input.startedAt ?? existing?.started_at ?? now,
      finished_at: input.finishedAt ?? existing?.finished_at ?? now,
      elapsed_ms: elapsedMs,
      active_ms:
        input.kind === "enrich"
          ? (input.summaryValues.active_ms ?? existing?.active_ms ?? null)
          : (input.activeMs ?? null),
      moving_ms: movingMs,
      timing_coverage:
        input.kind === "enrich"
          ? (input.summaryValues.timing_coverage ?? existing?.timing_coverage ?? "unavailable")
          : (input.timingCoverage ?? "unavailable"),
      segments_revision: revision,
      parser_version: parserVersion,
      decoded_contract_version: DECODED_CONTRACT_VERSION,
      materializer_version: MATERIALIZER_VERSION,
      segments_generated_at: now,
      updated_at: now,
    };

    if (existing) {
      const summaryValues = input.kind === "enrich" ? input.summaryValues : {};
      const {
        id: _id,
        activity_id: _activityId,
        profile_id: _profileId,
        created_at: _createdAt,
        normalized_power: _normalizedPower,
        ...safeSummaryValues
      } = summaryValues as typeof summaryValues & { activity_id?: string };
      const [updated] = await tx
        .update(activities)
        .set({
          ...safeSummaryValues,
          ...baseValues,
          normalized_power: normalizedPowerProjection,
          device_manufacturer: stringOrNull(input.deviceManufacturer),
          device_product: stringOrNull(input.deviceProduct),
          ...(input.mapBounds === undefined ? {} : { map_bounds: input.mapBounds }),
          ...(input.polyline === undefined ? {} : { polyline: input.polyline }),
          ...(laps === undefined ? {} : { laps }),
        })
        .where(
          and(
            eq(activities.id, activityId),
            eq(activities.profile_id, input.profileId),
            eq(activities.segments_revision, existing.segments_revision),
          ),
        )
        .returning({ id: activities.id });
      if (!updated) throw new Error("Stale activity materialization revision");
    } else {
      if (input.kind === "enrich") throw new Error("Activity not found for profile");
      await tx.insert(activities).values({
        id: activityId,
        profile_id: input.profileId,
        ...baseValues,
        provider: provenance?.provider ?? null,
        external_id: provenance?.externalId ?? null,
        distance_meters: input.distanceMeters,
        elevation_gain_meters: input.elevationGainMeters,
        calories: input.calories,
        avg_heart_rate: input.avgHeartRate,
        max_heart_rate: input.maxHeartRate,
        avg_power: input.avgPower,
        max_power: input.maxPower,
        normalized_power: normalizedPowerProjection,
        avg_cadence: input.avgCadence,
        max_cadence: input.maxCadence,
        avg_speed_mps: input.avgSpeedMps,
        max_speed_mps: input.maxSpeedMps,
        normalized_speed_mps: input.normalizedSpeedMps,
        normalized_graded_speed_mps: input.normalizedGradedSpeedMps,
        efficiency_factor: input.efficiencyFactor,
        aerobic_decoupling: input.aerobicDecoupling,
        avg_temperature: input.avgTemperature,
        pool_length: input.poolLength ?? null,
        device_manufacturer: stringOrNull(input.deviceManufacturer),
        device_product: stringOrNull(input.deviceProduct),
        map_bounds: input.mapBounds,
        polyline: input.polyline,
        laps: laps ?? [],
        created_at: now,
      });
    }

    let artifactId: string | undefined;
    if (ingestion) {
      const artifact = ingestion.artifact;
      if (!artifact) {
        throw new Error("Ready activity file ingestion requires an accepted artifact");
      }
      artifactId = await persistArtifactAndLink(tx, {
        activityId,
        profileId: input.profileId,
        artifact,
        providerRevision:
          input.kind === "enrich" ? null : (input.providerProvenance?.providerUpdatedAt ?? null),
        now,
      });
    }
    await replaceSegments(tx, {
      activityId,
      profileId: input.profileId,
      artifactId,
      segmentSet,
      revision,
      parserVersion,
      now,
    });

    if (provenance && !existing)
      await tx
        .insert(integrationResourceLinks)
        .values({
          id: randomUUID(),
          profile_id: input.profileId,
          integration_id: provenance.integrationId,
          provider: provenance.provider,
          resource_kind: "activity",
          external_id: provenance.externalId,
          internal_resource_id: activityId,
          provider_updated_at: provenance.providerUpdatedAt
            ? new Date(provenance.providerUpdatedAt)
            : null,
          synced_at: now,
          created_at: now,
          updated_at: now,
        })
        .onConflictDoNothing();
    else if (provenance) {
      await tx
        .update(integrationResourceLinks)
        .set({
          provider_updated_at: provenance.providerUpdatedAt
            ? new Date(provenance.providerUpdatedAt)
            : null,
          synced_at: now,
          updated_at: now,
        })
        .where(
          and(
            eq(integrationResourceLinks.profile_id, input.profileId),
            eq(integrationResourceLinks.provider, provenance.provider),
            eq(integrationResourceLinks.external_id, provenance.externalId),
            eq(integrationResourceLinks.resource_kind, "activity"),
          ),
        );
    }

    const evidence = input.kind === "enrich" ? input : input.analysis;
    if (evidence) {
      await reconcileGeneratedActivityEvidence(tx, {
        activityId,
        profileId: input.profileId,
        efforts: assignEffortSegments(evidence.efforts, segmentSet),
        detectedLTHR: evidence.detectedLTHR,
        activityCompletedAt: evidence.activityCompletedAt,
        now,
      });
    }
    if (input.kind !== "enrich" && input.composition) {
      compositionResult = await input.composition.persist(tx, { activityId, now });
    }
    if (ingestion && artifactId) {
      await persistReadyActivityFileIngestion(tx, {
        activityId,
        artifactId,
        profileId: input.profileId,
        ingestion,
        now,
      });
    }
  });
  return { id: activityId, compositionResult, noOp };
}
