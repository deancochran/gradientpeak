import { createHash, randomUUID } from "node:crypto";
import {
  activityLapRecordListSchema,
  COMPLETED_ACTIVITY_PERFORMANCE_TARGET_SNAPSHOT_VERSION,
  type ContentVisibility,
  completedActivityPerformanceTargetSnapshotSchema,
  completedActivityTitle,
  type ProviderSourceProvenance,
  providerSourceProvenanceSchema,
} from "@repo/core";
import {
  type CompletedActivitySegmentSet,
  completedActivitySegmentSetSchema,
} from "@repo/core/activity-segments";
import type { ActivityFileType } from "@repo/core/server/activity-files";
import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  type activityEfforts,
  activitySegments,
  activitySourceReferences,
  integrations,
  profiles,
} from "@repo/db";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { type getRequiredDb, withProfileFencedRepeatableReadSnapshot } from "../../db";
import {
  attachActivitySourceReferenceWithProfileLockHeld as attachActivitySourceReference,
  resolveCanonicalActivityReference,
  stageActivitySourceReferenceForReview,
} from "../../repositories/activity-source-reference-repository";
import {
  deleteThresholdEvidenceForActivity,
  readThresholdImpactForActivity,
  type ThresholdImpact,
} from "../../repositories/threshold-repository";
import { acceptActivityIngestion } from "../activity-file-ingestion/direct-activity-ingestion";
import { materializeActivityAthleteStateEvidence } from "../athlete-intelligence/athlete-state-evidence";
import { readPublishedAthletePerformanceTargets } from "../athlete-intelligence/published-athlete-state";
import {
  decideProviderActivityMatch,
  PROVIDER_PROBABLE_START_TOLERANCE_MS,
} from "./provider-activity-matching";
import {
  type GeneratedActivityLthrEvidence,
  reconcileGeneratedActivityEvidenceWithProfileLockHeld,
} from "./reconcile-activity-evidence";

type DbClient = ReturnType<typeof getRequiredDb>;
export type ActivitySubmissionTransaction = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

export const DECODED_CONTRACT_VERSION = "decoded-activity-artifact-v1";
export const MATERIALIZER_VERSION = "activity-segments-v2";
export type CanonicalActivityEvidenceTier =
  | "inferred_fallback"
  | "provider_summary"
  | "raw_samples"
  | "fit_artifact";
const canonicalEvidenceTierRank: Record<CanonicalActivityEvidenceTier, number> = {
  inferred_fallback: 0,
  provider_summary: 1,
  raw_samples: 2,
  fit_artifact: 3,
};

export function canCanonicalEvidenceReplace(
  existing: CanonicalActivityEvidenceTier,
  incoming: CanonicalActivityEvidenceTier,
) {
  return canonicalEvidenceTierRank[incoming] >= canonicalEvidenceTierRank[existing];
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(",")}}`;
}

export function canonicalSegmentEvidenceChanged(
  existingSegments: Array<typeof activitySegments.$inferSelect>,
  incoming: CompletedActivitySegmentSet,
) {
  const existing = existingSegments.map((segment) => ({
    ordinal: segment.ordinal,
    role: segment.role,
    activityCategory: segment.activity_category,
    startOffsetMs: segment.start_offset_ms,
    endOffsetMs: segment.end_offset_ms,
    sourceSessionIndex: segment.source_session_index,
    sourceMessageIndex: segment.source_message_index,
    rawType: segment.raw_type_string ?? segment.raw_type_integer,
    rawSport: segment.raw_sport_string ?? segment.raw_sport_integer,
    rawSubSport: segment.raw_sub_sport_string ?? segment.raw_sub_sport_integer,
    summary: segment.summary,
  }));
  const next = incoming.segments.map((segment) => ({
    ordinal: segment.ordinal,
    role: segment.role,
    activityCategory: segment.role === "activity" ? segment.activity_category : null,
    startOffsetMs: segment.startOffsetMs,
    endOffsetMs: segment.endOffsetMs,
    sourceSessionIndex:
      segment.source?.kind === "artifact" ? (segment.source.sessionMessageIndex ?? null) : null,
    sourceMessageIndex:
      segment.source?.kind === "artifact" ? (segment.source.messageIndex ?? null) : null,
    rawType: segment.source?.kind === "artifact" ? (segment.source.rawType ?? null) : null,
    rawSport: segment.source?.kind === "artifact" ? (segment.source.rawSport ?? null) : null,
    rawSubSport: segment.source?.kind === "artifact" ? (segment.source.rawSubSport ?? null) : null,
    summary: segment.summary,
  }));
  return canonicalJson(existing) !== canonicalJson(next);
}
export const SUBMISSION_PARSER_VERSION = "canonical-submission-v1";

/** A lifecycle repair owns the bytes; retry after it converges rather than reviving it. */
export class ActivityArtifactLifecycleRetryableError extends Error {
  constructor() {
    super("Activity artifact lifecycle is pending repair");
    this.name = "ActivityArtifactLifecycleRetryableError";
  }
}

export class UnsupportedPersistedActivityVersionError extends Error {
  constructor() {
    super("Provider activity has non-current persisted versions");
    this.name = "UnsupportedPersistedActivityVersionError";
  }
}

export class ActivitySubmissionValidationError extends Error {
  constructor(
    public readonly code:
      | "activity_laps_invalid"
      | "activity_performance_snapshot_invalid"
      | "activity_segments_invalid",
    cause: unknown,
  ) {
    super(code, { cause });
    this.name = "ActivitySubmissionValidationError";
  }
}

export class ActivityAthleteStateEvidenceError extends Error {
  constructor(cause: unknown) {
    super("activity_athlete_state_evidence_invalid", { cause });
    this.name = "ActivityAthleteStateEvidenceError";
  }
}

export class ActivityCalibrationEvidenceError extends Error {
  constructor(
    public readonly code:
      | "activity_calibration_evidence_invalid"
      | "activity_effort_reconciliation_invalid"
      | "activity_effort_segment_mismatch",
    cause: unknown,
  ) {
    super(code, { cause });
    this.name = "ActivityCalibrationEvidenceError";
  }
}

export class ActivitySourceReferenceError extends Error {
  constructor(cause: unknown) {
    super("activity_source_reference_failed", { cause });
    this.name = "ActivitySourceReferenceError";
  }
}

export class ActivityMaterialEvidenceMarkerError extends Error {
  constructor(cause: unknown) {
    super("activity_material_evidence_marker_failed", { cause });
    this.name = "ActivityMaterialEvidenceMarkerError";
  }
}

export class ActivityArtifactPersistenceError extends Error {
  constructor(cause: unknown) {
    super("activity_artifact_persistence_failed", { cause });
    this.name = "ActivityArtifactPersistenceError";
  }
}

export class ActivityFileIngestionPersistenceError extends Error {
  constructor(cause: unknown) {
    super("activity_ingestion_persistence_failed", { cause });
    this.name = "ActivityFileIngestionPersistenceError";
  }
}

export class ActivityParentPersistenceError extends Error {
  constructor(cause: unknown) {
    super("activity_parent_persistence_failed", { cause });
    this.name = "ActivityParentPersistenceError";
  }
}

export class ActivitySegmentPersistenceError extends Error {
  constructor(cause: unknown) {
    super("activity_segment_persistence_failed", { cause });
    this.name = "ActivitySegmentPersistenceError";
  }
}

function parseActivitySegments(input: unknown) {
  try {
    return completedActivitySegmentSetSchema.parse(input);
  } catch (error) {
    throw new ActivitySubmissionValidationError("activity_segments_invalid", error);
  }
}

async function captureCompletedActivityPerformanceTargets(
  tx: ActivitySubmissionTransaction,
  input: { profileId: string; now: Date },
) {
  try {
    const published = await readPublishedAthletePerformanceTargets({
      db: tx,
      profileId: input.profileId,
      now: input.now,
    });
    return completedActivityPerformanceTargetSnapshotSchema.parse({
      contractVersion: COMPLETED_ACTIVITY_PERFORMANCE_TARGET_SNAPSHOT_VERSION,
      capturedAt: input.now.toISOString(),
      publishedRevision: published.publishedRevision,
      publicationStatus: published.status,
      targets: published.targets,
    });
  } catch (error) {
    throw new ActivitySubmissionValidationError("activity_performance_snapshot_invalid", error);
  }
}

export function providerProjectionDecision(input: {
  existingProviderUpdatedAt: Date | null;
  incomingProviderUpdatedAt: Date | null;
  existingDigest: string | null;
  incomingDigest: string;
  existingParserVersion: string | null;
  existingDecodedVersion: string | null;
  existingMaterializerVersion: string | null;
}): "apply" | "conflict" | "exact-redelivery" | "stale" | "unsupported-persisted-version" {
  const existingRevision = input.existingProviderUpdatedAt?.getTime() ?? null;
  const incomingRevision = input.incomingProviderUpdatedAt?.getTime() ?? null;
  if (
    input.existingDigest !== null &&
    (input.existingParserVersion !== SUBMISSION_PARSER_VERSION ||
      input.existingDecodedVersion !== DECODED_CONTRACT_VERSION ||
      input.existingMaterializerVersion !== MATERIALIZER_VERSION)
  ) {
    return "unsupported-persisted-version";
  }
  if (
    existingRevision !== null &&
    (incomingRevision === null || incomingRevision < existingRevision)
  ) {
    return "stale";
  }
  if (input.existingDigest !== null && input.existingDigest !== input.incomingDigest) {
    return incomingRevision !== null &&
      existingRevision !== null &&
      incomingRevision > existingRevision
      ? "apply"
      : "conflict";
  }
  if (input.existingDigest === input.incomingDigest && existingRevision === incomingRevision)
    return "exact-redelivery";
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
  persist(
    tx: ActivitySubmissionTransaction,
    context: { activityId: string; now: Date },
  ): Promise<Result>;
}

interface ReadyIngestionSubmission {
  source: "mobile_recording" | "manual_import" | "provider_sync";
  provider?: "strava" | "wahoo" | "trainingpeaks" | "garmin" | "zwift" | null;
  externalId?: string | null;
  operationId?: string;
  ingestionId?: string;
  stagingCleanupPending?: boolean;
  artifact: ActivityArtifactSubmission;
  fileType?: ActivityFileType;
}

function assignEffortSegments(
  efforts: Array<typeof activityEfforts.$inferInsert>,
  segmentSet: CompletedActivitySegmentSet,
) {
  return efforts.map((effort) => {
    const startMs = effort.start_offset_ms;
    const endMs = effort.end_offset_ms;
    const matches = segmentSet.segments.filter(
      (segment) =>
        segment.role === "activity" &&
        segment.activity_category === effort.activity_category &&
        startMs >= segment.startOffsetMs &&
        endMs <= segment.endOffsetMs,
    );
    const [match] = matches;
    if (matches.length !== 1 || !match) {
      throw new Error(
        `Generated effort must map to exactly one ${effort.activity_category} segment without crossing boundaries`,
      );
    }
    return { ...effort, segment_id: match.id };
  });
}

export interface ActivitySubmission {
  kind?: "create";
  requestedActivityId?: string;
  profileId: string;
  name: string;
  /** Recorder-owned review names are user-visible activity titles. */
  nameStrategy?: "generated" | "provided";
  notes: string | null;
  activityPlanId?: string | null;
  routeId?: string | null;
  contentVisibility: ContentVisibility;
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
  avgCadence: number | null;
  maxCadence: number | null;
  avgSpeedMps: number | null;
  maxSpeedMps: number | null;
  normalizedSpeedMps: number | null;
  avgTemperature: number | null;
  poolLengthMeters?: number | null;
  totalStrokes?: number | null;
  avgSwolf?: number | null;
  deviceManufacturer: unknown;
  deviceProduct: unknown;
  laps: unknown[] | null;
  mapBounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null;
  polyline: string | null;
  providerProvenance?: ProviderSourceProvenance & {
    integrationId: string;
    integrationGeneration?: number;
    providerUpdatedAt: string | null;
    relationshipKind?: "imported" | "exported" | "both";
    evidenceTier?: CanonicalActivityEvidenceTier;
  };
  segmentSet?: CompletedActivitySegmentSet;
  analysis?: {
    efforts: Array<typeof activityEfforts.$inferInsert>;
    detectedLTHR: GeneratedActivityLthrEvidence | null;
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
  laps?: unknown[] | null | undefined;
  mapBounds?: (typeof activities.$inferInsert)["map_bounds"];
  polyline?: (typeof activities.$inferInsert)["polyline"];
  summaryValues: Partial<Omit<typeof activities.$inferInsert, "performance_target_snapshot">> & {
    activity_id?: string;
    profile_id?: string;
  };
  segmentSet?: CompletedActivitySegmentSet;
  efforts: Array<typeof activityEfforts.$inferInsert>;
  detectedLTHR: GeneratedActivityLthrEvidence | null;
  activityPlanId?: string | null;
  name?: string;
  notes?: string | null;
  contentVisibility?: ContentVisibility;
  startedAt?: Date;
  finishedAt?: Date;
  ingestion?: ReadyIngestionSubmission;
}

export type SubmitActivityResult = {
  id: string;
  compositionResult: unknown;
  noOp: boolean;
  resolutionStatus: "confirmed" | "review";
  reviewCandidateActivityId: string | null;
};

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

async function persistArtifactAndLink(
  tx: ActivitySubmissionTransaction,
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
  // Artifact lifecycle and failed-promotion cleanup serialize on the immutable
  // profile/digest identity. This is deliberately distinct from the activity
  // link lock below.
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`${input.profileId}:${input.artifact.sha256}`}))`,
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
      .select({
        availability: activityArtifacts.availability,
        id: activityArtifacts.id,
        path: activityArtifacts.path,
      })
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
    if (verified.availability === "deletion_pending") {
      throw new ActivityArtifactLifecycleRetryableError();
    }
    if (verified.availability === "deleted") {
      // A failed promotion may leave a tombstone after its bytes were removed.
      // The immutable identity lock is held, so purge and recreate acceptance
      // for the caller's freshly promoted bytes in this transaction.
      await tx.execute(sql`select public.purge_deleted_activity_artifact(${artifactId}::uuid)`);
      const [recreated] = await tx
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
        .returning({ id: activityArtifacts.id });
      if (!recreated) throw new ActivityArtifactLifecycleRetryableError();
    }
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
  if (existingLink?.is_current) {
    if (existingLink.provider_revision !== (input.providerRevision ?? null)) {
      await tx
        .update(activityArtifactLinks)
        .set({ provider_revision: input.providerRevision ?? null })
        .where(eq(activityArtifactLinks.id, existingLink.id));
    }
    return artifactId;
  }
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
  tx: ActivitySubmissionTransaction,
  input: {
    activityId: string;
    profileId: string;
    artifactId?: string;
    segmentSet: CompletedActivitySegmentSet;
    revision: number;
    parserVersion: string;
    now: Date;
  },
) {
  const segmentSet = parseActivitySegments(input.segmentSet);
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
        activity_category: segment.role === "activity" ? segment.activity_category : null,
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
        raw_sub_sport_string: typeof source?.rawSubSport === "string" ? source.rawSubSport : null,
        raw_sub_sport_integer: typeof source?.rawSubSport === "number" ? source.rawSubSport : null,
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
  tx: ActivitySubmissionTransaction,
  input: {
    activityId: string;
    artifactId: string;
    profileId: string;
    ingestion: ReadyIngestionSubmission;
    now: Date;
  },
) {
  const { operationId, ingestionId } = input.ingestion;
  if (!operationId || !ingestionId) {
    throw new Error("Activity ingestion completion requires its exact operation");
  }
  await acceptActivityIngestion(tx, {
    profileId: input.profileId,
    ingestionId,
    operationId,
    source: input.ingestion.source,
    activityId: input.activityId,
    artifactId: input.artifactId,
    completedAt: input.now,
  });
}

export async function updateCanonicalActivityFields(
  tx: ActivitySubmissionTransaction,
  input: {
    activityId: string;
    profileId: string;
    fields: Partial<Pick<typeof activities.$inferInsert, "name" | "notes" | "content_visibility">>;
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
  options: {
    beforePersist?: (tx: ActivitySubmissionTransaction) => Promise<void>;
    importRunId?: string;
    deferAthleteStateRefresh?: boolean;
    deferPerformanceCalibration?: boolean;
    /** The caller has a durable owner decision to create a distinct canonical activity. */
    confirmReviewedSourceId?: string;
    stageProbableProviderDuplicates?: boolean;
  } = {},
): Promise<SubmitActivityResult> {
  let activityId =
    input.kind === "enrich" ? input.activityId : (input.requestedActivityId ?? randomUUID());
  let compositionResult: unknown;
  let noOp = false;
  let resolutionStatus: "confirmed" | "review" = "confirmed";
  let reviewCandidateActivityId: string | null = null;
  const evidence = input.kind === "enrich" ? input : input.analysis;
  if (!input.segmentSet)
    throw new Error("Activity submission requires an ordered segment manifest");
  const segmentSet = parseActivitySegments(input.segmentSet);
  const providerProvenanceInput = input.kind === "enrich" ? undefined : input.providerProvenance;
  const providerProvenance = providerProvenanceInput
    ? {
        ...providerProvenanceInput,
        ...providerSourceProvenanceSchema.parse({
          connector: providerProvenanceInput.connector,
          source: providerProvenanceInput.source,
        }),
      }
    : undefined;
  await withProfileFencedRepeatableReadSnapshot(
    db,
    input.profileId,
    // All provider fetching and artifact promotion has already completed; this
    // callback contains only relational work and is never partially retried.
    async (tx) => {
      const now = new Date();
      let effortMaterialRecordedAt: Date | null = null;
      let preInvalidatedCalibrationIdentities: ThresholdImpact[] = [];
      const provenance = providerProvenance;
      const ingestion = input.kind === "enrich" ? input.ingestion : input.analysis?.ingestion;
      const sourceOrigin = provenance
        ? {
            originProvider: provenance.source.sourceId,
            originExternalId: provenance.source.externalId,
            originTrust: "trusted_provider_origin" as const,
            ...(provenance.relationshipKind === undefined
              ? {}
              : { relationshipKind: provenance.relationshipKind }),
          }
        : {};
      if (options.confirmReviewedSourceId) {
        if (!provenance || input.kind === "enrich") {
          throw new Error("Reviewed source confirmation requires provider activity provenance");
        }
        const [confirmed] = await tx
          .update(activitySourceReferences)
          .set({ activity_id: activityId, resolution_status: "confirmed", updated_at: now })
          .where(
            and(
              eq(activitySourceReferences.id, options.confirmReviewedSourceId),
              eq(activitySourceReferences.profile_id, input.profileId),
              eq(activitySourceReferences.integration_id, provenance.integrationId),
              eq(activitySourceReferences.provider, provenance.connector.connectorId),
              eq(activitySourceReferences.provider_external_id, provenance.connector.externalId),
              eq(activitySourceReferences.resolution_status, "review"),
            ),
          )
          .returning({ id: activitySourceReferences.id });
        if (!confirmed) throw new Error("Reviewed source is no longer available");
      }
      if (provenance) {
        const resolved = await resolveCanonicalActivityReference(tx, {
          profileId: input.profileId,
          integrationId: provenance.integrationId,
          provider: provenance.connector.connectorId,
          providerExternalId: provenance.connector.externalId,
          providerRevision: provenance.providerUpdatedAt,
          ...sourceOrigin,
          ...(ingestion?.artifact?.sha256 === undefined
            ? {}
            : { artifactSha256: ingestion.artifact.sha256 }),
          ...(options.importRunId === undefined ? {} : { importRunId: options.importRunId }),
        });
        if (resolved) activityId = resolved;
      }
      // Lock and verify the lifecycle fence in this same transaction as every
      // activity/artifact/link/ingestion write.
      if (provenance) {
        const [activeIntegration] = await tx
          .select({ id: integrations.id })
          .from(integrations)
          .where(
            and(
              eq(integrations.id, provenance.integrationId),
              eq(integrations.profile_id, input.profileId),
              eq(integrations.provider, provenance.connector.connectorId),
              ...(provenance.integrationGeneration === undefined
                ? []
                : [
                    eq(integrations.lifecycle_status, "active"),
                    eq(integrations.generation, provenance.integrationGeneration),
                  ]),
            ),
          )
          .limit(1)
          .for(evidence ? "update" : "share");
        if (!activeIntegration) {
          throw new Error(
            provenance.integrationGeneration === undefined
              ? "integration_connector_mismatch"
              : "integration_generation_inactive",
          );
        }
      }
      const [existing] = await tx
        .select()
        .from(activities)
        .where(and(eq(activities.id, activityId), eq(activities.profile_id, input.profileId)))
        .limit(1);
      if (input.kind === "enrich" && !existing) throw new Error("Activity not found for profile");
      if (
        provenance &&
        input.kind !== "enrich" &&
        !existing &&
        options.stageProbableProviderDuplicates
      ) {
        const activityCategory =
          segmentSet.segments.find((segment) => segment.role === "activity")?.activity_category ??
          "other";
        const startLower = new Date(
          input.startedAt.getTime() - PROVIDER_PROBABLE_START_TOLERANCE_MS,
        );
        const startUpper = new Date(
          input.startedAt.getTime() + PROVIDER_PROBABLE_START_TOLERANCE_MS,
        );
        const candidateRows = await tx
          .select({
            activityCategory: activitySegments.activity_category,
            activityId: activities.id,
            elapsedMs: activities.elapsed_ms,
            startedAt: activities.started_at,
          })
          .from(activities)
          .innerJoin(
            activitySegments,
            and(
              eq(activitySegments.activity_id, activities.id),
              eq(activitySegments.role, "activity"),
            ),
          )
          .where(
            and(
              eq(activities.profile_id, input.profileId),
              gte(activities.started_at, startLower),
              lte(activities.started_at, startUpper),
            ),
          )
          .orderBy(asc(activities.started_at), asc(activities.id))
          .limit(20);
        const candidates = candidateRows.flatMap((candidate) =>
          candidate.activityCategory && candidate.elapsedMs !== null && candidate.startedAt !== null
            ? [
                {
                  activityCategory: candidate.activityCategory,
                  activityId: candidate.activityId,
                  elapsedMs: candidate.elapsedMs,
                  startedAt: candidate.startedAt,
                },
              ]
            : [],
        );
        const decision = decideProviderActivityMatch({
          exactActivityId: null,
          incoming: {
            activityCategory,
            elapsedMs: input.elapsedMs,
            startedAt: input.startedAt,
          },
          candidates,
        });
        if (decision.kind === "review") {
          await stageActivitySourceReferenceForReview(tx, {
            profileId: input.profileId,
            integrationId: provenance.integrationId,
            provider: provenance.connector.connectorId,
            providerExternalId: provenance.connector.externalId,
            providerRevision: provenance.providerUpdatedAt,
            ...sourceOrigin,
            ...(options.importRunId === undefined ? {} : { importRunId: options.importRunId }),
            candidateActivityId: decision.candidateActivityId,
            now,
          });
          noOp = true;
          resolutionStatus = "review";
          reviewCandidateActivityId = decision.candidateActivityId;
          return;
        }
      }
      let existingArtifactDigest: string | null = null;
      if (existing && ingestion?.artifact) {
        const [currentArtifact] = await tx
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
        existingArtifactDigest = currentArtifact?.digest ?? null;
      }
      const artifactEvidenceTier = ingestion?.artifact
        ? ingestion.artifact.format === "fit"
          ? "fit_artifact"
          : "raw_samples"
        : null;
      const incomingEvidenceTier =
        input.kind === "enrich"
          ? (artifactEvidenceTier ?? existing?.canonical_evidence_tier ?? "raw_samples")
          : (artifactEvidenceTier ??
            provenance?.evidenceTier ??
            (provenance ? "provider_summary" : "raw_samples"));
      if (
        provenance &&
        existing &&
        !canCanonicalEvidenceReplace(existing.canonical_evidence_tier, incomingEvidenceTier)
      ) {
        await options.beforePersist?.(tx);
        await attachActivitySourceReference(tx, {
          profileId: input.profileId,
          activityId,
          integrationId: provenance.integrationId,
          provider: provenance.connector.connectorId,
          providerExternalId: provenance.connector.externalId,
          providerRevision: provenance.providerUpdatedAt,
          ...sourceOrigin,
          ...(ingestion?.artifact?.sha256 === undefined
            ? {}
            : { artifactSha256: ingestion.artifact.sha256 }),
          ...(options.importRunId === undefined ? {} : { importRunId: options.importRunId }),
          now,
        });
        noOp = true;
        return;
      }

      if (provenance && existing) {
        const [sourceReference] = await tx
          .select({ providerRevision: activitySourceReferences.provider_revision })
          .from(activitySourceReferences)
          .where(
            and(
              eq(activitySourceReferences.profile_id, input.profileId),
              eq(activitySourceReferences.provider, provenance.connector.connectorId),
              eq(activitySourceReferences.provider_external_id, provenance.connector.externalId),
            ),
          )
          .limit(1);
        const incomingUpdatedAt = provenance.providerUpdatedAt
          ? new Date(provenance.providerUpdatedAt)
          : null;
        if (ingestion?.artifact) {
          const decision = providerProjectionDecision({
            existingProviderUpdatedAt: sourceReference?.providerRevision
              ? new Date(sourceReference.providerRevision)
              : null,
            incomingProviderUpdatedAt: incomingUpdatedAt,
            existingDigest: existingArtifactDigest,
            incomingDigest: ingestion.artifact.sha256,
            existingParserVersion: existing.parser_version,
            existingDecodedVersion: existing.decoded_contract_version,
            existingMaterializerVersion: existing.materializer_version,
          });
          if (decision === "stale") {
            await attachActivitySourceReference(tx, {
              profileId: input.profileId,
              activityId,
              integrationId: provenance.integrationId,
              provider: provenance.connector.connectorId,
              providerExternalId: provenance.connector.externalId,
              providerRevision: sourceReference?.providerRevision ?? provenance.providerUpdatedAt,
              ...sourceOrigin,
              artifactSha256: ingestion.artifact.sha256,
              ...(options.importRunId === undefined ? {} : { importRunId: options.importRunId }),
              now,
            });
            noOp = true;
            return;
          }
          if (decision === "conflict") {
            throw new Error("Provider payload digest conflicts with the current provider revision");
          }
          if (decision === "unsupported-persisted-version") {
            throw new UnsupportedPersistedActivityVersionError();
          }
          if (decision === "exact-redelivery") {
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
            await attachActivitySourceReference(tx, {
              profileId: input.profileId,
              activityId,
              integrationId: provenance.integrationId,
              provider: provenance.connector.connectorId,
              providerExternalId: provenance.connector.externalId,
              providerRevision: provenance.providerUpdatedAt,
              ...sourceOrigin,
              artifactSha256: ingestion.artifact.sha256,
              ...(options.importRunId === undefined ? {} : { importRunId: options.importRunId }),
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
      const existingSegments = existing
        ? await tx
            .select()
            .from(activitySegments)
            .where(eq(activitySegments.activity_id, activityId))
            .orderBy(asc(activitySegments.ordinal))
        : [];
      const canonicalEvidenceMaterialChanged = Boolean(
        existing &&
          ((ingestion?.artifact !== undefined &&
            existingArtifactDigest !== ingestion.artifact.sha256) ||
            canonicalEvidenceTierRank[incomingEvidenceTier] >
              canonicalEvidenceTierRank[existing.canonical_evidence_tier] ||
            canonicalSegmentEvidenceChanged(existingSegments, segmentSet) ||
            (ingestion?.artifact === undefined &&
              incomingEvidenceTier === "raw_samples" &&
              input.kind === "enrich")),
      );
      const revision = (existing?.segments_revision ?? 0) + 1;
      const parserVersion = SUBMISSION_PARSER_VERSION;
      let laps: ReturnType<typeof activityLapRecordListSchema.parse> | undefined;
      try {
        laps =
          input.laps === undefined
            ? undefined
            : activityLapRecordListSchema.parse(input.laps ?? []);
      } catch (error) {
        throw new ActivitySubmissionValidationError("activity_laps_invalid", error);
      }
      const visibility = input.contentVisibility ?? existing?.content_visibility ?? "private";
      const targetSnapshot = existing
        ? null
        : await captureCompletedActivityPerformanceTargets(tx, { profileId: input.profileId, now });
      const startedAt = input.startedAt ?? existing?.started_at ?? now;
      const primaryActivityCategory =
        segmentSet.segments.find((segment) => segment.role === "activity")?.activity_category ??
        "other";
      const [profile] = await tx
        .select({ planningTimezone: profiles.planning_timezone })
        .from(profiles)
        .where(eq(profiles.id, input.profileId))
        .limit(1);
      const baseValues = {
        activity_plan_id:
          input.activityPlanId === undefined
            ? (existing?.activity_plan_id ?? null)
            : input.activityPlanId,
        name:
          input.kind !== "enrich" && input.nameStrategy === "provided" && input.name.trim()
            ? input.name.trim()
            : completedActivityTitle({
                activityCategory: primaryActivityCategory,
                startedAt,
                ...(profile?.planningTimezone === undefined
                  ? {}
                  : { timezone: profile.planningTimezone }),
              }),
        notes: input.notes === undefined ? (existing?.notes ?? null) : input.notes,
        content_visibility: visibility,
        started_at: startedAt,
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
        canonical_evidence_tier: incomingEvidenceTier,
        segments_generated_at: now,
        updated_at: now,
      };

      await options.beforePersist?.(tx);
      try {
        if (existing) {
          const summaryValues = input.kind === "enrich" ? input.summaryValues : {};
          const {
            id: _id,
            activity_id: _activityId,
            profile_id: _profileId,
            created_at: _createdAt,
            performance_target_snapshot: _performanceTargetSnapshot,
            ...safeSummaryValues
          } = summaryValues as typeof summaryValues & {
            activity_id?: string;
            performance_target_snapshot?: unknown;
          };
          const [updated] = await tx
            .update(activities)
            .set({
              ...safeSummaryValues,
              ...baseValues,
              ...(input.kind === "enrich" ? {} : { route_id: input.routeId ?? null }),
              ...(input.kind === "enrich"
                ? {}
                : {
                    pool_length_meters: input.poolLengthMeters ?? null,
                    total_strokes: input.totalStrokes ?? null,
                    avg_swolf: input.avgSwolf ?? null,
                  }),
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
            route_id: input.routeId ?? null,
            distance_meters: input.distanceMeters,
            elevation_gain_meters: input.elevationGainMeters,
            calories: input.calories,
            avg_heart_rate: input.avgHeartRate,
            max_heart_rate: input.maxHeartRate,
            avg_power: input.avgPower,
            max_power: input.maxPower,
            avg_cadence: input.avgCadence,
            max_cadence: input.maxCadence,
            avg_speed_mps: input.avgSpeedMps,
            max_speed_mps: input.maxSpeedMps,
            normalized_speed_mps: input.normalizedSpeedMps,
            avg_temperature: input.avgTemperature,
            pool_length_meters: input.poolLengthMeters ?? null,
            total_strokes: input.totalStrokes ?? null,
            avg_swolf: input.avgSwolf ?? null,
            device_manufacturer: stringOrNull(input.deviceManufacturer),
            device_product: stringOrNull(input.deviceProduct),
            map_bounds: input.mapBounds,
            polyline: input.polyline,
            laps: laps ?? [],
            performance_target_snapshot: targetSnapshot,
            created_at: now,
          });
        }
      } catch (error) {
        throw new ActivityParentPersistenceError(error);
      }

      if (existing && evidence) {
        preInvalidatedCalibrationIdentities = await readThresholdImpactForActivity(tx, {
          profileId: input.profileId,
          activityId,
        });
        await deleteThresholdEvidenceForActivity(tx, {
          profileId: input.profileId,
          activityId,
          impacts: preInvalidatedCalibrationIdentities,
        });
      }

      let artifactId: string | undefined;
      if (ingestion) {
        const artifact = ingestion.artifact;
        if (!artifact) {
          throw new Error("Ready activity file ingestion requires an accepted artifact");
        }
        try {
          artifactId = await persistArtifactAndLink(tx, {
            activityId,
            profileId: input.profileId,
            artifact,
            providerRevision:
              input.kind === "enrich"
                ? null
                : (input.providerProvenance?.providerUpdatedAt ?? null),
            now,
          });
        } catch (error) {
          if (error instanceof ActivityArtifactLifecycleRetryableError) throw error;
          throw new ActivityArtifactPersistenceError(error);
        }
      }
      try {
        await replaceSegments(tx, {
          activityId,
          profileId: input.profileId,
          ...(artifactId === undefined ? {} : { artifactId }),
          segmentSet,
          revision,
          parserVersion,
          now,
        });
      } catch (error) {
        throw new ActivitySegmentPersistenceError(error);
      }

      if (provenance) {
        let attached: Awaited<ReturnType<typeof attachActivitySourceReference>>;
        try {
          attached = await attachActivitySourceReference(tx, {
            profileId: input.profileId,
            activityId,
            integrationId: provenance.integrationId,
            provider: provenance.connector.connectorId,
            providerExternalId: provenance.connector.externalId,
            providerRevision: provenance.providerUpdatedAt,
            ...sourceOrigin,
            ...(ingestion?.artifact?.sha256 === undefined
              ? {}
              : { artifactSha256: ingestion.artifact.sha256 }),
            ...(options.importRunId === undefined ? {} : { importRunId: options.importRunId }),
            now,
          });
        } catch (error) {
          throw new ActivitySourceReferenceError(error);
        }
        if (attached.activityId !== activityId)
          throw new Error("Canonical activity source race selected a different activity");
      }

      if (evidence) {
        let reconciliation: Awaited<
          ReturnType<typeof reconcileGeneratedActivityEvidenceWithProfileLockHeld>
        >;
        try {
          const efforts = (() => {
            try {
              return assignEffortSegments(evidence.efforts, segmentSet);
            } catch (error) {
              throw new ActivityCalibrationEvidenceError("activity_effort_segment_mismatch", error);
            }
          })();
          reconciliation = await reconcileGeneratedActivityEvidenceWithProfileLockHeld(tx, {
            activityId,
            profileId: input.profileId,
            efforts,
            detectedLTHR: evidence.detectedLTHR,
            ...(preInvalidatedCalibrationIdentities.length === 0
              ? {}
              : { preInvalidatedCalibrationIdentities }),
            ...(options.deferPerformanceCalibration === undefined
              ? {}
              : { deferPerformanceCalibration: options.deferPerformanceCalibration }),
            now,
          });
        } catch (error) {
          if (error instanceof ActivityCalibrationEvidenceError) throw error;
          throw new ActivityCalibrationEvidenceError(
            error instanceof Error && error.name === "ZodError"
              ? "activity_calibration_evidence_invalid"
              : "activity_effort_reconciliation_invalid",
            error,
          );
        }
        effortMaterialRecordedAt = reconciliation.effortMaterialRecordedAt;
      }
      if (input.kind !== "enrich" && input.composition) {
        compositionResult = await input.composition.persist(tx, { activityId, now });
      }
      if (ingestion && artifactId) {
        try {
          await persistReadyActivityFileIngestion(tx, {
            activityId,
            artifactId,
            profileId: input.profileId,
            ingestion,
            now,
          });
        } catch (error) {
          throw new ActivityFileIngestionPersistenceError(error);
        }
      }
      let athleteStateEvidence: Awaited<ReturnType<typeof materializeActivityAthleteStateEvidence>>;
      try {
        athleteStateEvidence = await materializeActivityAthleteStateEvidence(tx, {
          profileId: input.profileId,
          activityId,
          computedAt: now,
          contextDb: tx,
          canonicalEvidenceMaterialChanged,
          allowIncrementalApply: !existing && !options.deferAthleteStateRefresh,
          effortMaterialRecordedAt,
          ...(options.deferAthleteStateRefresh === undefined
            ? {}
            : { deferAthleteStateRefresh: options.deferAthleteStateRefresh }),
        });
      } catch (error) {
        throw new ActivityAthleteStateEvidenceError(error);
      }
      if (athleteStateEvidence.materialChanged && provenance && options.importRunId) {
        if (!athleteStateEvidence.effectiveAt) {
          throw new Error("Material athlete evidence is missing its effective time");
        }
        let marked: { id: string } | undefined;
        try {
          [marked] = await tx
            .update(activitySourceReferences)
            .set({
              last_material_import_run_id: options.importRunId,
              last_material_effective_at: athleteStateEvidence.effectiveAt,
              updated_at: now,
            })
            .where(
              and(
                eq(activitySourceReferences.profile_id, input.profileId),
                eq(activitySourceReferences.provider, provenance.connector.connectorId),
                eq(activitySourceReferences.provider_external_id, provenance.connector.externalId),
                eq(activitySourceReferences.activity_id, activityId),
              ),
            )
            .returning({ id: activitySourceReferences.id });
        } catch (error) {
          throw new ActivityMaterialEvidenceMarkerError(error);
        }
        if (!marked)
          throw new Error("Material activity import source marker could not be persisted");
      }
    },
  );
  return { id: activityId, compositionResult, noOp, resolutionStatus, reviewCandidateActivityId };
}
