import {
  type ActivityDerivedMetrics,
  activityObservationQuantificationSchema,
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  commonLoadResultSchema,
  createActivityQuantificationCalculationIdentity,
  createActivityQuantificationEvidenceIdentity,
  createAnalyzedActivitySegmentAnalysis,
  createCompletedActivityQuantificationSubjectIdentity,
  createObservationQuantificationBundle,
  fingerprintActivityQuantification,
  observedActivityIntensitySchema,
  parseActivityLapRecords,
} from "@repo/core";
import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  activityFileIngestions,
  activityPlans,
  activityRoutes,
  activitySourceReferences,
  follows,
  profiles,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { type getRequiredDb, withRepeatableReadSnapshot } from "../../db";
import { createActivityAnalysisStore } from "../../infrastructure/repositories";
import {
  type ActivityQuantifiedDerivedSummary,
  type ActivitySegmentDomainReadRow,
  type ActivitySegmentReadRow,
  buildActivityDerivedSummaries,
  loadActivitySegmentsByActivityId,
  mapActivityToDerivedResponse,
  mapActivityToListDerivedResponse,
} from "../../lib/activity-analysis";
import { findOwnedEffectiveSessionRpeEvidence } from "../../repositories/activity-session-rpe-repository";
import { getLikeStats, loadLikeStats } from "../../repositories/like-stats";
import { buildIndexPageInfo, parseIndexCursor } from "../../utils/index-cursor";
import {
  type ActivityCompositionMode,
  buildActivityCompositionCondition,
  describeActivityComposition,
  type MatchedCategorySummary,
  matchedCategorySortValue,
  summarizeMatchedCategory,
} from "./activity-discovery";
import { toActivityDetailDisplay, toActivityDisplayModel } from "./activity-display";

type Db = ReturnType<typeof getRequiredDb>;
type ActivityCategory = NonNullable<ActivitySegmentReadRow["activity_category"]>;

export type ActivityListQueryInput = {
  limit: number;
  cursor?: string;
  importRunId?: string;
  activity_category?: ActivityCategory;
  composition_mode: ActivityCompositionMode;
  search?: string;
  date_from?: string;
  date_to?: string;
  sort_by: "date" | "distance" | "duration" | "common_load";
  sort_order: "asc" | "desc";
};

const commonLoadSortBatchSize = 200;
export const commonLoadSortMaximumHistory = 10_000;

type ActivityRow = typeof activities.$inferSelect;
type ActivityReadRow = ActivityRow & {
  profile: { username: string | null; avatar_url: string | null } | null;
  segments: ActivitySegmentDomainReadRow[];
};

function unavailableSharedActivityQuantification(
  activity: ActivityReadRow,
  reason: "private_data" | "source_missing",
) {
  const activityCategory =
    activity.segments.find(
      (segment) => segment.role === "activity" && segment.activity_category !== null,
    )?.activity_category ?? "other";
  const computedAsOf = (activity.started_at ?? activity.created_at).toISOString();
  const commonLoad = commonLoadResultSchema.parse({
    status: "unavailable",
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    activity_category: activityCategory,
    method: null,
    quality: null,
    thresholdEvidence: null,
    evidenceFingerprint: null,
    computedAsOf,
    contributingDurationSeconds: null,
    reason: reason === "private_data" ? "private_data" : "activity_data_missing",
  });
  const subjectIdentity = createCompletedActivityQuantificationSubjectIdentity({
    activityId: activity.id,
  });
  const evidenceFacts = {
    purpose: "shared-activity-unavailable-observation",
    activityId: activity.id,
    reason,
  };
  const observedIntensity = observedActivityIntensitySchema.parse({
    status: "unavailable",
    evidenceRole: "measured",
    values: [],
    reason,
  });
  const segmentId =
    activity.segments.find((segment) => segment.role === "activity")?.id ?? activity.id;
  const observation = activityObservationQuantificationSchema.parse({
    kind: "observation",
    stage: "final",
    subjectIdentity,
    evidenceIdentity: createActivityQuantificationEvidenceIdentity({
      evidenceType: "segment_facts",
      sourceIds: [activity.id, segmentId],
      revisionFingerprint: fingerprintActivityQuantification(evidenceFacts),
      details: evidenceFacts,
    }),
    calculationIdentity: createActivityQuantificationCalculationIdentity({
      model: commonLoad.model,
      version: commonLoad.version,
      computedAt: commonLoad.computedAsOf,
      calibrationEvidenceFingerprint: commonLoad.evidenceFingerprint,
    }),
    activity_category: activityCategory,
    duration: {
      elapsed: {
        status: "unavailable",
        evidenceRole: "measured",
        value: null,
        unit: "seconds",
        reason,
      },
      active: {
        status: "unavailable",
        evidenceRole: "measured",
        value: null,
        unit: "seconds",
        reason,
      },
      moving: {
        status: "unavailable",
        evidenceRole: "measured",
        value: null,
        unit: "seconds",
        reason,
      },
    },
    distance: {
      status: "unavailable",
      evidenceRole: "measured",
      value: null,
      unit: "meters",
      reason,
    },
    intensity: {
      observed: observedIntensity,
    },
    completedProvenance: {
      activityId: activity.id,
      segmentId,
      source: "unknown",
      artifactIdentity: null,
      providerIdentity: null,
      segmentRevision: null,
      observedAt: (activity.finished_at ?? activity.created_at).toISOString(),
      computedAt: computedAsOf,
      calculationVersion: "shared-activity-unavailable-v1",
    },
    commonLoad,
  });
  return createObservationQuantificationBundle({ members: [observation] });
}

function decorateActivity(
  activity: ActivityReadRow,
  matchedCategorySummary: MatchedCategorySummary | null = null,
) {
  const {
    performance_target_snapshot: _performanceTargetSnapshot,
    segments: _segments,
    athlete_state_common_load: _athleteStateCommonLoad,
    athlete_state_activity_category: _athleteStateActivityCategory,
    athlete_state_evidence_confidence: _athleteStateEvidenceConfidence,
    athlete_state_capability_distance_meters: _athleteStateCapabilityDistanceMeters,
    athlete_state_capability_duration_minutes: _athleteStateCapabilityDurationMinutes,
    athlete_state_input_version: _athleteStateInputVersion,
    athlete_state_computed_at: _athleteStateComputedAt,
    canonical_evidence_tier: _canonicalEvidenceTier,
    ...publicActivity
  } = activity;
  return {
    ...publicActivity,
    ...describeActivityComposition(activity.segments),
    matched_category_summary: matchedCategorySummary,
  };
}

type ActivityMetricCandidate = {
  activity: ActivityReadRow;
  derived: ActivityQuantifiedDerivedSummary | null;
  matchedCategorySummary: MatchedCategorySummary | null;
};

function compareMetricCandidates(
  a: ActivityMetricCandidate,
  b: ActivityMetricCandidate,
  sortBy: "distance" | "duration" | "common_load",
  sortOrder: ActivityListQueryInput["sort_order"],
) {
  const aValue = a.matchedCategorySummary
    ? matchedCategorySortValue(a.matchedCategorySummary, sortBy)
    : a.derived?.common_load && "load" in a.derived.common_load
      ? a.derived.common_load.load
      : null;
  const bValue = b.matchedCategorySummary
    ? matchedCategorySortValue(b.matchedCategorySummary, sortBy)
    : b.derived?.common_load && "load" in b.derived.common_load
      ? b.derived.common_load.load
      : null;
  if (aValue !== bValue) {
    if (aValue === null) return 1;
    if (bValue === null) return -1;
    return sortOrder === "asc" ? aValue - bValue : bValue - aValue;
  }

  const startedAtDifference =
    (b.activity.started_at?.getTime() ?? Number.NEGATIVE_INFINITY) -
    (a.activity.started_at?.getTime() ?? Number.NEGATIVE_INFINITY);
  return startedAtDifference || a.activity.id.localeCompare(b.activity.id);
}

export function normalizeActivityLaps<T extends typeof activities.$inferSelect>(activity: T): T {
  return { ...activity, laps: parseActivityLapRecords(activity.laps) };
}

async function loadActivityOwnerProfiles(db: Db, profileIds: readonly string[]) {
  const uniqueProfileIds = [...new Set(profileIds)];
  if (uniqueProfileIds.length === 0) {
    return new Map<string, { username: string | null; avatar_url: string | null }>();
  }

  const rows = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      full_name: profiles.full_name,
      avatar_url: profiles.avatar_url,
    })
    .from(profiles)
    .where(inArray(profiles.id, uniqueProfileIds));
  return new Map(
    rows.map((profile) => [
      profile.id,
      {
        username: profile.username?.trim() || profile.full_name?.trim() || null,
        avatar_url: profile.avatar_url,
      },
    ]),
  );
}

export async function listActivitiesForProfile({
  db,
  profileId,
  input,
}: {
  db: Db;
  profileId: string;
  input: ActivityListQueryInput;
}) {
  const offset = parseIndexCursor(input.cursor);
  const conditions = [
    eq(activities.profile_id, profileId),
    isNull(activities.superseded_by_activity_id),
  ];
  if (input.importRunId)
    conditions.push(
      exists(
        db
          .select({ activityId: activitySourceReferences.activity_id })
          .from(activitySourceReferences)
          .where(
            and(
              eq(activitySourceReferences.activity_id, activities.id),
              eq(activitySourceReferences.profile_id, profileId),
              eq(activitySourceReferences.last_import_run_id, input.importRunId),
            ),
          ),
      ),
    );
  const compositionCondition = buildActivityCompositionCondition({
    activityId: activities.id,
    ...(input.activity_category === undefined
      ? {}
      : { activity_category: input.activity_category }),
    ...(input.composition_mode === undefined ? {} : { mode: input.composition_mode }),
  });
  if (compositionCondition) conditions.push(compositionCondition);
  if (input.search) {
    const searchCondition = or(
      ilike(activities.name, `%${input.search}%`),
      ilike(activities.notes, `%${input.search}%`),
    );
    if (searchCondition) conditions.push(searchCondition);
  }
  if (input.date_from) conditions.push(gte(activities.started_at, new Date(input.date_from)));
  if (input.date_to) conditions.push(lte(activities.started_at, new Date(input.date_to)));
  const whereClause = and(...conditions);
  const distance = sql<number>`${activities.distance_meters}`;
  const duration = sql<number>`coalesce(${activities.active_ms}, ${activities.elapsed_ms})`;
  const requiresBoundedMetricScan =
    input.sort_by === "common_load" ||
    (input.activity_category !== undefined &&
      (input.sort_by === "distance" || input.sort_by === "duration"));
  if (requiresBoundedMetricScan) {
    return withRepeatableReadSnapshot(db, async (tx) => {
      // Drizzle transactions expose the read APIs used below but intentionally omit the
      // root client's `$client` property from their type.
      const snapshotDb = tx as unknown as Db;
      const measurementWhere = and(whereClause, isNotNull(activities.started_at));
      const totalRows = await tx
        .select({ total: count() })
        .from(activities)
        .where(measurementWhere);
      const total = Number(totalRows[0]?.total ?? 0);
      // Exact sorting by dynamically derived Common Load is necessarily O(N). The explicit ceiling
      // bounds request memory/CPU while keeping the existing index cursor and global ordering
      // contract truthful. Callers above the ceiling must narrow the activity filters.
      if (total > commonLoadSortMaximumHistory) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            input.sort_by === "common_load"
              ? `Common Load sorting supports at most ${commonLoadSortMaximumHistory} matching activities; narrow the activity filters.`
              : `ActivityCategory metric sorting supports at most ${commonLoadSortMaximumHistory} matching activities; narrow the activity filters.`,
        });
      }

      // Scan the transaction snapshot by the stable (started_at, id) key instead of offset so
      // every internal batch has an indexable plan and cannot skip/duplicate rows. Evidence and
      // likes are loaded through the same transaction, preserving one repeatable-read snapshot.
      const candidates: ActivityMetricCandidate[] = [];
      let scanCursor: { id: string; started_at: Date } | undefined;
      while (candidates.length < total) {
        const scanWhere = scanCursor
          ? and(
              measurementWhere,
              or(
                lt(activities.started_at, scanCursor.started_at),
                and(
                  eq(activities.started_at, scanCursor.started_at),
                  lt(activities.id, scanCursor.id),
                ),
              ),
            )
          : measurementWhere;
        const batch = (await tx
          .select()
          .from(activities)
          .where(scanWhere)
          .orderBy(desc(activities.started_at), desc(activities.id))
          .limit(Math.min(commonLoadSortBatchSize, total - candidates.length))) as ActivityRow[];
        if (batch.length === 0) break;

        const normalizedBatch = batch.map(normalizeActivityLaps);
        const [ownerProfiles, segments] = await Promise.all([
          loadActivityOwnerProfiles(
            snapshotDb,
            normalizedBatch.map((activity) => activity.profile_id),
          ),
          loadActivitySegmentsByActivityId(
            snapshotDb,
            normalizedBatch.map((activity) => activity.id),
          ),
        ]);
        candidates.push(
          ...normalizedBatch.map((activity) => ({
            activity: {
              ...activity,
              profile: ownerProfiles.get(activity.profile_id) ?? null,
              segments: segments.get(activity.id) ?? [],
            },
            derived: null,
            matchedCategorySummary: null,
          })),
        );
        const lastActivity = normalizedBatch.at(-1);
        if (!lastActivity || batch.length < commonLoadSortBatchSize) break;
        if (lastActivity.started_at === null) break;
        scanCursor = { id: lastActivity.id, started_at: lastActivity.started_at };
      }

      const analysisStore = createActivityAnalysisStore(snapshotDb);
      const analysis = await buildActivityDerivedSummaries({
        store: analysisStore,
        profileId,
        activities: candidates.map(({ activity }) => activity),
      });
      const derivedByActivityId = analysis.parent;
      const segmentDerived = analysis.segments;
      const segmentDerivedByActivityId = new Map<string, typeof segmentDerived>();
      for (const summary of segmentDerived) {
        segmentDerivedByActivityId.set(summary.activity_id, [
          ...(segmentDerivedByActivityId.get(summary.activity_id) ?? []),
          summary,
        ]);
      }
      for (const candidate of candidates) {
        const derivedSegments = segmentDerivedByActivityId.get(candidate.activity.id);
        candidate.derived = derivedByActivityId.get(candidate.activity.id) ?? null;
        candidate.matchedCategorySummary = input.activity_category
          ? summarizeMatchedCategory({
              segments: candidate.activity.segments,
              activity_category: input.activity_category,
              ...(derivedSegments === undefined ? {} : { derivedSegments }),
            })
          : null;
      }

      const page = candidates
        .sort((a, b) =>
          compareMetricCandidates(
            a,
            b,
            input.sort_by as "distance" | "duration" | "common_load",
            input.sort_order,
          ),
        )
        .slice(offset, offset + input.limit);
      const likeStats = await loadLikeStats(snapshotDb, {
        entityType: "activity",
        entityIds: page.map(({ activity }) => activity.id),
        viewerProfileId: profileId,
      });
      const items = page.map(({ activity, derived, matchedCategorySummary }) => {
        const item = mapActivityToListDerivedResponse({
          activity: {
            ...decorateActivity(activity, matchedCategorySummary),
            likes_count: getLikeStats(likeStats, activity.id).likes_count,
          },
          has_liked: getLikeStats(likeStats, activity.id).has_liked,
          derived,
          segment_loads: segmentDerivedByActivityId.get(activity.id) ?? [],
        });
        return toActivityDisplayModel({ activity: item, viewerId: profileId });
      });
      return {
        items,
        total,
        ...buildIndexPageInfo({ offset, limit: input.limit, total }),
      };
    });
  }

  const rowsPromise =
    input.sort_by === "distance" || input.sort_by === "duration"
      ? db
          .select({ activity: activities })
          .from(activities)
          .where(whereClause)
          .orderBy(
            input.sort_order === "asc"
              ? input.sort_by === "distance"
                ? distance
                : duration
              : sql`${input.sort_by === "distance" ? distance : duration} desc nulls last`,
            desc(activities.started_at),
            asc(activities.id),
          )
          .limit(input.limit)
          .offset(offset)
      : db
          .select({ activity: activities })
          .from(activities)
          .where(whereClause)
          .orderBy(
            input.sort_order === "asc" ? activities.started_at : desc(activities.started_at),
            asc(activities.id),
          )
          .limit(input.limit)
          .offset(offset);
  const totalRowsPromise = db.select({ total: count() }).from(activities).where(whereClause);

  const [totalRows, rawRows] = await Promise.all([totalRowsPromise, rowsPromise]);
  const total = Number(totalRows[0]?.total ?? 0);
  const activityRows = rawRows.map((row) => row.activity);
  const normalized = activityRows.map(normalizeActivityLaps);
  const [ownerProfiles, segments] = await Promise.all([
    loadActivityOwnerProfiles(
      db,
      normalized.map((activity) => activity.profile_id),
    ),
    loadActivitySegmentsByActivityId(
      db,
      normalized.map((activity) => activity.id),
    ),
  ]);
  const data: ActivityReadRow[] = normalized.map((activity) => ({
    ...activity,
    profile: ownerProfiles.get(activity.profile_id) ?? null,
    segments: segments.get(activity.id) ?? [],
  }));
  const analysisStore = createActivityAnalysisStore(db);
  const analysis = await buildActivityDerivedSummaries({
    store: analysisStore,
    profileId,
    activities: data,
  });
  const derived = analysis.parent;
  const segmentDerived = analysis.segments;
  const segmentDerivedByActivityId = new Map<string, typeof segmentDerived>();
  for (const summary of segmentDerived) {
    segmentDerivedByActivityId.set(summary.activity_id, [
      ...(segmentDerivedByActivityId.get(summary.activity_id) ?? []),
      summary,
    ]);
  }
  const ids = data.map((activity) => activity.id);
  const likeStats = await loadLikeStats(db, {
    entityType: "activity",
    entityIds: ids,
    viewerProfileId: profileId,
  });
  const items = data.map((activity) => {
    const derivedSegments = segmentDerivedByActivityId.get(activity.id);
    const item = mapActivityToListDerivedResponse({
      activity: {
        ...decorateActivity(
          activity,
          input.activity_category
            ? summarizeMatchedCategory({
                segments: activity.segments,
                activity_category: input.activity_category,
                ...(derivedSegments === undefined ? {} : { derivedSegments }),
              })
            : null,
        ),
        likes_count: getLikeStats(likeStats, activity.id).likes_count,
      },
      has_liked: getLikeStats(likeStats, activity.id).has_liked,
      derived: derived.get(activity.id) ?? null,
      segment_loads: derivedSegments ?? [],
    });
    return toActivityDisplayModel({ activity: item, viewerId: profileId });
  });
  return {
    items,
    total,
    ...buildIndexPageInfo({ offset, limit: input.limit, total }),
  };
}

export async function getActivityByIdForViewer({
  db,
  activityId,
  viewerId,
}: {
  db: Db;
  activityId: string;
  viewerId: string;
}) {
  const access = await db.query.activities.findFirst({
    columns: { profile_id: true, content_visibility: true },
    where: eq(activities.id, activityId),
  });
  if (!access) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You don't have permission to view this activity",
    });
  }
  const visibility = access.content_visibility;
  const isAcceptedFollower =
    visibility === "followers" && access?.profile_id !== viewerId
      ? Boolean(
          (
            await db
              .select({ followerId: follows.follower_id })
              .from(follows)
              .where(
                and(
                  eq(follows.follower_id, viewerId),
                  eq(follows.following_id, access.profile_id),
                  eq(follows.status, "accepted"),
                ),
              )
              .limit(1)
          )[0],
        )
      : false;
  if (
    !canViewActivityVisibility({
      ownerId: access.profile_id,
      viewerId,
      visibility,
      isAcceptedFollower,
    })
  )
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You don't have permission to view this activity",
    });
  const [record, likeStats, ingestion, currentArtifact] = await Promise.all([
    db
      .select({ activity: activities, activityPlan: activityPlans, activityRoute: activityRoutes })
      .from(activities)
      .leftJoin(activityPlans, eq(activities.activity_plan_id, activityPlans.id))
      .leftJoin(activityRoutes, eq(activities.route_id, activityRoutes.id))
      .where(eq(activities.id, activityId))
      .limit(1),
    loadLikeStats(db, {
      entityType: "activity",
      entityIds: [activityId],
      viewerProfileId: viewerId,
    }),
    db.query.activityFileIngestions?.findFirst({
      columns: {
        id: true,
        status: true,
        source: true,
        failure_code: true,
      },
      where: and(
        eq(activityFileIngestions.activity_id, activityId),
        eq(activityFileIngestions.profile_id, viewerId),
      ),
      orderBy: desc(activityFileIngestions.updated_at),
    }) ?? Promise.resolve(undefined),
    db
      .select({
        id: activityArtifacts.id,
        digest_algorithm: activityArtifacts.digest_algorithm,
        digest: activityArtifacts.digest,
        byte_size: activityArtifacts.byte_size,
        media_type: activityArtifacts.media_type,
        format: activityArtifacts.format,
        original_name: activityArtifacts.original_name,
        availability: activityArtifacts.availability,
        first_accepted_at: activityArtifacts.first_accepted_at,
      })
      .from(activityArtifactLinks)
      .innerJoin(activityArtifacts, eq(activityArtifacts.id, activityArtifactLinks.artifact_id))
      .where(
        and(
          eq(activityArtifactLinks.activity_id, activityId),
          eq(activityArtifactLinks.role, "source"),
          eq(activityArtifactLinks.is_current, true),
          eq(activityArtifacts.availability, "accepted"),
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);
  const row = record[0];
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Activity not found" });
  const normalizedActivity = normalizeActivityLaps(row.activity);
  const [ownerProfiles, segments] = await Promise.all([
    loadActivityOwnerProfiles(db, [normalizedActivity.profile_id]),
    loadActivitySegmentsByActivityId(db, [normalizedActivity.id]),
  ]);
  const activity: ActivityReadRow = {
    ...normalizedActivity,
    profile: ownerProfiles.get(normalizedActivity.profile_id) ?? null,
    segments: segments.get(normalizedActivity.id) ?? [],
  };
  const sharedQuantification = unavailableSharedActivityQuantification(
    activity,
    activity.profile_id === viewerId ? "source_missing" : "private_data",
  );
  const derived: ActivityDerivedMetrics & {
    observationQuantification: typeof sharedQuantification;
  } = {
    stress: {
      common_load: sharedQuantification.summary.commonLoad,
      trimp: null,
      trimp_source: null,
      training_effect: null,
    },
    zones: { hr: [], power: [] },
    computed_as_of: (activity.started_at ?? activity.created_at).toISOString(),
    observationQuantification: sharedQuantification,
  };
  const ownedAnalysis =
    activity.profile_id === viewerId
      ? await buildActivityDerivedSummaries({
          store: createActivityAnalysisStore(db),
          profileId: activity.profile_id,
          activities: [activity],
        })
      : null;
  const parentDerived = ownedAnalysis?.parent.get(activity.id);
  const resolvedDerived: ActivityDerivedMetrics & {
    observationQuantification: typeof sharedQuantification;
  } = parentDerived
    ? (() => {
        const { computed_as_of, observationQuantification, ...parentStress } = parentDerived;
        return {
          stress: {
            ...parentStress,
            trimp: null,
            trimp_source: null,
            training_effect: null,
          },
          zones: { hr: [], power: [] },
          computed_as_of,
          observationQuantification,
        };
      })()
    : derived;
  // Session RPE is deliberately owner-only even when the activity itself is
  // shared. It is manually-entered health/training evidence rather than
  // activity metadata covered by the activity visibility contract.
  const effectiveSessionRpe =
    activity.profile_id === viewerId
      ? await findOwnedEffectiveSessionRpeEvidence(db, {
          activityId,
          profileId: activity.profile_id,
        })
      : null;
  const response = mapActivityToDerivedResponse({
    activity: {
      ...decorateActivity(activity),
      likes_count: getLikeStats(likeStats, activityId).likes_count,
      activity_plans:
        activity.profile_id === viewerId && row.activityPlan
          ? {
              ...row.activityPlan,
              created_at:
                row.activityPlan.created_at instanceof Date
                  ? row.activityPlan.created_at.toISOString()
                  : row.activityPlan.created_at,
              updated_at:
                row.activityPlan.updated_at instanceof Date
                  ? row.activityPlan.updated_at.toISOString()
                  : row.activityPlan.updated_at,
            }
          : null,
    },
    has_liked: getLikeStats(likeStats, activityId).has_liked,
    derived: resolvedDerived,
    segment_loads: ownedAnalysis?.segments ?? [],
  });
  const display = toActivityDisplayModel({
    activity: {
      ...response.activity,
      derived: response.derived,
      has_liked: response.has_liked,
    },
    viewerId,
  });
  const activityDetailSource: Parameters<typeof toActivityDetailDisplay>[0]["activity"] = {
    ...response.activity,
    activity_plans: response.activity.activity_plans ?? null,
    activity_routes:
      activity.profile_id === viewerId && row.activityRoute
        ? { id: row.activityRoute.id, name: row.activityRoute.name }
        : null,
    segments: activity.segments.map((segment) => ({
      id: segment.id,
      activity_id: segment.activity_id,
      ordinal: segment.ordinal,
      role: segment.role,
      activity_category: segment.activity_category,
      start_offset_ms: segment.start_offset_ms,
      end_offset_ms: segment.end_offset_ms,
      source_artifact_id: segment.source_artifact_id,
      source_session_index: segment.source_session_index,
      source_message_index: segment.source_message_index,
      raw_type_string: segment.raw_type_string,
      raw_type_integer: segment.raw_type_integer,
      raw_sport_string: segment.raw_sport_string,
      raw_sport_integer: segment.raw_sport_integer,
      raw_sub_sport_string: segment.raw_sub_sport_string,
      raw_sub_sport_integer: segment.raw_sub_sport_integer,
      timing_coverage: segment.timing_coverage,
      active_ms: segment.active_ms,
      moving_ms: segment.moving_ms,
      ...createAnalyzedActivitySegmentAnalysis(segment.summary),
    })),
    current_artifact: currentArtifact
      ? {
          id: currentArtifact.id,
          format: currentArtifact.format,
          original_name: currentArtifact.original_name,
          availability: "accepted",
        }
      : null,
    ingestion: ingestion ?? null,
    effective_session_rpe: effectiveSessionRpe
      ? {
          id: effectiveSessionRpe.id,
          rpe: effectiveSessionRpe.rpe,
          scale: "borg_cr10",
          scale_version: "1",
          source: effectiveSessionRpe.source,
          recorded_at: effectiveSessionRpe.recordedAt,
          corrected_at: effectiveSessionRpe.correctedAt,
        }
      : null,
  };
  return {
    detail: toActivityDetailDisplay({
      display,
      activity: activityDetailSource,
    }),
    analysis: {
      derived: response.derived,
      segmentLoads: response.segment_loads,
    },
  };
}

export function canViewActivityVisibility(input: {
  ownerId: string;
  viewerId: string;
  visibility: "private" | "followers" | "public";
  isAcceptedFollower: boolean;
}) {
  if (input.ownerId === input.viewerId) return true;
  if (input.visibility === "public") return true;
  return input.visibility === "followers" && input.isAcceptedFollower;
}
