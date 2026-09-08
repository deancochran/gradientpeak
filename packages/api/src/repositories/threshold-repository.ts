import { createHash } from "node:crypto";
import {
  advanceThresholdLifecycle,
  getThresholdActivityCategoryPolicy,
  THRESHOLD_LIFECYCLE_STATE_VERSION,
  type ThresholdActivityCategory,
  type ThresholdCandidate,
  type ThresholdEvaluation,
  type ThresholdEvidence,
  type ThresholdLifecycleResult,
  type ThresholdLifecycleState,
  type ThresholdMetric,
  type ThresholdSelectionDecision,
  type ThresholdSelectionResult,
  thresholdLifecycleStateSchema,
} from "@repo/core/performance-calibration";
import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  activitySegments,
  thresholdEvaluationEfforts,
  thresholdEvaluations,
  thresholds,
} from "@repo/db";
import { and, asc, eq, gt, gte, inArray, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  type DrizzleQueryExecutor,
  type DrizzleTransactionClient,
  withRepeatableReadSnapshot,
} from "../db";

export type ThresholdIdentity = {
  activityCategory: ThresholdActivityCategory;
  metric: ThresholdMetric;
};
export type ThresholdEffortSourceSeries =
  | "power"
  | "grade_adjusted_speed"
  | "raw_speed"
  | "swim_speed"
  | "heart_rate";
export type ActivityEffortSourceSeries = ThresholdEffortSourceSeries;

export type ThresholdEffortLink = {
  effortId: string;
  activityId: string;
  sourceRevision: number;
  effortType: "power" | "speed" | "heart_rate";
  sourceSeries: ThresholdEffortSourceSeries;
  role: "primary" | "supporting";
  ordinal: number;
};

export type ThresholdImpact = ThresholdIdentity & { effectiveAt: Date };

type StoredEvaluationDiagnostics = {
  selection: ThresholdSelectionResult;
  candidate: ThresholdCandidate | null;
};

export type ThresholdAsOfFact = {
  id: string;
  status: "available";
  activityCategory: ThresholdActivityCategory;
  metric: ThresholdMetric;
  unit: "watts" | "meters_per_second" | "bpm";
  method: "bike_power_30m" | "run_speed_30m" | "swim_speed_15m" | "lthr_30m_final_20m";
  value: number;
  effectiveAt: string;
  policyVersion: string;
  state: "provisional" | "confirmed";
  confidence: number;
  sourceEvaluationIds: string[];
  sourceEffortIds: string[];
  sourceActivityIds: string[];
};

export const THRESHOLD_AS_OF_BATCH_REQUEST_LIMIT = 525;
const THRESHOLD_REBUILD_PAGE_SIZE = 128;

const directThresholdRowSchema = z.object({
  ordinal: z.coerce.number().int().nonnegative(),
  id: z.string().uuid(),
  activity_category: z.enum(["bike", "run", "swim"]),
  metric: z.enum(["power", "speed", "lthr"]),
  value: z.coerce.number().positive(),
  unit: z.enum(["watts", "meters_per_second", "bpm"]),
  confidence: z.coerce.number().min(0).max(1),
  method: z.enum(["bike_power_30m", "run_speed_30m", "swim_speed_15m", "lthr_30m_final_20m"]),
  effective_at: z.coerce.date(),
  policy_version: z.string().min(1),
  evaluation_id: z.string().uuid(),
  state: z.enum(["provisional", "confirmed"]),
});

const directThresholdProvenanceRowSchema = z.object({
  published_evaluation_id: z.string().uuid(),
  origin_evaluation_id: z.string().uuid(),
  effort_id: z.string().uuid(),
  source_activity_id: z.string().uuid(),
  role: z.enum(["primary", "supporting"]),
  ordinal: z.coerce.number().int().nonnegative(),
});

const currentThresholdLifecycleRowSchema = z.object({
  id: z.string().uuid(),
  evaluation_id: z.string().uuid(),
  value: z.coerce.number().positive(),
  unit: z.enum(["watts", "meters_per_second", "bpm"]),
  method: z.enum(["bike_power_30m", "run_speed_30m", "swim_speed_15m", "lthr_30m_final_20m"]),
  effective_at: z.coerce.date(),
  policy_version: z.string().min(1),
  supersedes_id: z.string().uuid().nullable(),
  superseded_value: z.coerce.number().positive().nullable(),
  source_activity_id: z.string().uuid(),
  observed_at: z.coerce.date(),
  state: z.enum(["provisional", "confirmed"]),
});

function deterministicUuid(identity: string): string {
  const bytes = createHash("sha256").update(identity).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function identityKey(identity: ThresholdIdentity): string {
  return `${identity.activityCategory}/${identity.metric}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function parseStoredDiagnostics(value: unknown): StoredEvaluationDiagnostics {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Threshold evaluation diagnostics are not an object");
  }
  const diagnostics = value as Partial<StoredEvaluationDiagnostics>;
  if (!diagnostics.selection) {
    throw new Error("Threshold evaluation selection diagnostics are missing");
  }
  return {
    selection: diagnostics.selection,
    candidate: diagnostics.candidate ?? null,
  };
}

async function readDirectThresholdProvenance(
  db: DrizzleQueryExecutor,
  evaluationIds: readonly string[],
) {
  const provenanceResult = await db.execute(sql`
    with published(evaluation_id) as materialized (
      select value::uuid
      from jsonb_array_elements_text(${JSON.stringify(evaluationIds)}::jsonb)
    )
    select selected.evaluation_id as published_evaluation_id,
      origin.evaluation_id as origin_evaluation_id,
      selected.effort_id,
      origin_evaluation.source_activity_id,
      selected.role,
      selected.ordinal
    from published
    join threshold_evaluation_efforts selected
      on selected.evaluation_id = published.evaluation_id
    join threshold_evaluations published_evaluation
      on published_evaluation.id = selected.evaluation_id
    join threshold_evaluation_efforts origin
      on origin.effort_id = selected.effort_id
     and origin.role = 'primary'
    join threshold_evaluations origin_evaluation
      on origin_evaluation.id = origin.evaluation_id
     and origin_evaluation.profile_id = published_evaluation.profile_id
     and origin_evaluation.activity_category = published_evaluation.activity_category
     and origin_evaluation.metric = published_evaluation.metric
     and origin_evaluation.policy_version = published_evaluation.policy_version
     and origin_evaluation.outcome = 'qualified'
    order by selected.evaluation_id,
      case selected.role when 'supporting' then 0 else 1 end,
      selected.ordinal,
      selected.effort_id
  `);
  const rows = provenanceResult.rows.map((row) => directThresholdProvenanceRowSchema.parse(row));
  const byEvaluation = new Map<string, typeof rows>();
  for (const row of rows) {
    byEvaluation.set(row.published_evaluation_id, [
      ...(byEvaluation.get(row.published_evaluation_id) ?? []),
      row,
    ]);
  }
  return byEvaluation;
}

export function thresholdEvaluationId(input: {
  profileId: string;
  sourceActivityId: string;
  sourceRevision: number;
  identity: ThresholdIdentity;
  method: string;
  policyVersion: string;
}): string {
  return deterministicUuid(
    `threshold-evaluation:${input.profileId}:${input.sourceActivityId}:${input.sourceRevision}:${identityKey(input.identity)}:${input.method}:${input.policyVersion}`,
  );
}

export function thresholdEffortId(input: {
  activityId: string;
  segmentId: string;
  sourceArtifactId: string;
  sourceRevision: number;
  effortType: string;
  sourceSeries: ActivityEffortSourceSeries;
  startOffsetMs: number;
  endOffsetMs: number;
  method: string;
  calculationVersion: string;
}): string {
  return deterministicUuid(
    [
      "activity-effort",
      input.activityId,
      input.segmentId,
      input.sourceArtifactId,
      input.sourceRevision,
      input.effortType,
      input.sourceSeries,
      input.startOffsetMs,
      input.endOffsetMs,
      input.method,
      input.calculationVersion,
    ].join(":"),
  );
}

/** Accepted, current, profile-owned activity segments used by threshold qualification. */
export async function readThresholdEvidenceSources(
  db: DrizzleQueryExecutor,
  input: { profileId: string; activityId: string },
) {
  return db
    .select({
      finishedAt: activities.finished_at,
      sourceRevision: activities.segments_revision,
      segmentId: activitySegments.id,
      activityCategory: activitySegments.activity_category,
      sourceArtifactId: activitySegments.source_artifact_id,
      summary: activitySegments.summary,
    })
    .from(activities)
    .innerJoin(
      activitySegments,
      and(
        eq(activitySegments.activity_id, activities.id),
        eq(activitySegments.profile_id, activities.profile_id),
        eq(activitySegments.role, "activity"),
        eq(activitySegments.segment_revision, activities.segments_revision),
      ),
    )
    .innerJoin(
      activityArtifactLinks,
      and(
        eq(activityArtifactLinks.activity_id, activities.id),
        eq(activityArtifactLinks.profile_id, activities.profile_id),
        eq(activityArtifactLinks.artifact_id, activitySegments.source_artifact_id),
        eq(activityArtifactLinks.role, "source"),
        eq(activityArtifactLinks.is_current, true),
      ),
    )
    .innerJoin(
      activityArtifacts,
      and(
        eq(activityArtifacts.id, activityArtifactLinks.artifact_id),
        eq(activityArtifacts.profile_id, activityArtifactLinks.profile_id),
        eq(activityArtifacts.availability, "accepted"),
      ),
    )
    .where(and(eq(activities.id, input.activityId), eq(activities.profile_id, input.profileId)))
    .orderBy(asc(activitySegments.ordinal));
}

export async function readQualifiedThresholdEvidence(
  db: DrizzleQueryExecutor,
  input: { profileId: string; identity: ThresholdIdentity; asOf: Date },
): Promise<ThresholdEvidence[]> {
  const evidence: ThresholdEvidence[] = [];
  let cursor: { observedAt: Date; id: string } | undefined;
  for (;;) {
    const page = await readQualifiedThresholdEvidencePage(db, {
      ...input,
      ...(cursor !== undefined ? { cursor } : {}),
    });
    evidence.push(...page);
    const last = page.at(-1);
    if (!last || page.length < THRESHOLD_REBUILD_PAGE_SIZE) return evidence;
    cursor = { observedAt: new Date(last.observedAt), id: last.evidenceId };
  }
}

async function readQualifiedThresholdEvidencePage(
  db: DrizzleQueryExecutor,
  input: {
    profileId: string;
    identity: ThresholdIdentity;
    asOf: Date;
    cursor?: { observedAt: Date; id: string };
    earliestObservedAt?: Date;
  },
): Promise<ThresholdEvidence[]> {
  const policy = getThresholdActivityCategoryPolicy(
    input.identity.activityCategory,
    input.identity.metric,
  );
  const rows = await db
    .select({
      id: thresholdEvaluations.id,
      activityId: thresholdEvaluations.source_activity_id,
      observedAt: thresholdEvaluations.observed_at,
      diagnostics: thresholdEvaluations.diagnostics,
    })
    .from(thresholdEvaluations)
    .where(
      and(
        eq(thresholdEvaluations.profile_id, input.profileId),
        eq(thresholdEvaluations.activity_category, input.identity.activityCategory),
        eq(thresholdEvaluations.metric, input.identity.metric),
        eq(thresholdEvaluations.method, policy.method),
        eq(thresholdEvaluations.policy_version, policy.policyVersion),
        eq(thresholdEvaluations.outcome, "qualified"),
        lte(thresholdEvaluations.observed_at, input.asOf),
        input.earliestObservedAt
          ? gte(thresholdEvaluations.observed_at, input.earliestObservedAt)
          : undefined,
        input.cursor
          ? or(
              gt(thresholdEvaluations.observed_at, input.cursor.observedAt),
              and(
                eq(thresholdEvaluations.observed_at, input.cursor.observedAt),
                gt(thresholdEvaluations.id, input.cursor.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(asc(thresholdEvaluations.observed_at), asc(thresholdEvaluations.id))
    .limit(THRESHOLD_REBUILD_PAGE_SIZE);
  return rows.map((row) => {
    const candidate = parseStoredDiagnostics(row.diagnostics).candidate;
    if (candidate === null) throw new Error("Qualified threshold evaluation has no candidate");
    return {
      ...candidate,
      evidenceId: row.id,
      activityId: row.activityId,
      observedAt: row.observedAt.toISOString(),
    };
  });
}

export async function readPrimaryThresholdEffortsByEvaluation(
  db: DrizzleQueryExecutor,
  evaluationIds: readonly string[],
) {
  if (evaluationIds.length === 0) return new Map<string, ThresholdEffortLink>();
  const rows: Array<{
    evaluationId: string;
    effortId: string;
    activityId: string;
    sourceRevision: number;
    effortType: string;
    sourceSeries: string;
  }> = [];
  for (let offset = 0; offset < evaluationIds.length; offset += THRESHOLD_REBUILD_PAGE_SIZE) {
    rows.push(
      ...(await db
        .select({
          evaluationId: thresholdEvaluationEfforts.evaluation_id,
          effortId: thresholdEvaluationEfforts.effort_id,
          activityId: thresholdEvaluationEfforts.activity_id,
          sourceRevision: thresholdEvaluationEfforts.source_revision,
          effortType: thresholdEvaluationEfforts.effort_type,
          sourceSeries: thresholdEvaluationEfforts.source_series,
        })
        .from(thresholdEvaluationEfforts)
        .where(
          and(
            inArray(
              thresholdEvaluationEfforts.evaluation_id,
              evaluationIds.slice(offset, offset + THRESHOLD_REBUILD_PAGE_SIZE),
            ),
            eq(thresholdEvaluationEfforts.role, "primary"),
          ),
        )),
    );
  }
  return new Map(
    rows.flatMap((row) =>
      (row.effortType === "power" ||
        row.effortType === "speed" ||
        row.effortType === "heart_rate") &&
      (row.sourceSeries === "power" ||
        row.sourceSeries === "grade_adjusted_speed" ||
        row.sourceSeries === "raw_speed" ||
        row.sourceSeries === "swim_speed" ||
        row.sourceSeries === "heart_rate")
        ? [
            [
              row.evaluationId,
              {
                effortId: row.effortId,
                activityId: row.activityId,
                sourceRevision: row.sourceRevision,
                effortType: row.effortType,
                sourceSeries: row.sourceSeries,
                role: "primary" as const,
                ordinal: 0,
              },
            ] as const,
          ]
        : [],
    ),
  );
}

function sameEvaluation(
  existing: typeof thresholdEvaluations.$inferSelect,
  desired: typeof thresholdEvaluations.$inferInsert,
): boolean {
  return (
    existing.id === desired.id &&
    existing.profile_id === desired.profile_id &&
    existing.activity_category === desired.activity_category &&
    existing.metric === desired.metric &&
    existing.method === desired.method &&
    existing.outcome === desired.outcome &&
    existing.value === (desired.value ?? null) &&
    existing.unit === desired.unit &&
    existing.confidence === (desired.confidence ?? null) &&
    existing.observed_at.getTime() === (desired.observed_at as Date).getTime() &&
    existing.rejection_reason === (desired.rejection_reason ?? null) &&
    existing.policy_version === desired.policy_version &&
    existing.source_activity_id === desired.source_activity_id &&
    existing.source_revision === desired.source_revision &&
    canonicalJson(existing.diagnostics) === canonicalJson(desired.diagnostics)
  );
}

function effortLinkValues(
  evaluationId: string,
  profileId: string,
  identity: ThresholdIdentity,
  links: readonly ThresholdEffortLink[],
) {
  return links.map((link) => ({
    evaluation_id: evaluationId,
    effort_id: link.effortId,
    profile_id: profileId,
    activity_category: identity.activityCategory,
    activity_id: link.activityId,
    source_revision: link.sourceRevision,
    metric: identity.metric,
    effort_type: link.effortType,
    source_series: link.sourceSeries,
    role: link.role,
    ordinal: link.ordinal,
  }));
}

function validateEffortLinks(links: readonly ThresholdEffortLink[]) {
  const unique = new Set(links.map((link) => link.effortId));
  if (unique.size !== links.length) throw new Error("Threshold effort links must be unique");
  if (links.filter((link) => link.role === "primary").length > 1) {
    throw new Error("Threshold evaluation cannot have multiple primary efforts");
  }
}

function orderedEffortLinks(links: readonly ThresholdEffortLink[]) {
  return [...links].sort(
    (left, right) =>
      left.role.localeCompare(right.role) ||
      left.ordinal - right.ordinal ||
      left.effortId.localeCompare(right.effortId),
  );
}

/** @internal Reconstructs the lifecycle reason from immutable persisted chain evidence. */
export function reconstructThresholdPublicationReason(input: {
  hasSupportingProvenance: boolean;
  value: number;
  supersedesId: string | null;
  supersededValue: number | null;
  materialChangeRelativeThreshold: number;
}): ThresholdSelectionDecision["publicationReason"] {
  if (input.hasSupportingProvenance) {
    if (input.supersededValue === null) {
      throw new Error("Supported threshold publication has no superseded value");
    }
    return input.value <= input.supersededValue * (1 - input.materialChangeRelativeThreshold)
      ? "supported_decrease"
      : "independent_confirmation";
  }
  return input.supersedesId === null ? "first_qualified_candidate" : "material_increase";
}

async function readThresholdEffortLinks(
  db: DrizzleQueryExecutor,
  evaluationId: string,
): Promise<ThresholdEffortLink[]> {
  return (await readThresholdEffortLinksByEvaluation(db, [evaluationId])).get(evaluationId) ?? [];
}

async function readThresholdEffortLinksByEvaluation(
  db: DrizzleQueryExecutor,
  evaluationIds: readonly string[],
): Promise<Map<string, ThresholdEffortLink[]>> {
  const result = new Map<string, ThresholdEffortLink[]>();
  for (let offset = 0; offset < evaluationIds.length; offset += THRESHOLD_REBUILD_PAGE_SIZE) {
    const rows = await db
      .select({
        evaluationId: thresholdEvaluationEfforts.evaluation_id,
        effortId: thresholdEvaluationEfforts.effort_id,
        activityId: thresholdEvaluationEfforts.activity_id,
        sourceRevision: thresholdEvaluationEfforts.source_revision,
        effortType: thresholdEvaluationEfforts.effort_type,
        sourceSeries: thresholdEvaluationEfforts.source_series,
        role: thresholdEvaluationEfforts.role,
        ordinal: thresholdEvaluationEfforts.ordinal,
      })
      .from(thresholdEvaluationEfforts)
      .where(
        inArray(
          thresholdEvaluationEfforts.evaluation_id,
          evaluationIds.slice(offset, offset + THRESHOLD_REBUILD_PAGE_SIZE),
        ),
      );
    for (const row of rows) {
      const links = [row].flatMap((candidate) =>
        (candidate.effortType === "power" ||
          candidate.effortType === "speed" ||
          candidate.effortType === "heart_rate") &&
        (candidate.sourceSeries === "power" ||
          candidate.sourceSeries === "grade_adjusted_speed" ||
          candidate.sourceSeries === "raw_speed" ||
          candidate.sourceSeries === "swim_speed" ||
          candidate.sourceSeries === "heart_rate") &&
        (candidate.role === "primary" || candidate.role === "supporting")
          ? [
              {
                effortId: candidate.effortId,
                activityId: candidate.activityId,
                sourceRevision: candidate.sourceRevision,
                effortType: candidate.effortType,
                sourceSeries: candidate.sourceSeries,
                role: candidate.role,
                ordinal: candidate.ordinal,
              } satisfies ThresholdEffortLink,
            ]
          : [],
      );
      if (links.length > 0) {
        result.set(row.evaluationId, [...(result.get(row.evaluationId) ?? []), ...links]);
      }
    }
  }
  return result;
}

async function readCurrentThresholdLifecycleState(
  db: DrizzleQueryExecutor,
  input: {
    profileId: string;
    identity: ThresholdIdentity;
    observedAt: Date;
    evaluationId: string;
  },
): Promise<ThresholdLifecycleState | null> {
  const policy = getThresholdActivityCategoryPolicy(
    input.identity.activityCategory,
    input.identity.metric,
  );
  const result = await db.execute(sql`
    select published.id,
      published.evaluation_id,
      published.value,
      published.unit,
      published.method,
      published.effective_at,
      published.policy_version,
      published.supersedes_id,
      superseded.value as superseded_value,
      evaluation.source_activity_id,
      evaluation.observed_at,
      case when exists (
        select 1
        from thresholds history
        join threshold_evaluation_efforts support
          on support.evaluation_id = history.evaluation_id
         and support.role = 'supporting'
        where history.profile_id = published.profile_id
          and history.activity_category = published.activity_category
          and history.metric = published.metric
          and history.policy_version = published.policy_version
          and (history.effective_at, history.created_at, history.id)
            <= (published.effective_at, published.created_at, published.id)
      ) then 'confirmed' else 'provisional' end as state
    from thresholds published
    join threshold_evaluations evaluation
      on evaluation.id = published.evaluation_id
    left join thresholds superseded
      on superseded.id = published.supersedes_id
    where published.profile_id = ${input.profileId}::uuid
      and published.activity_category = ${input.identity.activityCategory}
      and published.metric = ${input.identity.metric}
      and published.policy_version = ${policy.policyVersion}
      and (evaluation.observed_at, evaluation.id)
        <= (${input.observedAt}, ${input.evaluationId}::uuid)
    order by published.effective_at desc, published.created_at desc, published.id desc
    limit 1
  `);
  const row = result.rows[0];
  if (!row) return null;
  const current = currentThresholdLifecycleRowSchema.parse(row);
  const provenance = (await readDirectThresholdProvenance(db, [current.evaluation_id])).get(
    current.evaluation_id,
  );
  if (!provenance || provenance.length === 0) {
    throw new Error("Published threshold has no lifecycle provenance");
  }
  const primary = provenance.find(({ role }) => role === "primary");
  if (!primary || provenance.filter(({ role }) => role === "primary").length !== 1) {
    throw new Error("Published threshold lifecycle provenance has no unique primary effort");
  }
  return thresholdLifecycleStateSchema.parse({
    stateVersion: THRESHOLD_LIFECYCLE_STATE_VERSION,
    activityCategory: input.identity.activityCategory,
    confidence: current.state,
    current: {
      activityCategory: input.identity.activityCategory,
      metric: input.identity.metric,
      unit: current.unit,
      method: current.method,
      value: current.value,
      effectiveAt: current.effective_at.toISOString(),
      policyVersion: current.policy_version,
      plausibilityVersion: policy.plausibilityVersion,
      selectedEvidenceIds: provenance.map(({ origin_evaluation_id }) => origin_evaluation_id),
      selectedActivityIds: provenance.map(({ source_activity_id }) => source_activity_id),
      publicationReason: reconstructThresholdPublicationReason({
        hasSupportingProvenance: provenance.some(({ role }) => role === "supporting"),
        value: current.value,
        supersedesId: current.supersedes_id,
        supersededValue: current.superseded_value,
        materialChangeRelativeThreshold: policy.materialChangeRelativeThreshold,
      }),
    },
    pendingDecrease: [],
    lastProcessed: {
      observedAt: current.observed_at.toISOString(),
      evidenceId: current.evaluation_id,
      activityId: primary.source_activity_id,
    },
  });
}

/** Plans the immutable value and complete effort-link set before the evaluation is inserted. */
export async function planThresholdEvaluationPersistence(
  db: DrizzleQueryExecutor,
  input: {
    id: string;
    profileId: string;
    identity: ThresholdIdentity;
    evaluation: ThresholdEvaluation;
    selection: ThresholdSelectionResult;
    sourceActivityId: string;
    observedAt: Date;
    primaryEffort: ThresholdEffortLink | null;
  },
): Promise<{ persistedValue: number | null; effortLinks: ThresholdEffortLink[] }> {
  if (input.evaluation.status === "rejected") {
    if (input.selection.status !== "rejected") {
      throw new Error("Rejected threshold evaluation does not match Core selection");
    }
    return {
      persistedValue: null,
      effortLinks: input.primaryEffort
        ? [{ ...input.primaryEffort, role: "primary", ordinal: 0 }]
        : [],
    };
  }
  if (input.selection.status !== "qualified") {
    throw new Error("Qualified threshold evaluation does not match Core selection");
  }
  if (canonicalJson(input.selection.candidate) !== canonicalJson(input.evaluation.candidate)) {
    throw new Error("Threshold evaluation candidate diverged from Core selection");
  }
  if (!input.primaryEffort) {
    throw new Error("Qualified threshold evaluation requires its primary exact-window effort");
  }

  const current: ThresholdEvidence = {
    ...input.evaluation.candidate,
    evidenceId: input.id,
    activityId: input.sourceActivityId,
    observedAt: input.observedAt.toISOString(),
  };
  const policy = getThresholdActivityCategoryPolicy(
    input.identity.activityCategory,
    input.identity.metric,
  );
  let state = await readCurrentThresholdLifecycleState(db, {
    profileId: input.profileId,
    identity: input.identity,
    observedAt: input.observedAt,
    evaluationId: input.id,
  });
  let replayedCurrent = state?.lastProcessed.evidenceId === input.id;
  let reachedHorizon = false;
  let cursor = state
    ? { observedAt: new Date(state.lastProcessed.observedAt), id: state.lastProcessed.evidenceId }
    : undefined;
  const boundedHistoryStart = state
    ? new Date(
        Math.max(
          Date.parse(state.current.effectiveAt),
          input.observedAt.getTime() -
            Math.max(policy.confirmationWindowDays, policy.decreaseWindowDays) * 86_400_000,
        ),
      )
    : undefined;
  for (;;) {
    const page = await readQualifiedThresholdEvidencePage(db, {
      profileId: input.profileId,
      identity: input.identity,
      asOf: input.observedAt,
      ...(cursor ? { cursor } : {}),
      ...(boundedHistoryStart ? { earliestObservedAt: boundedHistoryStart } : {}),
    });
    for (const candidate of page) {
      if (
        Date.parse(candidate.observedAt) === input.observedAt.getTime() &&
        candidate.evidenceId > input.id
      ) {
        reachedHorizon = true;
        break;
      }
      state = advanceThresholdLifecycle({ state, candidate }).state;
      if (candidate.evidenceId === input.id) replayedCurrent = true;
    }
    if (reachedHorizon) break;
    const last = page.at(-1);
    if (!last || page.length < THRESHOLD_REBUILD_PAGE_SIZE) break;
    cursor = { observedAt: new Date(last.observedAt), id: last.evidenceId };
  }
  if (!replayedCurrent) state = advanceThresholdLifecycle({ state, candidate: current }).state;
  if (state === null) throw new Error("Qualified threshold evaluation produced no lifecycle state");
  const selectedIds = state.current.selectedEvidenceIds;
  if (selectedIds.at(-1) !== input.id) {
    return {
      persistedValue: input.evaluation.candidate.value,
      effortLinks: [{ ...input.primaryEffort, role: "primary", ordinal: 0 }],
    };
  }

  const supportingIds = selectedIds.filter((id) => id !== input.id);
  const primaryByEvaluation = await readPrimaryThresholdEffortsByEvaluation(db, supportingIds);
  const supporting = supportingIds.map((id, ordinal) => {
    const link = primaryByEvaluation.get(id);
    if (!link) throw new Error("Threshold lifecycle support has no primary exact-window effort");
    return { ...link, role: "supporting" as const, ordinal };
  });
  return {
    persistedValue: state.current.value,
    effortLinks: [{ ...input.primaryEffort, role: "primary", ordinal: 0 }, ...supporting],
  };
}

/** Immutable same-revision evaluation insert. A divergent replay fails closed. */
export async function insertThresholdEvaluation(
  tx: DrizzleTransactionClient,
  input: {
    id: string;
    profileId: string;
    identity: ThresholdIdentity;
    evaluation: ThresholdEvaluation;
    selection: ThresholdSelectionResult;
    persistedValue: number | null;
    sourceActivityId: string;
    sourceRevision: number;
    observedAt: Date;
    effortLinks: ThresholdEffortLink[];
    now: Date;
  },
) {
  const policy = getThresholdActivityCategoryPolicy(
    input.identity.activityCategory,
    input.identity.metric,
  );
  validateEffortLinks(input.effortLinks);
  if (input.evaluation.status === "qualified" && input.effortLinks[0]?.role !== "primary") {
    throw new Error("Qualified threshold evaluation requires its primary effort first");
  }
  const desired: typeof thresholdEvaluations.$inferInsert = {
    id: input.id,
    profile_id: input.profileId,
    activity_category: input.identity.activityCategory,
    metric: input.identity.metric,
    method: policy.method,
    outcome: input.evaluation.status,
    value: input.evaluation.status === "qualified" ? input.persistedValue : null,
    unit: policy.unit,
    confidence: input.evaluation.status === "qualified" ? 1 : null,
    observed_at: input.observedAt,
    rejection_reason: input.evaluation.status === "rejected" ? input.evaluation.reason : null,
    policy_version: policy.policyVersion,
    diagnostics: {
      selection: input.selection,
      candidate: input.evaluation.status === "qualified" ? input.evaluation.candidate : null,
    } satisfies StoredEvaluationDiagnostics,
    source_activity_id: input.sourceActivityId,
    source_revision: input.sourceRevision,
    created_at: input.now,
  };
  const [inserted] = await tx
    .insert(thresholdEvaluations)
    .values(desired)
    .onConflictDoNothing({
      target: [
        thresholdEvaluations.profile_id,
        thresholdEvaluations.source_activity_id,
        thresholdEvaluations.source_revision,
        thresholdEvaluations.activity_category,
        thresholdEvaluations.metric,
        thresholdEvaluations.method,
        thresholdEvaluations.policy_version,
      ],
    })
    .returning();
  if (!inserted) {
    const [existing] = await tx
      .select()
      .from(thresholdEvaluations)
      .where(
        and(
          eq(thresholdEvaluations.profile_id, input.profileId),
          eq(thresholdEvaluations.source_activity_id, input.sourceActivityId),
          eq(thresholdEvaluations.source_revision, input.sourceRevision),
          eq(thresholdEvaluations.activity_category, input.identity.activityCategory),
          eq(thresholdEvaluations.metric, input.identity.metric),
          eq(thresholdEvaluations.method, policy.method),
          eq(thresholdEvaluations.policy_version, policy.policyVersion),
        ),
      )
      .limit(1);
    if (!existing || !sameEvaluation(existing, desired)) {
      throw new Error("Threshold evaluation replay diverged from immutable source revision");
    }
    const existingLinks = await readThresholdEffortLinks(tx, existing.id);
    const expectedLinks = orderedEffortLinks(input.effortLinks);
    const actualLinks = orderedEffortLinks(existingLinks);
    if (canonicalJson(actualLinks) !== canonicalJson(expectedLinks)) {
      throw new Error("Threshold evaluation effort replay diverged from immutable source revision");
    }
    return { row: existing, inserted: false } as const;
  }
  if (input.effortLinks.length > 0) {
    await tx
      .insert(thresholdEvaluationEfforts)
      .values(effortLinkValues(inserted.id, input.profileId, input.identity, input.effortLinks));
  }
  return { row: inserted, inserted: true } as const;
}

function thresholdRowsEqual(
  existing: Array<typeof thresholds.$inferSelect>,
  desired: Array<typeof thresholds.$inferInsert>,
): boolean {
  return (
    existing.length === desired.length &&
    existing.every((row, index) => {
      const expected = desired[index];
      return (
        expected !== undefined &&
        row.id === expected.id &&
        row.evaluation_id === expected.evaluation_id &&
        row.value === expected.value &&
        row.confidence === expected.confidence &&
        row.effective_at.getTime() === (expected.effective_at as Date).getTime() &&
        row.supersedes_id === (expected.supersedes_id ?? null)
      );
    })
  );
}

export function planThresholdChain(input: {
  profileId: string;
  identity: ThresholdIdentity;
  evidence: ThresholdEvidence[];
  now: Date;
  initialSupersedesId?: string | null;
}) {
  const policy = getThresholdActivityCategoryPolicy(
    input.identity.activityCategory,
    input.identity.metric,
  );
  const desired: Array<typeof thresholds.$inferInsert> = [];
  const lifecycleByEvaluation = new Map<
    string,
    Extract<ThresholdLifecycleResult, { status: "available" }>
  >();
  let state: ThresholdLifecycleState | null = null;
  let supersedesId: string | null = input.initialSupersedesId ?? null;
  for (const candidate of input.evidence) {
    const step = advanceThresholdLifecycle({ state, candidate });
    state = step.state;
    if (step.action === "retain") continue;
    const selectedEvaluationId = step.state.current.selectedEvidenceIds.at(-1);
    if (!selectedEvaluationId || selectedEvaluationId !== candidate.evidenceId) {
      throw new Error("Core threshold lifecycle published an unknown evaluation horizon");
    }
    const lifecycle: Extract<ThresholdLifecycleResult, { status: "available" }> = {
      status: "available",
      state: step.state.confidence,
      decision: step.decision,
      threshold: step.state.current,
    };
    lifecycleByEvaluation.set(selectedEvaluationId, lifecycle);
    const id = deterministicUuid(
      `threshold:${input.profileId}:${identityKey(input.identity)}:${selectedEvaluationId}:${policy.policyVersion}`,
    );
    desired.push({
      id,
      profile_id: input.profileId,
      activity_category: input.identity.activityCategory,
      metric: input.identity.metric,
      evaluation_id: selectedEvaluationId,
      evaluation_outcome: "qualified",
      // The selected evaluation persists this same Core lifecycle value. Its
      // diagnostics retain the raw candidate used to derive the lifecycle.
      value: lifecycle.threshold.value,
      unit: candidate.unit,
      confidence: 1,
      method: candidate.method,
      effective_at: new Date(lifecycle.threshold.effectiveAt),
      policy_version: lifecycle.threshold.policyVersion,
      supersedes_id: supersedesId,
      created_at: input.now,
    });
    supersedesId = id;
  }
  return { desired, lifecycleByEvaluation };
}

/**
 * Replays the Core lifecycle and transactionally replaces one deterministic chain.
 * The caller must hold the profile advisory lock; deterministic IDs plus DB root/successor
 * uniqueness make an unfenced competing writer fail rather than fork the chain.
 */
export async function rebuildThresholdChainWithProfileLockHeld(
  tx: DrizzleTransactionClient,
  input: { profileId: string; identity: ThresholdIdentity; asOf: Date; now: Date },
) {
  const policy = getThresholdActivityCategoryPolicy(
    input.identity.activityCategory,
    input.identity.metric,
  );
  const allExisting = await tx
    .select()
    .from(thresholds)
    .where(
      and(
        eq(thresholds.profile_id, input.profileId),
        eq(thresholds.activity_category, input.identity.activityCategory),
        eq(thresholds.metric, input.identity.metric),
      ),
    )
    .orderBy(asc(thresholds.effective_at), asc(thresholds.id));
  const existing = allExisting.filter(
    ({ policy_version }) => policy_version === policy.policyVersion,
  );
  const initialSupersedesId = allExisting
    .filter(({ policy_version }) => policy_version !== policy.policyVersion)
    .at(-1)?.id;
  const evidence: ThresholdEvidence[] = [];
  let cursor: { observedAt: Date; id: string } | undefined;
  for (;;) {
    const page = await readQualifiedThresholdEvidencePage(tx, {
      ...input,
      ...(cursor ? { cursor } : {}),
    });
    evidence.push(...page);
    const last = page.at(-1);
    if (!last || page.length < THRESHOLD_REBUILD_PAGE_SIZE) break;
    cursor = { observedAt: new Date(last.observedAt), id: last.evidenceId };
  }
  const { desired, lifecycleByEvaluation } = planThresholdChain({
    profileId: input.profileId,
    identity: input.identity,
    evidence,
    now: input.now,
    initialSupersedesId: initialSupersedesId ?? null,
  });

  const publishedEvaluationIds = [...lifecycleByEvaluation.keys()];
  const retainedEvaluationIds = [
    ...new Set(
      [...lifecycleByEvaluation.values()].flatMap(({ threshold }) => threshold.selectedEvidenceIds),
    ),
  ];
  const [primaryByEvaluation, actualLinksByEvaluation] = await Promise.all([
    readPrimaryThresholdEffortsByEvaluation(tx, retainedEvaluationIds),
    readThresholdEffortLinksByEvaluation(tx, publishedEvaluationIds),
  ]);
  for (const [evaluationId, lifecycle] of lifecycleByEvaluation) {
    const selectedIds = lifecycle.threshold.selectedEvidenceIds;
    const own = primaryByEvaluation.get(evaluationId);
    if (!own) throw new Error("Published threshold evaluation has no primary exact-window effort");
    const supporting = selectedIds
      .filter((id) => id !== evaluationId)
      .map((id, ordinal) => {
        const link = primaryByEvaluation.get(id);
        if (!link)
          throw new Error("Threshold lifecycle support has no primary exact-window effort");
        return { ...link, role: "supporting" as const, ordinal };
      });
    const expectedLinks = [{ ...own, role: "primary" as const, ordinal: 0 }, ...supporting];
    const actualLinks = actualLinksByEvaluation.get(evaluationId) ?? [];
    if (
      canonicalJson(orderedEffortLinks(actualLinks)) !==
      canonicalJson(orderedEffortLinks(expectedLinks))
    ) {
      throw new Error("Published threshold support diverged from immutable evaluation links");
    }
  }

  if (thresholdRowsEqual(existing, desired)) return { changed: false, count: desired.length };
  const existingIds = existing.map(({ id }) => id);
  for (let offset = 0; offset < existingIds.length; offset += THRESHOLD_REBUILD_PAGE_SIZE) {
    await tx
      .delete(thresholds)
      .where(
        inArray(thresholds.id, existingIds.slice(offset, offset + THRESHOLD_REBUILD_PAGE_SIZE)),
      );
  }
  for (let offset = 0; offset < desired.length; offset += THRESHOLD_REBUILD_PAGE_SIZE) {
    await tx.insert(thresholds).values(desired.slice(offset, offset + THRESHOLD_REBUILD_PAGE_SIZE));
  }
  return { changed: true, count: desired.length };
}

/** Impact discovery is performed before source replacement/deletion removes normalized links. */
export async function readThresholdImpactForActivity(
  tx: DrizzleQueryExecutor,
  input: { profileId: string; activityId: string },
): Promise<ThresholdImpact[]> {
  const rows = await tx
    .select({
      activityCategory: thresholdEvaluations.activity_category,
      metric: thresholdEvaluations.metric,
      observedAt: thresholdEvaluations.observed_at,
    })
    .from(thresholdEvaluations)
    .leftJoin(
      thresholdEvaluationEfforts,
      eq(thresholdEvaluationEfforts.evaluation_id, thresholdEvaluations.id),
    )
    .where(
      and(
        eq(thresholdEvaluations.profile_id, input.profileId),
        sql`(${thresholdEvaluations.source_activity_id} = ${input.activityId}::uuid or ${thresholdEvaluationEfforts.activity_id} = ${input.activityId}::uuid)`,
      ),
    );
  const impacts = new Map<string, ThresholdImpact>();
  for (const row of rows) {
    if (
      row.activityCategory !== "bike" &&
      row.activityCategory !== "run" &&
      row.activityCategory !== "swim"
    ) {
      continue;
    }
    const key = `${row.activityCategory}/${row.metric}`;
    const current = impacts.get(key);
    if (!current || row.observedAt < current.effectiveAt) {
      impacts.set(key, {
        activityCategory: row.activityCategory,
        metric: row.metric,
        effectiveAt: row.observedAt,
      });
    }
  }
  return [...impacts.values()];
}

export async function deleteThresholdChainsForImpacts(
  tx: DrizzleTransactionClient,
  input: { profileId: string; impacts: readonly ThresholdImpact[] },
) {
  for (const impact of input.impacts) {
    const policy = getThresholdActivityCategoryPolicy(impact.activityCategory, impact.metric);
    const rows = await tx
      .select({ id: thresholds.id })
      .from(thresholds)
      .where(
        and(
          eq(thresholds.profile_id, input.profileId),
          eq(thresholds.activity_category, impact.activityCategory),
          eq(thresholds.metric, impact.metric),
          eq(thresholds.policy_version, policy.policyVersion),
        ),
      );
    if (rows.length > 0) {
      await tx.delete(thresholds).where(
        inArray(
          thresholds.id,
          rows.map(({ id }) => id),
        ),
      );
    }
  }
}

/** Removes replaceable chain rows; obsolete effort/evaluation truth is removed by DB cascades. */
export async function deleteThresholdEvidenceForActivity(
  tx: DrizzleTransactionClient,
  input: { profileId: string; activityId: string; impacts: readonly ThresholdImpact[] },
) {
  await deleteThresholdChainsForImpacts(tx, {
    profileId: input.profileId,
    impacts: input.impacts,
  });
}

export type ThresholdAsOfRequest = {
  profileId: string;
  asOf: Date;
  excludedActivityId?: string;
};

/**
 * Resolves an ordered request batch with two bounded set-based reads: one latest
 * published row per request/category, then provenance only for those rows.
 */
async function readThresholdsForRequestsInSnapshot(
  db: DrizzleQueryExecutor,
  requests: readonly ThresholdAsOfRequest[],
): Promise<ThresholdAsOfFact[][]> {
  if (requests.length === 0) return [];
  if (requests.length > THRESHOLD_AS_OF_BATCH_REQUEST_LIMIT) {
    throw new Error(`Threshold as-of batches cannot exceed ${THRESHOLD_AS_OF_BATCH_REQUEST_LIMIT}`);
  }
  for (const request of requests) {
    if (!Number.isFinite(request.asOf.getTime())) throw new Error("Threshold-fact asOf is invalid");
  }
  const encodedRequests = requests.map((request, ordinal) => ({
    ordinal,
    profile_id: request.profileId,
    as_of: request.asOf.toISOString(),
    excluded_activity_id: request.excludedActivityId ?? null,
  }));
  const thresholdResult = await db.execute(sql`
    with requests as materialized (
      select *
      from jsonb_to_recordset(${JSON.stringify(encodedRequests)}::jsonb) as request(
        ordinal integer,
        profile_id uuid,
        as_of timestamptz,
        excluded_activity_id uuid
      )
    ), identities(activity_category, metric) as (
      values ('bike'::text, 'power'::text),
        ('bike'::text, 'lthr'::text),
        ('run'::text, 'speed'::text),
        ('run'::text, 'lthr'::text),
        ('swim'::text, 'speed'::text),
        ('swim'::text, 'lthr'::text)
    )
    select request.ordinal,
      candidate.id,
      candidate.activity_category,
      candidate.metric,
      candidate.value,
      candidate.unit,
      candidate.confidence,
      candidate.method,
      candidate.effective_at,
      candidate.policy_version,
      candidate.evaluation_id,
      case when exists (
        select 1
        from thresholds history
        join threshold_evaluation_efforts support
          on support.evaluation_id = history.evaluation_id
         and support.role = 'supporting'
        where history.profile_id = candidate.profile_id
          and history.activity_category = candidate.activity_category
          and history.metric = candidate.metric
          and history.policy_version = candidate.policy_version
          and (history.effective_at, history.created_at, history.id)
            <= (candidate.effective_at, candidate.created_at, candidate.id)
      ) then 'confirmed' else 'provisional' end as state
    from requests request
    cross join identities identity
    cross join lateral (
      select published.*
      from thresholds published
      where published.profile_id = request.profile_id
        and published.activity_category::text = identity.activity_category
        -- Keep this read compatible while the optional LTHR enum migration is
        -- pending: an older database has no LTHR enum literal, but simply
        -- returns no LTHR threshold rows.
        and published.metric::text = identity.metric
        and published.effective_at <= request.as_of
        and (
          request.excluded_activity_id is null
          or not exists (
            select 1
            from threshold_evaluation_efforts selected
            where selected.evaluation_id = published.evaluation_id
              and selected.activity_id = request.excluded_activity_id
          )
        )
      order by published.effective_at desc, published.created_at desc, published.id desc
      limit 1
    ) candidate
    order by request.ordinal, candidate.activity_category, candidate.metric
  `);
  const thresholdRows = thresholdResult.rows.map((row) => directThresholdRowSchema.parse(row));
  const evaluationIds = [...new Set(thresholdRows.map(({ evaluation_id }) => evaluation_id))];
  const provenanceByEvaluation = await readDirectThresholdProvenance(db, evaluationIds);

  const grouped = requests.map(() => [] as ThresholdAsOfFact[]);
  for (const row of thresholdRows) {
    const request = requests[row.ordinal];
    if (!request) throw new Error("Threshold batch returned an unknown request ordinal");
    if (row.effective_at.getTime() > request.asOf.getTime()) {
      throw new Error("Threshold batch returned future published truth");
    }
    const provenance = provenanceByEvaluation.get(row.evaluation_id) ?? [];
    if (provenance.length === 0) {
      throw new Error("Published threshold has no exact-window effort provenance");
    }
    if (
      new Set(provenance.map(({ effort_id }) => effort_id)).size !== provenance.length ||
      provenance.filter(({ role }) => role === "primary").length !== 1
    ) {
      throw new Error("Published threshold provenance is ambiguous");
    }
    grouped[row.ordinal]?.push({
      id: row.id,
      status: "available",
      activityCategory: row.activity_category,
      metric: row.metric,
      unit: row.unit,
      method: row.method,
      value: row.value,
      effectiveAt: row.effective_at.toISOString(),
      policyVersion: row.policy_version,
      state: row.state,
      confidence: row.confidence,
      sourceEvaluationIds: provenance.map(({ origin_evaluation_id }) => origin_evaluation_id),
      sourceEffortIds: provenance.map(({ effort_id }) => effort_id),
      sourceActivityIds: provenance.map(({ source_activity_id }) => source_activity_id),
    });
  }
  return grouped;
}

export async function readThresholdsForRequests(
  db: DrizzleQueryExecutor,
  requests: readonly ThresholdAsOfRequest[],
): Promise<ThresholdAsOfFact[][]> {
  if (requests.length === 0) return [];
  return withRepeatableReadSnapshot(db, (tx) => readThresholdsForRequestsInSnapshot(tx, requests));
}

/** Latest surviving effective threshold at or before asOf; freshness never filters usability. */
export async function readThresholdsAsOf(
  db: DrizzleQueryExecutor,
  input: ThresholdAsOfRequest,
): Promise<ThresholdAsOfFact[]> {
  return (await readThresholdsForRequests(db, [input]))[0] ?? [];
}
