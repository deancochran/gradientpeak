import {
  activityObservationQuantificationSchema,
  aggregateCommonLoad,
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  type CommonLoadResult,
  calculateAvailableCommonLoad,
  commonLoadResultSchema,
  createActivityQuantificationCalculationIdentity,
  createActivityQuantificationEvidenceIdentity,
  createCompletedActivityQuantificationSubjectIdentity,
  createObservationQuantificationBundle,
} from "@repo/core";
import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:crypto", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:crypto")>()),
  randomUUID: () => "33333333-3333-4333-8333-333333333333",
}));

const pgDialect = new PgDialect();

const mockActivityAnalysis = vi.hoisted(() => ({
  analyzeActivityDerivedMetrics: vi.fn(),
  buildActivityDerivedSummaryMap: vi.fn(),
  buildActivitySegmentDerivedSummaries: vi.fn(),
  createActivityAnalysisStore: vi.fn(() => ({
    kind: "activity-analysis-store",
  })),
  mapActivityToDerivedResponse: vi.fn(({ activity, has_liked, derived }) => ({
    activity,
    has_liked,
    derived,
  })),
  mapActivityToListDerivedResponse: vi.fn(({ activity, has_liked, derived }) => ({
    ...activity,
    has_liked,
    derived,
  })),
  resolveActivityContextAsOf: vi.fn(),
  loadActivitySegmentsByActivityId: vi.fn(),
}));
const mobileUploadFlow = vi.hoisted(() => ({
  loadAcceptedArtifactForClaim: vi.fn(),
  markPreparedMobileRecordingArtifactFailed: vi.fn(),
  prepareMobileRecordingArtifact: vi.fn(),
  retryMobileRecordingStagingCleanup: vi.fn(),
}));
const artifactFinalizer = vi.hoisted(() => ({ finalizeActivityArtifactIngestion: vi.fn() }));

vi.mock(
  "../../application/activity-file-ingestion/mobile-recording-upload",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../application/activity-file-ingestion/mobile-recording-upload")
    >()),
    loadAcceptedArtifactForClaim: mobileUploadFlow.loadAcceptedArtifactForClaim,
    markPreparedMobileRecordingArtifactFailed:
      mobileUploadFlow.markPreparedMobileRecordingArtifactFailed,
    prepareMobileRecordingArtifact: mobileUploadFlow.prepareMobileRecordingArtifact,
    retryMobileRecordingStagingCleanup: mobileUploadFlow.retryMobileRecordingStagingCleanup,
  }),
);
vi.mock(
  "../../application/activity-file-ingestion/finalize-activity-artifact-ingestion",
  () => artifactFinalizer,
);
vi.mock("../../storage-service", () => ({ getActivityArtifactStorageService: () => ({}) }));
vi.mock("../../application/athlete-intelligence/athlete-state-evidence", () => ({
  materializeActivityAthleteStateEvidence: vi.fn().mockResolvedValue({
    commonLoad: null,
    confidence: null,
    materialChanged: false,
  }),
}));
vi.mock("../../application/athlete-intelligence/published-athlete-state", async () => {
  const { createUnavailableAthletePerformanceTargetFacts } =
    await vi.importActual<typeof import("@repo/core")>("@repo/core");
  return {
    readPublishedAthletePerformanceTargets: vi.fn(
      async ({ profileId, now }: { profileId: string; now: Date }) => ({
        status: "unavailable" as const,
        publishedRevision: null,
        targets: createUnavailableAthletePerformanceTargetFacts(now.toISOString(), profileId),
      }),
    ),
  };
});
vi.mock("../../repositories/athlete-state-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../repositories/athlete-state-repository")>()),
  markAthleteStateDirty: vi.fn(async () => 1),
}));

vi.mock("@repo/core", async () => {
  const actual = await vi.importActual<typeof import("@repo/core")>("@repo/core");

  return {
    ...actual,
    analyzeActivityDerivedMetrics: mockActivityAnalysis.analyzeActivityDerivedMetrics,
  };
});

vi.mock("../../infrastructure/repositories", () => ({
  createActivityAnalysisStore: mockActivityAnalysis.createActivityAnalysisStore,
}));

vi.mock("../../lib/activity-analysis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/activity-analysis")>();
  return {
    ...actual,
    buildActivityDerivedSummaryMap: mockActivityAnalysis.buildActivityDerivedSummaryMap,
    buildActivityDerivedSummaries: async (
      input: Parameters<typeof actual.buildActivityDerivedSummaryMap>[0],
    ) => ({
      parent: await mockActivityAnalysis.buildActivityDerivedSummaryMap(input),
      segments: await mockActivityAnalysis.buildActivitySegmentDerivedSummaries(input),
    }),
    buildActivitySegmentDerivedSummaries: mockActivityAnalysis.buildActivitySegmentDerivedSummaries,
    loadActivitySegmentsByActivityId: mockActivityAnalysis.loadActivitySegmentsByActivityId,
    resolveActivityContextAsOf: mockActivityAnalysis.resolveActivityContextAsOf,
  };
});

import { activitiesRouter } from "../activities";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const ACTIVITY_ID = "33333333-3333-4333-8333-333333333333";
const ACTIVITY_ID_2 = "44444444-4444-4444-8444-444444444444";
const ACTIVITY_ID_3 = "55555555-5555-4555-8555-555555555555";
const PLAN_ID = "77777777-7777-4777-8777-777777777777";
const SEGMENT_ID = "99999999-9999-4999-8999-999999999999";
const INGESTION_ID = "88888888-8888-4888-8888-888888888888";
const unavailableNormalizedPowerResult = calculateCyclingNormalizedPower({ samples: [] });
const ACCEPTED_ARTIFACT = {
  sha256: "a".repeat(64),
  byteSize: 123456,
  bucket: "activity-files",
  path: `artifacts/sha256/${OWNER_ID}/${"a".repeat(64)}`,
  mediaType: "application/vnd.ant.fit",
  format: "fit" as const,
  originalName: "accepted.fit",
};

function activityPlanStructure(activity_category: "bike" | "run", segmentCount = 1) {
  return {
    version: 3 as const,
    activity_category,
    segments: Array.from({ length: segmentCount }, (_, index) => ({
      id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      role: "activity" as const,
      name: activity_category,
      intervals: [
        {
          id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          name: "Main",
          repetitions: 1,
          steps: [
            {
              id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
              name: "Step",
              duration: { type: "time" as const, seconds: 600 },
              targets: [{ type: "RPE" as const, intensity: 5 }],
            },
          ],
        },
      ],
    })),
  };
}

function recordingExecutionManifest(activity_category: "run" | "bike" | "swim" = "run") {
  return {
    version: 1 as const,
    compilerVersion: 1,
    planHash: "b".repeat(64),
    occurrences: [
      {
        occurrenceId: "occurrence-1",
        globalOrdinal: 0,
        segmentId: SEGMENT_ID,
        role: "activity" as const,
        activity_category,
        startedAt: "2026-01-15T09:00:00.000Z",
        completedAt: "2026-01-15T10:00:00.000Z",
        activeSeconds: 3600,
        movingSeconds: 3500,
        distanceMeters: 10000,
        timerEvents: [],
        laps: [],
      },
    ],
  };
}

function recordingCreateInput(profileId = OWNER_ID) {
  return {
    profileId,
    recordingSessionId: "recording-session-1",
    name: "Recorder Run",
    startedAt: "2026-01-15T09:00:00.000Z",
    finishedAt: "2026-01-15T10:00:00.000Z",
    executionManifest: recordingExecutionManifest(),
    uploadedArtifact: { ingestionId: INGESTION_ID },
    summary: { distanceMeters: 10000 },
  };
}
function availableCommonLoad(load: number, activityCategory: "run" | "bike" = "run") {
  const contributingDurationSeconds = Math.max(3600, Math.ceil(load / 225) * 3600);
  const intensity = Math.sqrt((load * 3600) / (100 * contributingDurationSeconds));
  if (activityCategory === "bike") {
    return calculateAvailableCommonLoad({
      activity_category: "bike",
      method: "power_threshold",
      quality: {
        source: "validated_test",
        observed_at: "2026-01-01T00:00:00.000Z",
        confidence: "high",
        stale: false,
        estimate: false,
        calculation_version: "test-v1",
        evidence_fingerprint: "bike-quality",
      },
      thresholdEvidence: {
        type: "ftp_watts",
        value: 250,
        unit: "watts",
        source: "validated_test",
        observedAt: "2026-01-01T00:00:00.000Z",
        validAt: "2026-01-01T00:00:00.000Z",
        freshness: "current",
        calculationVersion: "test-v1",
        sourceFingerprint: "bike-threshold",
      },
      evidenceFingerprint: "bike-activity",
      computedAsOf: "2026-01-10T09:00:00.000Z",
      estimated: false,
      contributingDurationSeconds,
      intensity,
    });
  }

  return calculateAvailableCommonLoad({
    activity_category: "run",
    method: "run_pace_threshold",
    quality: {
      source: "validated_test",
      observed_at: "2026-01-01T00:00:00.000Z",
      confidence: "high",
      stale: false,
      estimate: false,
      calculation_version: "test-v1",
      evidence_fingerprint: "run-quality",
    },
    thresholdEvidence: {
      type: "threshold_speed_mps",
      value: 4.2,
      unit: "meters_per_second",
      source: "validated_test",
      observedAt: "2026-01-01T00:00:00.000Z",
      validAt: "2026-01-01T00:00:00.000Z",
      freshness: "current",
      calculationVersion: "test-v1",
      sourceFingerprint: "run-threshold",
    },
    evidenceFingerprint: "run-activity",
    computedAsOf: "2026-01-10T09:00:00.000Z",
    estimated: false,
    contributingDurationSeconds,
    intensity,
  });
}

function unavailableCommonLoad(reason: "private_data" | "threshold_missing" = "private_data") {
  return commonLoadResultSchema.parse({
    status: "unavailable",
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    activity_category: "run",
    method: null,
    quality: null,
    thresholdEvidence: null,
    evidenceFingerprint: null,
    computedAsOf: "2026-01-10T09:00:00.000Z",
    contributingDurationSeconds: null,
    reason,
  });
}

function observationQuantification(
  id: string,
  commonLoad: CommonLoadResult,
  distanceMeters = 100,
  activeSeconds = commonLoad.contributingDurationSeconds ?? 3600,
  movingSeconds = activeSeconds,
) {
  const segmentId = `${id}-segment`;
  const subjectIdentity = createCompletedActivityQuantificationSubjectIdentity({ activityId: id });
  return activityObservationQuantificationSchema.parse({
    kind: "observation",
    stage: "final",
    subjectIdentity,
    evidenceIdentity: createActivityQuantificationEvidenceIdentity({
      evidenceType: "segment_facts",
      sourceIds: [id, segmentId],
      revisionFingerprint: `revision-${id}`,
      details: { kind: "activities-router-test", id },
    }),
    calculationIdentity: createActivityQuantificationCalculationIdentity({
      model: commonLoad.model,
      version: commonLoad.version,
      computedAt: commonLoad.computedAsOf,
      calibrationEvidenceFingerprint: commonLoad.evidenceFingerprint,
    }),
    activity_category: commonLoad.activity_category,
    duration: {
      elapsed: {
        status: "available",
        evidenceRole: "measured",
        value: activeSeconds,
        unit: "seconds",
      },
      active: {
        status: "available",
        evidenceRole: "measured",
        value: activeSeconds,
        unit: "seconds",
      },
      moving: {
        status: "available",
        evidenceRole: "measured",
        value: movingSeconds,
        unit: "seconds",
      },
    },
    distance: {
      status: "available",
      evidenceRole: "measured",
      value: distanceMeters,
      unit: "meters",
    },
    intensity: {
      observed: {
        status: "unavailable",
        evidenceRole: "measured",
        values: [],
        reason: "not_observed",
      },
    },
    completedProvenance: {
      activityId: id,
      segmentId,
      source: "unknown",
      artifactIdentity: null,
      providerIdentity: null,
      segmentRevision: null,
      observedAt: commonLoad.computedAsOf,
      computedAt: commonLoad.computedAsOf,
      calculationVersion: "activities-router-test-v1",
    },
    commonLoad,
  });
}

function parentDerivedSummary(
  id: string,
  commonLoad: CommonLoadResult,
  computedAsOf = "2026-01-10T09:00:00.000Z",
) {
  const member = observationQuantification(`${id}-segment`, commonLoad);
  const observationBundle = createObservationQuantificationBundle({ members: [member] });
  return {
    common_load: observationBundle.summary.commonLoad,
    computed_as_of: computedAsOf,
    observationQuantification: observationBundle,
  };
}

function segmentDerivedSummary(input: {
  activityId: string;
  segmentId: string;
  commonLoad: CommonLoadResult;
  distanceMeters?: number;
  activeSeconds?: number;
  movingSeconds?: number;
}) {
  const quantification = observationQuantification(
    input.segmentId,
    input.commonLoad,
    input.distanceMeters,
    input.activeSeconds,
    input.movingSeconds,
  );
  return {
    activity_id: input.activityId,
    segment_id: input.segmentId,
    activity_category: input.commonLoad.activity_category,
    common_load: input.commonLoad,
    observationQuantification: createObservationQuantificationBundle({
      members: [quantification],
    }),
    computed_as_of: "2026-01-10T09:00:00.000Z",
    dedupe_key: input.segmentId,
    load_stream_key: `${input.commonLoad.activity_category}:test`,
  };
}
const activityCategories = new Map<string, "bike" | "run" | "swim">();

function buildActivityRow(overrides: Record<string, unknown> = {}) {
  const { activity_category = "run", ...rowOverrides } = overrides;
  const id = typeof rowOverrides.id === "string" ? rowOverrides.id : ACTIVITY_ID;
  activityCategories.set(id, activity_category as "bike" | "run" | "swim");
  return {
    id,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-01-01T00:00:00.000Z"),
    profile_id: OWNER_ID,
    activity_plan_id: null,
    name: "Morning Run",
    started_at: new Date("2026-01-10T08:00:00.000Z"),
    finished_at: new Date("2026-01-10T08:45:00.000Z"),
    elapsed_ms: 2_700_000,
    active_ms: 2_700_000,
    moving_ms: 2_650_000,
    timing_coverage: "complete",
    segments_revision: 1,
    parser_version: "test-parser-v1",
    decoded_contract_version: "test-decoded-v1",
    materializer_version: "test-materializer-v1",
    segments_generated_at: new Date("2026-01-10T08:45:00.000Z"),
    distance_meters: 9000,
    elevation_gain_meters: null,
    elevation_loss_meters: null,
    calories: null,
    avg_heart_rate: null,
    max_heart_rate: null,
    avg_power: null,
    max_power: null,
    avg_cadence: null,
    max_cadence: null,
    avg_speed_mps: 3.3,
    max_speed_mps: 4.8,
    normalized_speed_mps: null,
    avg_temperature: null,
    avg_swolf: null,
    pool_length_meters: null,
    total_strokes: null,
    device_manufacturer: null,
    device_product: null,
    notes: null,
    polyline: null,
    laps: null,
    map_bounds: null,
    ...rowOverrides,
    content_visibility: rowOverrides.content_visibility ?? "public",
  };
}

function publicActivityRow(row: ReturnType<typeof buildActivityRow>) {
  return row;
}

function buildSegmentReadRow(
  activityId: string,
  ordinal: number,
  activity_category: "run" | "bike" | "swim",
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `99999999-9999-4999-8999-${ordinal.toString().padStart(12, "0")}`,
    activity_id: activityId,
    ordinal,
    role: "activity" as const,
    activity_category,
    start_offset_ms: ordinal * 1_000,
    end_offset_ms: (ordinal + 1) * 1_000,
    source_artifact_id: null,
    source_session_index: null,
    source_message_index: null,
    raw_type_string: null,
    raw_type_integer: null,
    raw_sport_string: null,
    raw_sport_integer: null,
    raw_sub_sport_string: null,
    raw_sub_sport_integer: null,
    timing_coverage: "complete" as const,
    active_ms: 1_000,
    moving_ms: 900,
    summary: {
      version: 1 as const,
      timing: {
        timingCoverage: "complete" as const,
        activeMs: 1_000,
        movingMs: 900,
      },
      distanceMeters: 100,
      normalizedPowerResult: unavailableNormalizedPowerResult,
    },
    ...overrides,
  };
}

function buildActivityPlanRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAN_ID,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-01-02T00:00:00.000Z"),
    profile_id: OWNER_ID,
    name: "Planned Run",
    description: "",
    notes: null,
    activity_category: "run",
    structure: null,
    version: "1.0",
    content_visibility: "private",
    is_system_template: false,
    ...overrides,
  };
}

function buildActivitySummaryRow(overrides: Record<string, unknown> = {}) {
  return {
    activity_id: ACTIVITY_ID,
    profile_id: OWNER_ID,
    duration_seconds: 3000,
    moving_seconds: 2900,
    distance_meters: 10000,
    elevation_gain_meters: 120,
    elevation_loss_meters: 80,
    calories: 500,
    avg_heart_rate: 145,
    max_heart_rate: 172,
    avg_power: 210,
    max_power: 430,
    avg_cadence: 88,
    max_cadence: 112,
    avg_speed_mps: 3.45,
    max_speed_mps: 5.1,
    normalized_speed_mps: 3.5,
    normalized_graded_speed_mps: 3.6,
    avg_temperature: null,
    avg_swolf: null,
    efficiency_factor: null,
    aerobic_decoupling: null,
    pool_length_meters: null,
    total_strokes: null,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function buildActivityImportRow(overrides: Record<string, unknown> = {}) {
  return {
    activity_id: ACTIVITY_ID,
    profile_id: OWNER_ID,
    provider: "wahoo",
    external_id: "external-activity-1",
    device_manufacturer: "Wahoo",
    device_product: "ELEMNT",
    activity_file_path: "activities/file.fit",
    activity_file_size: 1234,
    import_source: null,
    import_file_type: "fit",
    import_original_file_name: "ride.fit",
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function buildActivityFileIngestionRow(overrides: Record<string, unknown> = {}) {
  const status = overrides.status ?? "pending_upload";
  const accepted = status === "ready";
  return {
    id: "88888888-8888-4888-8888-888888888888",
    activity_id: ACTIVITY_ID,
    profile_id: OWNER_ID,
    source: "mobile_recording",
    provider: null,
    external_id: null,
    operation_key: "mobile-recording:recording-session-1",
    artifact_id: accepted ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" : null,
    uploaded_at: accepted ? new Date("2026-01-01T00:00:00.000Z") : null,
    staging_cleanup_pending: false,
    file_path: null,
    file_size: 123456,
    file_type: "fit",
    status,
    attempt_count: 0,
    last_error_code: null,
    last_error_message: null,
    requested_at: new Date("2026-01-01T00:00:00.000Z"),
    started_at: null,
    completed_at: null,
    failed_at: null,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function findInsertedValue(db: any, tableName: string) {
  return db.__spies.insertValues.mock.calls.find(
    ([insertedTableName]: [string, unknown]) => insertedTableName === tableName,
  )?.[1];
}

function buildActivityGeometryRow(overrides: Record<string, unknown> = {}) {
  return {
    activity_id: ACTIVITY_ID,
    profile_id: OWNER_ID,
    polyline: "split-polyline",
    map_bounds: { north: 1, south: 0, east: 1, west: 0 },
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function getTableName(table: unknown) {
  if (table && typeof table === "object") {
    const candidate =
      (table as any)?._?.name ??
      (table as any)?._?.baseName ??
      (table as any)?.config?.name ??
      (table as any)?.name;

    if (typeof candidate === "string") return candidate;

    for (const symbol of Object.getOwnPropertySymbols(table)) {
      const value = (table as any)[symbol];
      if (typeof value === "string" && /^[a-z_]+$/i.test(value)) return value;
    }
  }

  return "unknown";
}

function toSql(fragment: unknown) {
  return pgDialect.sqlToQuery(fragment as any).sql;
}

function createCaller(db: any, userId = OWNER_ID) {
  return activitiesRouter.createCaller({
    db,
    session: {
      user: {
        id: userId,
      },
    },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);
}

function createSequencedFn(values: unknown[]) {
  const fn = vi.fn();

  for (const value of values) {
    fn.mockResolvedValueOnce(value);
  }

  return fn;
}

function createDbMock(options: {
  activityRows?: any[];
  activityEffortRows?: any[];
  activityPlanRows?: any[];
  likeRows?: Array<{ entity_id: string; likes_count: number; has_liked: boolean }>;
  totalRows?: Array<{ total: number }>;
  joinedRows?: any[];
  activitySummaryRows?: any[];
  activityImportRows?: any[];
  activityFileIngestionRows?: any[];
  activityGeometryRows?: any[];
  activityLapRows?: any[];
  currentArtifactRows?: any[];
  sessionRpeEvidenceRows?: any[];
  profileRows?: any[];
  integrationRows?: any[];
  providerSyncRows?: any[];
  queryActivitiesFindFirst?: any[];
  queryActivityArtifactsFindFirst?: any[];
  queryActivityFileIngestionsFindFirst?: any[];
  queryActivityGeometryFindFirst?: any[];
  queryActivityImportsFindFirst?: any[];
  queryActivitySummariesFindFirst?: any[];
  queryEventsFindFirst?: any[];
  queryLikesFindFirst?: any[];
  executeRows?: Array<{ id: string }>;
  insertedRowsByTable?: Record<string, unknown[]>;
  updatedRows?: any[];
  transactionError?: Error;
  onCommonLoadScanBatch?: (batchNumber: number) => void;
}) {
  const insertValues = vi.fn();
  const deleteBuilder = {
    returning: vi.fn(() =>
      Promise.resolve([{ id: ACTIVITY_ID, startedAt: new Date("2026-01-01T12:00:00.000Z") }]),
    ),
    then: (onFulfilled: (value: undefined) => unknown) =>
      Promise.resolve(undefined).then(onFulfilled),
  };
  const deleteWhere = vi.fn(() => deleteBuilder);
  const offset = vi.fn();
  const selectWhere = vi.fn();
  const commonLoadLimit = vi.fn();
  let transactionActivityRows: any[] | undefined;
  let commonLoadScanIndex = 0;
  let commonLoadScanBatchNumber = 0;
  const limit = vi.fn((limitValue: number) => {
    const limitedRows = (options.activityRows ?? []).slice(0, limitValue);
    return {
      offset: (offsetValue: number) => {
        offset(offsetValue);
        return Promise.resolve(
          (options.activityRows ?? []).slice(offsetValue, offsetValue + limitValue),
        );
      },
      then: (onFulfilled: (value: unknown[]) => unknown) =>
        Promise.resolve(limitedRows).then(onFulfilled),
    };
  });
  const orderBy = vi.fn((...args: unknown[]) => {
    if (transactionActivityRows !== undefined && args.length === 2) {
      return {
        limit: commonLoadLimit.mockImplementation((limitValue: number) => {
          const rows =
            transactionActivityRows ??
            [...(options.activityRows ?? [])].sort(
              (a, b) => b.started_at.getTime() - a.started_at.getTime() || b.id.localeCompare(a.id),
            );
          const batch = rows.slice(commonLoadScanIndex, commonLoadScanIndex + limitValue);
          commonLoadScanIndex += batch.length;
          commonLoadScanBatchNumber += 1;
          options.onCommonLoadScanBatch?.(commonLoadScanBatchNumber);
          return Promise.resolve(batch);
        }),
      };
    }

    return {
      limit,
      then: (onFulfilled: (value: unknown[]) => unknown) =>
        Promise.resolve(options.activityRows ?? []).then(onFulfilled),
    };
  });

  function rowsForTable(tableName: string) {
    if (tableName === "profiles") {
      return options.profileRows ?? [{ planningTimezone: "America/New_York" }];
    }
    if (tableName === "integrations") return options.integrationRows ?? [];
    if (tableName === "provider_sync_state") return options.providerSyncRows ?? [];
    if (tableName === "activity_summaries") return options.activitySummaryRows ?? [];
    if (tableName === "activity_efforts") return options.activityEffortRows ?? [];
    if (tableName === "activity_plans") return options.activityPlanRows ?? [];
    if (tableName === "activity_imports") return options.activityImportRows ?? [];
    if (tableName === "activity_file_ingestions") return options.activityFileIngestionRows ?? [];
    if (tableName === "activity_geometry") return options.activityGeometryRows ?? [];
    if (tableName === "activity_laps") return options.activityLapRows ?? [];
    if (tableName === "activity_artifact_links") return options.currentArtifactRows ?? [];
    if (tableName === "activity_session_rpe_evidence") return options.sessionRpeEvidenceRows ?? [];
    if (tableName === "events") return options.queryEventsFindFirst ?? [];
    return options.activityRows ?? [];
  }

  const db = {
    select: vi.fn((fields?: Record<string, unknown>) => {
      if (fields && "total" in fields) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => Promise.resolve(options.totalRows ?? [{ total: 0 }])),
          })),
        };
      }

      if (fields && "entity_id" in fields) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              groupBy: vi.fn(() => Promise.resolve(options.likeRows ?? [])),
            })),
          })),
        };
      }

      if (fields && "payload" in fields) {
        return {
          from: vi.fn((table: unknown) => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => Promise.resolve(rowsForTable(getTableName(table)))),
            })),
          })),
        };
      }

      if (fields && "activity" in fields) {
        const where = vi.fn(() => ({
          orderBy,
          limit: vi.fn(() => Promise.resolve(options.joinedRows ?? options.activityRows ?? [])),
        }));
        return {
          from: vi.fn(() => ({
            where,
            leftJoin: vi.fn(() => {
              const joinedBuilder = {
                where,
              };
              return joinedBuilder;
            }),
          })),
        };
      }

      return {
        from: vi.fn((table: unknown) => {
          const builder = {
            leftJoin: vi.fn(() => builder),
            innerJoin: vi.fn(() => builder),
            where: vi.fn((condition: unknown) => {
              selectWhere(condition);
              const rows = rowsForTable(getTableName(table));
              const resolveRows = () => Promise.resolve(rows);
              return {
                limit: vi.fn(resolveRows),
                orderBy:
                  getTableName(table) === "activities"
                    ? orderBy
                    : getTableName(table) === "activity_efforts"
                      ? vi.fn(() => Promise.resolve(rows))
                      : getTableName(table) === "activity_session_rpe_evidence"
                        ? vi.fn(() => Promise.resolve(rows))
                        : vi.fn(() => ({ limit: vi.fn(resolveRows) })),
                then: (onFulfilled: (value: unknown[]) => unknown) =>
                  Promise.resolve(rows).then(onFulfilled),
              };
            }),
          };

          return builder;
        }),
      };
    }),
    execute: vi.fn(async () => ({ rows: options.executeRows ?? [] })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((values: unknown) => {
        const tableName = getTableName(table);
        insertValues(tableName, values);

        const insertBuilder = {
          onConflictDoUpdate: vi.fn(() => insertBuilder),
          onConflictDoNothing: vi.fn(() => insertBuilder),
          returning: vi.fn(() =>
            Promise.resolve(
              options.insertedRowsByTable?.[tableName] ??
                (tableName === "activity_artifacts"
                  ? [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }]
                  : tableName === "activity_artifact_links"
                    ? [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }]
                    : (options.executeRows ?? [])),
            ),
          ),
        };
        return insertBuilder;
      }),
    })),
    transaction: vi.fn(
      async (callback: (tx: unknown) => unknown, _config?: Record<string, unknown>) => {
        if (options.transactionError) throw options.transactionError;
        transactionActivityRows = [...(options.activityRows ?? [])].sort(
          (a, b) => b.started_at.getTime() - a.started_at.getTime() || b.id.localeCompare(a.id),
        );
        commonLoadScanIndex = 0;
        commonLoadScanBatchNumber = 0;
        try {
          return await callback(db);
        } finally {
          transactionActivityRows = undefined;
        }
      },
    ),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve(options.updatedRows ?? [])),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: deleteWhere,
    })),
    query: {
      activities: {
        findFirst: createSequencedFn(options.queryActivitiesFindFirst ?? []),
      },
      activityArtifacts: {
        findFirst: createSequencedFn(
          options.queryActivityArtifactsFindFirst ?? [
            {
              digest: ACCEPTED_ARTIFACT.sha256,
              byte_size: ACCEPTED_ARTIFACT.byteSize,
              bucket: ACCEPTED_ARTIFACT.bucket,
              path: ACCEPTED_ARTIFACT.path,
              media_type: ACCEPTED_ARTIFACT.mediaType,
              format: ACCEPTED_ARTIFACT.format,
              original_name: null,
            },
          ],
        ),
      },
      activityFileIngestions: {
        findFirst: createSequencedFn(options.queryActivityFileIngestionsFindFirst ?? []),
      },
      activityGeometry: {
        findFirst: createSequencedFn(options.queryActivityGeometryFindFirst ?? []),
      },
      activityImports: {
        findFirst: createSequencedFn(options.queryActivityImportsFindFirst ?? []),
      },
      activitySummaries: {
        findFirst: createSequencedFn(options.queryActivitySummariesFindFirst ?? []),
      },
      events: {
        findFirst: createSequencedFn(options.queryEventsFindFirst ?? []),
      },
      likes: {
        findFirst: createSequencedFn(options.queryLikesFindFirst ?? []),
      },
    },
    __spies: {
      deleteWhere,
      limit,
      offset,
      orderBy,
      selectWhere,
      commonLoadLimit,
      insertValues,
    },
  };

  return db;
}

beforeEach(() => {
  vi.clearAllMocks();
  activityCategories.clear();
  mockActivityAnalysis.buildActivityDerivedSummaryMap.mockResolvedValue(new Map());
  mockActivityAnalysis.buildActivitySegmentDerivedSummaries.mockResolvedValue([]);
  mockActivityAnalysis.loadActivitySegmentsByActivityId.mockImplementation(
    async (_db: unknown, activityIds: string[]) =>
      new Map(
        activityIds.map((activityId) => [
          activityId,
          [buildSegmentReadRow(activityId, 0, activityCategories.get(activityId) ?? "run")],
        ]),
      ),
  );
  mockActivityAnalysis.resolveActivityContextAsOf.mockResolvedValue({});
  mobileUploadFlow.loadAcceptedArtifactForClaim.mockResolvedValue(ACCEPTED_ARTIFACT);
  mobileUploadFlow.retryMobileRecordingStagingCleanup.mockResolvedValue(true);
  mobileUploadFlow.prepareMobileRecordingArtifact.mockResolvedValue({
    status: "claimed",
    ingestion: { id: INGESTION_ID, expected_sha256: ACCEPTED_ARTIFACT.sha256 },
    claimToken: "33333333-3333-4333-8333-333333333333",
    staging: {
      bucket: "activity-files",
      path: `mobile-recordings/${OWNER_ID}/${ACTIVITY_ID}.fit`,
      bytes: new Uint8Array([1, 2, 3]),
      format: "fit",
      mediaType: "application/vnd.ant.fit",
    },
  });
  artifactFinalizer.finalizeActivityArtifactIngestion.mockImplementation(
    async (_db: unknown, input: { submit: (value: unknown) => Promise<unknown> }) =>
      input.submit({ parsedData: null, artifact: ACCEPTED_ARTIFACT }),
  );
  mockActivityAnalysis.analyzeActivityDerivedMetrics.mockReturnValue({
    stress: {
      common_load: availableCommonLoad(50),
      trimp: null,
    },
    zones: { hr: [], power: [] },
    computed_as_of: "2026-01-01T00:00:00.000Z",
  });
});

describe("activitiesRouter", () => {
  it("lists paginated owned activities with like and derived summaries", async () => {
    const rows = [buildActivityRow()];
    const firstRow = rows[0];
    if (!firstRow) throw new Error("Expected an activity row fixture");
    const derived = parentDerivedSummary(ACTIVITY_ID, availableCommonLoad(72));
    const publicDerived = {
      common_load: derived.common_load,
      computed_as_of: derived.computed_as_of,
      observationQuantification: derived.observationQuantification,
    };
    const db = createDbMock({
      activityRows: rows,
      likeRows: [{ entity_id: ACTIVITY_ID, likes_count: 3, has_liked: true }],
    });

    mockActivityAnalysis.buildActivityDerivedSummaryMap.mockResolvedValue(
      new Map([[ACTIVITY_ID, derived]]),
    );

    const caller = createCaller(db);
    const result = await caller.listPaginated({
      date_from: "2026-01-01T00:00:00.000Z",
      date_to: "2026-01-31T23:59:59.999Z",
    });

    expect(result.items[0]).toMatchObject({
      contractVersion: "activity-display-v1",
      id: ACTIVITY_ID,
      title: "Morning Run",
    });
    expect(result.items[0]?.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "common_load", status: "available", value: 72 }),
        expect.objectContaining({ key: "normalized_intensity", status: "available" }),
      ]),
    );
    expect(result.items[0]?.capabilities).toMatchObject({ canEdit: true, canDelete: true });
    expect(result.items[0]).not.toHaveProperty("profile_id");
    expect(result.items[0]).not.toHaveProperty("derived");
    expect(result.items[0]).not.toHaveProperty("matched_category_summary");
    expect(mockActivityAnalysis.buildActivityDerivedSummaryMap).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: OWNER_ID,
        activities: [expect.objectContaining({ id: ACTIVITY_ID, segments: expect.any(Array) })],
      }),
    );
    expect(toSql(db.__spies.selectWhere.mock.calls[0]?.[0])).not.toContain("select count(*)");
  });

  it("filters by multisport composition and returns activity_category-safe discovery DTOs", async () => {
    const activity = buildActivityRow();
    const segments = [
      buildSegmentReadRow(ACTIVITY_ID, 0, "bike", {
        summary: {
          version: 1,
          timing: { timingCoverage: "complete", activeMs: 1_000, movingMs: 900 },
          distanceMeters: 1_000,
        },
      }),
      buildSegmentReadRow(ACTIVITY_ID, 1, "run", {
        active_ms: 2_000,
        moving_ms: 1_800,
        summary: {
          version: 1,
          timing: { timingCoverage: "complete", activeMs: 2_000, movingMs: 1_800 },
          distanceMeters: 500,
        },
      }),
      buildSegmentReadRow(ACTIVITY_ID, 2, "run", {
        active_ms: 3_000,
        moving_ms: 2_700,
        summary: {
          version: 1,
          timing: { timingCoverage: "complete", activeMs: 3_000, movingMs: 2_700 },
          distanceMeters: 700,
        },
      }),
    ];
    mockActivityAnalysis.loadActivitySegmentsByActivityId.mockResolvedValue(
      new Map([[ACTIVITY_ID, segments]]),
    );
    mockActivityAnalysis.buildActivitySegmentDerivedSummaries.mockResolvedValue(
      segments.slice(1).map((segment, index) =>
        segmentDerivedSummary({
          activityId: ACTIVITY_ID,
          segmentId: segment.id,
          commonLoad: availableCommonLoad(index === 0 ? 20 : 30),
          distanceMeters: index === 0 ? 500 : 700,
          activeSeconds: index === 0 ? 2 : 3,
          movingSeconds: index === 0 ? 1.8 : 2.7,
        }),
      ),
    );
    const db = createDbMock({ activityRows: [activity], totalRows: [{ total: 1 }] });

    const result = await createCaller(db).listPaginated({
      activity_category: "run",
      composition_mode: "multisport_only",
    });

    expect(result.items[0]).toMatchObject({
      contractVersion: "activity-display-v1",
      activityComposition: { kind: "multisport", categories: ["bike", "run", "run"] },
    });
    expect(result.items[0]).not.toHaveProperty("matched_category_summary");
    expect(result.items[0]).not.toHaveProperty("segment_loads");
    const whereSql = toSql(db.__spies.selectWhere.mock.calls[0]?.[0]);
    expect(whereSql).toContain('"activity_segments"."activity_category" =');
    expect(whereSql).toContain("select count(*)");
    expect(whereSql).toContain("> 1");
  });

  it.each([
    { sort_by: "distance" as const, expected: [ACTIVITY_ID_2, ACTIVITY_ID, ACTIVITY_ID_3] },
    { sort_by: "duration" as const, expected: [ACTIVITY_ID_2, ACTIVITY_ID, ACTIVITY_ID_3] },
    { sort_by: "common_load" as const, expected: [ACTIVITY_ID, ACTIVITY_ID_2, ACTIVITY_ID_3] },
  ])("sorts $sort_by by matched-activity_category values with nulls last", async ({
    sort_by,
    expected,
  }) => {
    const rows = [
      buildActivityRow({ id: ACTIVITY_ID }),
      buildActivityRow({ id: ACTIVITY_ID_2 }),
      buildActivityRow({ id: ACTIVITY_ID_3 }),
    ];
    const segmentByActivityId = new Map([
      [
        ACTIVITY_ID,
        [
          buildSegmentReadRow(ACTIVITY_ID, 0, "run", {
            active_ms: 1_000,
            moving_ms: 900,
            summary: {
              version: 1,
              timing: { timingCoverage: "complete", activeMs: 1_000, movingMs: 900 },
              distanceMeters: 100,
            },
          }),
        ],
      ],
      [
        ACTIVITY_ID_2,
        [
          buildSegmentReadRow(ACTIVITY_ID_2, 0, "run", {
            active_ms: 2_000,
            moving_ms: 1_800,
            summary: {
              version: 1,
              timing: { timingCoverage: "complete", activeMs: 2_000, movingMs: 1_800 },
              distanceMeters: 200,
            },
          }),
        ],
      ],
      [
        ACTIVITY_ID_3,
        [
          buildSegmentReadRow(ACTIVITY_ID_3, 0, "run", {
            timing_coverage: "unavailable",
            active_ms: null,
            moving_ms: null,
            summary: { version: 1, timing: { timingCoverage: "unavailable" } },
          }),
        ],
      ],
    ]);
    mockActivityAnalysis.loadActivitySegmentsByActivityId.mockImplementation(
      async (_db: unknown, activityIds: string[]) =>
        new Map(
          activityIds.map((activityId) => [activityId, segmentByActivityId.get(activityId) ?? []]),
        ),
    );
    mockActivityAnalysis.buildActivitySegmentDerivedSummaries.mockResolvedValue([
      segmentDerivedSummary({
        activityId: ACTIVITY_ID,
        segmentId: segmentByActivityId.get(ACTIVITY_ID)![0]!.id,
        commonLoad: availableCommonLoad(30),
        distanceMeters: 100,
        activeSeconds: 1,
        movingSeconds: 0.9,
      }),
      segmentDerivedSummary({
        activityId: ACTIVITY_ID_2,
        segmentId: segmentByActivityId.get(ACTIVITY_ID_2)![0]!.id,
        commonLoad: availableCommonLoad(10),
        distanceMeters: 200,
        activeSeconds: 2,
        movingSeconds: 1.8,
      }),
    ]);
    const db = createDbMock({ activityRows: rows, totalRows: [{ total: rows.length }] });

    const result = await createCaller(db).listPaginated({
      activity_category: "run",
      sort_by,
      sort_order: "desc",
      limit: 3,
    });

    expect(result.items.map((item) => item.id)).toEqual(expected);
    expect(result.items.at(-1)).not.toHaveProperty("matched_category_summary");
    expect(db.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
  });

  it("uses canonical parent values in paginated list responses", async () => {
    const rows = [
      buildActivityRow({
        distance_meters: 1,
        elapsed_ms: 2_000,
        active_ms: 2_000,
        moving_ms: 1_900,
        polyline: "legacy-polyline",
        map_bounds: { legacy: true },
      }),
    ];
    const db = createDbMock({
      activityRows: rows,
      activitySummaryRows: [
        buildActivitySummaryRow({
          distance_meters: 12345,
          duration_seconds: 3600,
        }),
      ],
      activityImportRows: [
        buildActivityImportRow({
          provider: "wahoo",
          external_id: "split-external-id",
        }),
      ],
      activityGeometryRows: [
        buildActivityGeometryRow({
          polyline: "split-polyline",
          map_bounds: { split: true },
        }),
      ],
    });

    const caller = createCaller(db);
    const result = await caller.listPaginated({
      date_from: "2026-01-01T00:00:00.000Z",
      date_to: "2026-01-31T23:59:59.999Z",
    });

    expect(result.items[0]).toMatchObject({
      capabilities: { hasRoute: true },
      metrics: expect.arrayContaining([
        expect.objectContaining({ key: "distance", value: 1 }),
        expect.objectContaining({ key: "elapsed_duration", value: 2 }),
        expect.objectContaining({ key: "active_duration", value: 2 }),
        expect.objectContaining({ key: "moving_duration", value: 1.9 }),
      ]),
    });
  });

  it("sorts paginated distance and duration queries by canonical parent values", async () => {
    const db = createDbMock({
      activityRows: [buildActivityRow()],
      totalRows: [{ total: 1 }],
      activitySummaryRows: [buildActivitySummaryRow({ distance_meters: 5000 })],
    });
    const caller = createCaller(db);

    await caller.listPaginated({
      sort_by: "distance",
      sort_order: "asc",
    });
    await caller.listPaginated({
      sort_by: "duration",
      sort_order: "desc",
    });

    const orderSql = db.__spies.orderBy.mock.calls.flat().map(toSql).join("\n");
    expect(orderSql).toContain('"activities"."distance_meters"');
    expect(orderSql).toContain(
      'coalesce("activities"."active_ms", "activities"."elapsed_ms") desc',
    );
  });

  it("sorts paginated results by derived common_load before slicing", async () => {
    const rows = [
      buildActivityRow({
        id: ACTIVITY_ID,
        name: "Easy Run",
        started_at: new Date("2026-01-12T08:00:00.000Z"),
        finished_at: new Date("2026-01-12T08:30:00.000Z"),
      }),
      buildActivityRow({
        id: ACTIVITY_ID_2,
        name: "Big Ride",
        activity_category: "bike",
        started_at: new Date("2026-01-11T08:00:00.000Z"),
        finished_at: new Date("2026-01-11T10:00:00.000Z"),
      }),
      buildActivityRow({
        id: ACTIVITY_ID_3,
        name: "Tempo Run",
        started_at: new Date("2026-01-10T08:00:00.000Z"),
        finished_at: new Date("2026-01-10T08:50:00.000Z"),
      }),
    ];
    const db = createDbMock({
      activityRows: rows,
      totalRows: [{ total: 3 }],
    });

    mockActivityAnalysis.buildActivityDerivedSummaryMap.mockResolvedValue(
      new Map([
        [ACTIVITY_ID, parentDerivedSummary(ACTIVITY_ID, availableCommonLoad(20))],
        [ACTIVITY_ID_2, parentDerivedSummary(ACTIVITY_ID_2, availableCommonLoad(95, "bike"))],
        [ACTIVITY_ID_3, parentDerivedSummary(ACTIVITY_ID_3, availableCommonLoad(60))],
      ]),
    );

    const caller = createCaller(db);
    const result = await caller.listPaginated({
      limit: 2,
      cursor: "index:1",
      sort_by: "common_load",
      sort_order: "desc",
    });

    expect(result.total).toBe(3);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeUndefined();
    expect(result.items.map((item: any) => item.id)).toEqual([ACTIVITY_ID_3, ACTIVITY_ID]);
    expect(db.__spies.commonLoadLimit).toHaveBeenCalledWith(3);
    expect(db.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
  });

  it("deep-pages globally sorted common_load with keyset scan plans, bounded query counts, and stable ties", async () => {
    const rows = Array.from({ length: 5_000 }, (_, index) =>
      buildActivityRow({
        id: `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
        name: `Activity ${index}`,
        started_at: new Date(Date.UTC(2025, 0, 1) + index * 1000),
        finished_at: new Date(Date.UTC(2025, 0, 1) + index * 1000 + 500),
      }),
    );
    const commonLoadById = new Map(
      rows.map((row, index) => [row.id, index < 5 ? null : Math.floor(index / 2)]),
    );
    const commonLoadResultById = new Map(
      rows.map((row) => {
        const commonLoad = commonLoadById.get(row.id);
        return [
          row.id,
          commonLoad === null || commonLoad === undefined
            ? unavailableCommonLoad("threshold_missing")
            : availableCommonLoad(commonLoad),
        ] as const;
      }),
    );
    const commonLoadAggregateById = new Map(
      rows.map((row) => {
        const commonLoad = commonLoadResultById.get(row.id);
        return [
          row.id,
          aggregateCommonLoad([commonLoad ?? unavailableCommonLoad("threshold_missing")]),
        ];
      }),
    );
    // Keep the benchmark focused on bounded scan/sort behavior. Canonical quantification
    // parsing is covered separately and must not be repeated 15,000 times inside the timer.
    const derivedSummaryById = new Map(
      rows.map((row) => [
        row.id,
        parentDerivedSummary(
          row.id,
          commonLoadResultById.get(row.id) ?? unavailableCommonLoad("threshold_missing"),
          "2026-01-01T00:00:00.000Z",
        ),
      ]),
    );
    mockActivityAnalysis.buildActivityDerivedSummaryMap.mockImplementation(
      async ({ activities: batch }: { activities: Array<{ id: string }> }) =>
        new Map(batch.map((activity) => [activity.id, derivedSummaryById.get(activity.id)])),
    );
    const expected = (sortOrder: "asc" | "desc") =>
      rows
        .map((activity) => {
          const commonLoad = commonLoadAggregateById.get(activity.id);
          return {
            activity,
            commonLoad: commonLoad?.status === "unavailable" ? null : (commonLoad?.load ?? null),
          };
        })
        .sort((a, b) => {
          if (a.commonLoad !== b.commonLoad) {
            if (a.commonLoad === null) return 1;
            if (b.commonLoad === null) return -1;
            return sortOrder === "asc" ? a.commonLoad - b.commonLoad : b.commonLoad - a.commonLoad;
          }
          return (
            b.activity.started_at.getTime() - a.activity.started_at.getTime() ||
            a.activity.id.localeCompare(b.activity.id)
          );
        })
        .map(({ activity }) => activity.id);
    const benchmarkSamples: number[] = [];

    for (const testCase of [
      { offset: 4_900, limit: 20, sortOrder: "asc" as const },
      { offset: 4_950, limit: 10, sortOrder: "desc" as const },
      { offset: 4_975, limit: 15, sortOrder: "desc" as const },
    ]) {
      const db = createDbMock({ activityRows: rows, totalRows: [{ total: rows.length }] });
      // CPU time keeps this regression budget stable when the workspace test runner
      // schedules other package suites concurrently on the same host.
      const benchmarkStart = process.threadCpuUsage();
      const result = await createCaller(db).listPaginated({
        limit: testCase.limit,
        cursor: `index:${testCase.offset}`,
        sort_by: "common_load",
        sort_order: testCase.sortOrder,
      });
      const elapsedCpu = process.threadCpuUsage(benchmarkStart);
      benchmarkSamples.push((elapsedCpu.user + elapsedCpu.system) / 1_000);

      expect(result.items.map((item) => item.id)).toEqual(
        expected(testCase.sortOrder).slice(testCase.offset, testCase.offset + testCase.limit),
      );
      expect(result.total).toBe(5_000);
      expect(result.hasMore).toBe(testCase.offset + testCase.limit < 5_000);
      expect(result.nextCursor).toBe(
        testCase.offset + testCase.limit < 5_000
          ? `index:${testCase.offset + testCase.limit}`
          : undefined,
      );
      expect(db.__spies.offset).not.toHaveBeenCalled();
      expect(db.__spies.commonLoadLimit).toHaveBeenCalledTimes(25);
      expect(db.__spies.commonLoadLimit.mock.calls.every(([value]) => value === 200)).toBe(true);
      expect(db.__spies.orderBy).toHaveBeenCalledTimes(25);
      const orderSql = db.__spies.orderBy.mock.calls[0]?.map(toSql).join(" ") ?? "";
      expect(orderSql).toContain('"activities"."started_at" desc');
      expect(orderSql).toContain('"activities"."id" desc');
      const keysetWhereSql = toSql(db.__spies.selectWhere.mock.calls[1]?.[0]);
      expect(keysetWhereSql).toContain('"activities"."started_at" <');
      expect(keysetWhereSql).toContain('"activities"."id" <');
    }

    benchmarkSamples.sort((a, b) => a - b);
    const p95 = benchmarkSamples[Math.ceil(benchmarkSamples.length * 0.95) - 1] ?? 0;
    expect(mockActivityAnalysis.buildActivityDerivedSummaryMap).toHaveBeenCalledTimes(3);
    expect(p95, `5,000-row deep common_load pagination CPU p95=${p95.toFixed(2)}ms`).toBeLessThan(
      750,
    );
  }, 15_000);

  it("keeps an internal common_load scan on one snapshot when an activity is inserted concurrently", async () => {
    const rows = Array.from({ length: 401 }, (_, index) =>
      buildActivityRow({
        id: `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
        started_at: new Date(Date.UTC(2026, 0, 1) + index * 1000),
        finished_at: new Date(Date.UTC(2026, 0, 1) + index * 1000 + 500),
      }),
    );
    const concurrentlyInserted = buildActivityRow({
      id: "99999999-9999-4999-8999-999999999999",
      started_at: new Date(Date.UTC(2026, 0, 1) + 150_500),
      finished_at: new Date(Date.UTC(2026, 0, 1) + 151_000),
    });
    const db = createDbMock({
      activityRows: rows,
      totalRows: [{ total: rows.length }],
      onCommonLoadScanBatch: (batchNumber) => {
        if (batchNumber === 1) rows.push(concurrentlyInserted);
      },
    });
    mockActivityAnalysis.buildActivityDerivedSummaryMap.mockImplementation(
      async ({ activities: candidates }: { activities: Array<{ id: string }> }) =>
        new Map(
          candidates.map((activity, index) => [
            activity.id,
            parentDerivedSummary(
              activity.id,
              availableCommonLoad(index),
              "2026-01-01T00:00:00.000Z",
            ),
          ]),
        ),
    );

    const result = await createCaller(db).listPaginated({
      limit: 50,
      cursor: "index:350",
      sort_by: "common_load",
      sort_order: "asc",
    });

    const derivedCandidates = mockActivityAnalysis.buildActivityDerivedSummaryMap.mock.calls[0]?.[0]
      .activities as Array<{ id: string }>;
    expect(derivedCandidates).toHaveLength(401);
    expect(new Set(derivedCandidates.map(({ id }) => id)).size).toBe(401);
    expect(derivedCandidates.map(({ id }) => id)).not.toContain(concurrentlyInserted.id);
    expect(result.total).toBe(401);
    expect(db.__spies.commonLoadLimit).toHaveBeenCalledTimes(3);
    expect(db.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
  });

  it("rejects unbounded exact common_load sorts above the documented history ceiling", async () => {
    const db = createDbMock({ totalRows: [{ total: 10_001 }] });

    await expect(
      createCaller(db).listPaginated({ sort_by: "common_load", sort_order: "desc" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message:
        "Common Load sorting supports at most 10000 matching activities; narrow the activity filters.",
    });
    expect(db.__spies.orderBy).not.toHaveBeenCalled();
    expect(mockActivityAnalysis.buildActivityDerivedSummaryMap).not.toHaveBeenCalled();
  });

  it("rejects a sessionless accepted-artifact recording submission", async () => {
    const createdActivity = buildActivityRow({
      id: ACTIVITY_ID,
      activity_plan_id: PLAN_ID,
      name: "Recorder Run",
      notes: "Phone GPS",
      activity_category: "run",
      started_at: new Date("2026-01-15T09:00:00.000Z"),
      finished_at: new Date("2026-01-15T10:00:00.000Z"),
    });
    const ingestion = buildActivityFileIngestionRow({ status: "ready" });
    const db = createDbMock({
      insertedRowsByTable: {
        activities: [createdActivity],
        activity_file_ingestions: [ingestion],
      },
      queryActivitiesFindFirst: [undefined, createdActivity],
      queryActivityFileIngestionsFindFirst: [undefined, ingestion],
      queryActivitySummariesFindFirst: [
        buildActivitySummaryRow({
          activity_id: ACTIVITY_ID,
          duration_seconds: 3600,
          moving_seconds: 3500,
          distance_meters: 10000,
          calories: 640,
        }),
      ],
    });

    const caller = createCaller(db);
    await expect(
      caller.createFromRecordingSummary({
        profileId: OWNER_ID,
        name: "Recorder Run",
        notes: "Phone GPS",
        activityPlanId: PLAN_ID,
        startedAt: "2026-01-15T09:00:00.000Z",
        finishedAt: "2026-01-15T10:00:00.000Z",
        executionManifest: recordingExecutionManifest(),
        acceptedArtifact: ACCEPTED_ARTIFACT,
        summary: { distanceMeters: 10000, calories: 640 },
      } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("persists an ordered multisport execution manifest without parent activity_category transport", async () => {
    const bikeSegmentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
    const transitionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
    const runSegmentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
    const createdActivity = buildActivityRow({ id: ACTIVITY_ID, activity_category: "bike" });
    const ingestion = buildActivityFileIngestionRow({ status: "ready" });
    const db = createDbMock({
      insertedRowsByTable: {
        activities: [createdActivity],
        activity_file_ingestions: [ingestion],
      },
      queryActivitiesFindFirst: [undefined, createdActivity],
      queryActivityFileIngestionsFindFirst: [ingestion],
      activityFileIngestionRows: [{ id: INGESTION_ID }],
    });

    await createCaller(db).createFromRecordingSummary({
      ...recordingCreateInput(),
      executionManifest: {
        ...recordingExecutionManifest(),
        occurrences: [
          {
            ...recordingExecutionManifest("bike").occurrences[0]!,
            segmentId: bikeSegmentId,
            completedAt: "2026-01-15T09:25:00.000Z",
            activeSeconds: 1500,
            movingSeconds: 1450,
          },
          {
            ...recordingExecutionManifest().occurrences[0]!,
            occurrenceId: "occurrence-transition",
            globalOrdinal: 1,
            segmentId: transitionId,
            role: "transition",
            activity_category: null,
            startedAt: "2026-01-15T09:25:00.000Z",
            completedAt: "2026-01-15T09:30:00.000Z",
            activeSeconds: 300,
            movingSeconds: 300,
            distanceMeters: 0,
          },
          {
            ...recordingExecutionManifest("run").occurrences[0]!,
            occurrenceId: "occurrence-run",
            globalOrdinal: 2,
            segmentId: runSegmentId,
            startedAt: "2026-01-15T09:30:00.000Z",
            completedAt: "2026-01-15T10:00:00.000Z",
            activeSeconds: 1800,
            movingSeconds: 1750,
          },
        ],
      },
    });

    expect(findInsertedValue(db, "activity_segments")).toEqual([
      expect.objectContaining({
        id: bikeSegmentId,
        ordinal: 0,
        role: "activity",
        activity_category: "bike",
      }),
      expect.objectContaining({
        id: transitionId,
        ordinal: 1,
        role: "transition",
        activity_category: null,
      }),
      expect.objectContaining({
        id: runSegmentId,
        ordinal: 2,
        role: "activity",
        activity_category: "run",
      }),
    ]);
  });

  it("rejects a legacy segment-category recording plan before persistence", async () => {
    const createdActivity = buildActivityRow({
      id: ACTIVITY_ID,
      activity_plan_id: null,
      activity_category: "run",
    });
    const ingestion = buildActivityFileIngestionRow({ status: "ready" });
    const db = createDbMock({
      activityPlanRows: [
        {
          id: PLAN_ID,
          contentVisibility: "private",
          isSystem: false,
          ownerProfileId: OWNER_ID,
          structure: {
            version: 3,
            segments: activityPlanStructure("bike", 2).segments.map((segment, index) => ({
              ...segment,
              activity_category: index === 0 ? "bike" : "run",
            })),
          },
        },
      ],
      insertedRowsByTable: {
        activities: [createdActivity],
        activity_file_ingestions: [ingestion],
      },
      queryActivitiesFindFirst: [undefined, createdActivity],
      queryActivityFileIngestionsFindFirst: [ingestion],
    });

    await expect(
      createCaller(db).createFromRecordingSummary({
        ...recordingCreateInput(),
        activityPlanId: PLAN_ID,
        content_visibility: "private",
        recordingSessionId: "mixed-plan-rejection",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(findInsertedValue(db, "activities")).toBeUndefined();
  });

  it("rejects recording summary creation for another profile", async () => {
    const caller = createCaller(createDbMock({}));

    await expect(
      caller.createFromRecordingSummary({
        ...recordingCreateInput(OTHER_ID),
        name: "Other Run",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns the existing activity for a repeated recording session", async () => {
    const createdActivity = buildActivityRow({ id: ACTIVITY_ID, profile_id: OWNER_ID });
    const ingestion = buildActivityFileIngestionRow({
      activity_id: ACTIVITY_ID,
      profile_id: OWNER_ID,
      status: "ready",
    });
    const db = createDbMock({
      queryActivitiesFindFirst: [createdActivity],
      queryActivityFileIngestionsFindFirst: [ingestion],
    });
    const caller = createCaller(db);

    const result = await caller.createFromRecordingSummary({
      ...recordingCreateInput(),
      recordingSessionId: ACTIVITY_ID,
    });

    expect(result).toMatchObject({
      id: ACTIVITY_ID,
      ingestion: { id: ingestion.id, source: ingestion.source, status: ingestion.status },
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("returns the committed activity when concurrent creation loses the insert race", async () => {
    const createdActivity = buildActivityRow({ id: ACTIVITY_ID, profile_id: OWNER_ID });
    const ingestion = buildActivityFileIngestionRow({
      activity_id: ACTIVITY_ID,
      profile_id: OWNER_ID,
      status: "ready",
    });
    const db = createDbMock({
      queryActivitiesFindFirst: [undefined, createdActivity],
      queryActivityFileIngestionsFindFirst: [ingestion],
      transactionError: new Error("duplicate key"),
    });
    const caller = createCaller(db);

    const result = await caller.createFromRecordingSummary({
      ...recordingCreateInput(),
      recordingSessionId: "profile-activity-session",
    });

    expect(result).toMatchObject({
      id: ACTIVITY_ID,
      ingestion: { id: ingestion.id },
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects the removed accepted-artifact recording transport", async () => {
    await expect(
      createCaller(createDbMock({})).createFromRecordingSummary({
        ...recordingCreateInput(),
        uploadedArtifact: undefined,
        acceptedArtifact: { ...ACCEPTED_ARTIFACT, path: "staging/attacker-controlled.fit" },
      } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects recording manifests outside the parent time range", async () => {
    const caller = createCaller(createDbMock({}));

    await expect(
      caller.createFromRecordingSummary({
        ...recordingCreateInput(),
        name: "Bad Run",
        executionManifest: { ...recordingExecutionManifest(), occurrences: [] },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(
      caller.createFromRecordingSummary({
        ...recordingCreateInput(),
        name: "Backwards Run",
        startedAt: "2026-01-15T10:00:00.000Z",
        finishedAt: "2026-01-15T09:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("redacts derived load for an accessible activity owned by another athlete", async () => {
    const finishedAt = new Date("2026-01-09T08:45:00.000Z");
    const activity = buildActivityRow({
      id: ACTIVITY_ID,
      profile_id: OTHER_ID,
      activity_plan_id: PLAN_ID,
      name: "Shared Run",
      started_at: new Date("2026-01-09T08:00:00.000Z"),
      finished_at: finishedAt,
      avg_heart_rate: 150,
      max_heart_rate: 175,
    });
    const activityPlan = buildActivityPlanRow();
    const db = createDbMock({
      queryActivitiesFindFirst: [
        {
          profile_id: OTHER_ID,
          content_visibility: "public",
        },
      ],
      joinedRows: [{ activity, activityPlan }],
      likeRows: [{ entity_id: ACTIVITY_ID, likes_count: 5, has_liked: true }],
      sessionRpeEvidenceRows: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          profileId: OTHER_ID,
          activityId: ACTIVITY_ID,
          recordedAt: new Date("2026-01-09T08:46:00.000Z"),
          correctedAt: null,
          rpe: 8,
          scale: "borg_cr10",
          scaleVersion: "1",
          source: "manual",
          operationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          correctionOfId: null,
          provenance: { observation_type: "completed_session_rpe" },
          createdAt: new Date("2026-01-09T08:46:00.000Z"),
        },
      ],
    });

    mockActivityAnalysis.resolveActivityContextAsOf.mockResolvedValue({
      baseline: "context",
    });
    const caller = createCaller(db, OWNER_ID);
    const result = await caller.getById({ id: ACTIVITY_ID });

    expect(result.detail.summary).toMatchObject({
      contractVersion: "activity-display-v1",
      id: ACTIVITY_ID,
      title: activity.name,
    });
    expect(result.detail.summary.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "common_load",
          status: "unavailable",
          reason: "no_load_data",
        }),
        expect.objectContaining({
          key: "normalized_intensity",
          status: "unavailable",
          reason: "no_load_data",
        }),
      ]),
    );
    expect(result.detail.summary.capabilities).toMatchObject({ canEdit: false, canDelete: false });
    expect(result.detail).toMatchObject({
      contractVersion: "activity-detail-display-v1",
      laps: [],
      linkedPlan: null,
      currentArtifact: null,
      ingestion: null,
      effectiveSessionRpe: null,
    });
    expect(result.analysis).toEqual({
      derived: expect.objectContaining({
        stress: expect.objectContaining({
          common_load: expect.objectContaining({
            status: "unavailable",
            model: COMMON_RELATIVE_LOAD_MODEL,
            version: COMMON_RELATIVE_LOAD_VERSION,
            reason: "no_load_data",
            totalActivityCount: 1,
            unavailableActivityCount: 1,
          }),
          trimp: null,
          trimp_source: null,
          training_effect: null,
        }),
        zones: { hr: [], power: [] },
        computed_as_of: activity.started_at.toISOString(),
        observationQuantification: expect.objectContaining({
          summary: expect.objectContaining({
            kind: "aggregate",
            duration: expect.objectContaining({
              elapsed: expect.objectContaining({ status: "unavailable" }),
            }),
            distance: expect.objectContaining({ status: "unavailable" }),
          }),
        }),
      }),
      segmentLoads: [],
    });
    expect(mockActivityAnalysis.resolveActivityContextAsOf).not.toHaveBeenCalled();
    expect(mockActivityAnalysis.analyzeActivityDerivedMetrics).not.toHaveBeenCalled();
  });

  it("returns immutable derived efforts through the authorized activity view", async () => {
    const activity = buildActivityRow({ profile_id: OWNER_ID });
    const effort = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      created_at: new Date("2026-01-09T09:00:00.000Z"),
      profile_id: OWNER_ID,
      activity_id: ACTIVITY_ID,
      segment_id: SEGMENT_ID,
      recorded_at: new Date("2026-01-09T08:20:00.000Z"),
      activity_category: "run",
      effort_type: "speed",
      duration_seconds: 1200,
      distance_meters: 5000,
      start_offset: 0,
      unit: "meters_per_second",
      value: 4.2,
      source: "derived",
      method: "activity_file_best_effort",
      calculation_version: "1",
      quality_score: 0.9,
      provenance: { parser: "fit" },
    };
    const db = createDbMock({
      queryActivitiesFindFirst: [{ profile_id: OWNER_ID, content_visibility: "private" }],
      joinedRows: [{ activity, activityPlan: null }],
      activityEffortRows: [effort],
    });

    await expect(createCaller(db).getEfforts({ id: ACTIVITY_ID })).resolves.toEqual([effort]);
    expect(db.__spies.selectWhere).toHaveBeenCalled();
  });

  it("keeps owner analysis metadata outside the strict stress DTO", async () => {
    const activity = buildActivityRow({ profile_id: OWNER_ID });
    const derived = parentDerivedSummary(ACTIVITY_ID, availableCommonLoad(72));
    const db = createDbMock({
      queryActivitiesFindFirst: [{ profile_id: OWNER_ID, content_visibility: "private" }],
      joinedRows: [{ activity, activityPlan: null }],
    });
    mockActivityAnalysis.buildActivityDerivedSummaryMap.mockResolvedValue(
      new Map([[ACTIVITY_ID, derived]]),
    );

    const result = await createCaller(db).getById({ id: ACTIVITY_ID });

    expect(result.analysis.derived).toMatchObject({
      computed_as_of: derived.computed_as_of,
      observationQuantification: derived.observationQuantification,
      stress: { common_load: derived.common_load },
    });
    expect(result.analysis.derived.stress).not.toHaveProperty("computed_as_of");
    expect(result.analysis.derived.stress).not.toHaveProperty("observationQuantification");
  });

  it("does not expose internal athlete-state columns in activity detail", async () => {
    const activity = buildActivityRow({
      profile_id: OWNER_ID,
      athlete_state_common_load: 72,
      athlete_state_activity_category: "run",
      athlete_state_evidence_confidence: 0.9,
      athlete_state_capability_distance_meters: 10_000,
      athlete_state_capability_duration_minutes: 45,
      athlete_state_input_version: 1,
      athlete_state_computed_at: new Date("2026-01-10T09:00:00.000Z"),
      canonical_evidence_tier: "raw_samples",
    });
    const db = createDbMock({
      queryActivitiesFindFirst: [{ profile_id: OWNER_ID, content_visibility: "private" }],
      joinedRows: [{ activity, activityPlan: null }],
    });

    const result = await createCaller(db).getById({ id: ACTIVITY_ID });

    expect(result.detail).not.toHaveProperty("canonical_evidence_tier");
    expect(result.detail).not.toHaveProperty("athlete_state_common_load");
    expect(result.detail).not.toHaveProperty("athlete_state_activity_category");
    expect(result.detail).not.toHaveProperty("athlete_state_evidence_confidence");
    expect(result.detail).not.toHaveProperty("athlete_state_capability_distance_meters");
    expect(result.detail).not.toHaveProperty("athlete_state_capability_duration_minutes");
    expect(result.detail).not.toHaveProperty("athlete_state_input_version");
    expect(result.detail).not.toHaveProperty("athlete_state_computed_at");
  });

  it("returns ordered completed multisport source identity to the owner without raw payloads", async () => {
    const activity = buildActivityRow({ profile_id: OWNER_ID });
    const sourceArtifactId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const segments = [
      {
        ...buildSegmentReadRow(ACTIVITY_ID, 0, "bike"),
        source_artifact_id: sourceArtifactId,
        source_session_index: 2,
        source_message_index: 8,
        raw_type_string: "session",
        raw_type_integer: null,
        raw_sport_string: null,
        raw_sport_integer: 2,
        raw_sub_sport_string: "road",
        raw_sub_sport_integer: null,
      },
      {
        ...buildSegmentReadRow(ACTIVITY_ID, 1, "run", {
          role: "unknown",
          activity_category: null,
        }),
        source_artifact_id: sourceArtifactId,
        source_session_index: 3,
        source_message_index: 9,
        raw_type_string: null,
        raw_type_integer: 99,
        raw_sport_string: "transition",
        raw_sport_integer: null,
        raw_sub_sport_string: null,
        raw_sub_sport_integer: 17,
      },
      {
        ...buildSegmentReadRow(ACTIVITY_ID, 2, "run"),
        source_artifact_id: sourceArtifactId,
        source_session_index: 4,
        source_message_index: 10,
        raw_type_string: "lap",
        raw_type_integer: null,
        raw_sport_string: "running",
        raw_sport_integer: null,
        raw_sub_sport_string: null,
        raw_sub_sport_integer: null,
      },
    ];
    mockActivityAnalysis.loadActivitySegmentsByActivityId.mockResolvedValue(
      new Map([[ACTIVITY_ID, segments]]),
    );
    const db = createDbMock({
      queryActivitiesFindFirst: [{ profile_id: OWNER_ID, content_visibility: "private" }],
      joinedRows: [{ activity, activityPlan: null }],
    });

    const result = await createCaller(db).getById({ id: ACTIVITY_ID });

    expect(result.detail.segments.map((segment) => segment.ordinal)).toEqual([0, 1, 2]);
    expect(result.detail.segments).not.toContainEqual(
      expect.objectContaining({ raw_payload: expect.anything() }),
    );
    expect(result.detail.segments).not.toContainEqual(
      expect.objectContaining({ coordinates: expect.anything() }),
    );
    expect(result.detail.segments).not.toContainEqual(
      expect.objectContaining({ raw_sub_sport_string: expect.anything() }),
    );
  });

  it("does not expose internal analysis metadata in activity detail segments", async () => {
    const activity = buildActivityRow({ profile_id: OWNER_ID });
    const segment = buildSegmentReadRow(ACTIVITY_ID, 0, "run", {
      summary_version: 1,
      segment_revision: 2,
      parser_version: "test-parser-v1",
      materializer_version: "test-materializer-v1",
    });
    mockActivityAnalysis.loadActivitySegmentsByActivityId.mockResolvedValue(
      new Map([[ACTIVITY_ID, [segment]]]),
    );
    const db = createDbMock({
      queryActivitiesFindFirst: [{ profile_id: OWNER_ID, content_visibility: "private" }],
      joinedRows: [{ activity, activityPlan: null }],
    });

    const result = await createCaller(db).getById({ id: ACTIVITY_ID });

    expect(result.detail.segments).toHaveLength(1);
    expect(result.detail.segments[0]).not.toHaveProperty("summary_version");
    expect(result.detail.segments[0]).not.toHaveProperty("segment_revision");
    expect(result.detail.segments[0]).not.toHaveProperty("parser_version");
    expect(result.detail.segments[0]).not.toHaveProperty("materializer_version");
  });

  it("returns the unique effective session RPE evidence only to the activity owner", async () => {
    const activity = buildActivityRow({ profile_id: OWNER_ID });
    const firstEvidenceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const effectiveEvidenceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const db = createDbMock({
      queryActivitiesFindFirst: [{ profile_id: OWNER_ID, content_visibility: "public" }],
      joinedRows: [{ activity, activityPlan: null }],
      sessionRpeEvidenceRows: [
        {
          id: effectiveEvidenceId,
          profileId: OWNER_ID,
          activityId: ACTIVITY_ID,
          recordedAt: new Date("2026-01-10T08:47:00.000Z"),
          correctedAt: new Date("2026-01-10T08:48:00.000Z"),
          rpe: 7,
          scale: "borg_cr10",
          scaleVersion: "1",
          source: "manual",
          operationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          correctionOfId: firstEvidenceId,
          provenance: {
            observation_type: "completed_session_rpe",
            entered_by: "athlete",
            correction_of_id: firstEvidenceId,
          },
          createdAt: new Date("2026-01-10T08:48:00.000Z"),
        },
      ],
    });

    const result = await createCaller(db).getById({ id: ACTIVITY_ID });

    expect(result.detail.effectiveSessionRpe).toEqual({
      id: effectiveEvidenceId,
      rpe: 7,
      scale: "borg_cr10",
      scaleVersion: "1",
      source: "manual",
      recordedAt: new Date("2026-01-10T08:47:00.000Z").toISOString(),
      correctedAt: new Date("2026-01-10T08:48:00.000Z").toISOString(),
    });
  });

  it("uses canonical parent detail values and preserves lap order", async () => {
    const normalizedPowerResult = calculateCyclingNormalizedPower({
      samples: [
        { timestampSeconds: 0, powerWatts: 200 },
        { timestampSeconds: 6, powerWatts: 200 },
        ...Array.from({ length: 29 }, (_, index) => ({
          timestampSeconds: index + 7,
          powerWatts: 200,
        })),
      ],
    });
    if (normalizedPowerResult.status !== "unavailable") {
      throw new Error("Expected an unavailable Normalized Power fixture");
    }
    const activity = buildActivityRow({
      id: ACTIVITY_ID,
      profile_id: OWNER_ID,
      distance_meters: 1,
      elapsed_ms: 2_000,
      active_ms: 2_000,
      moving_ms: 1_900,
      polyline: "legacy-polyline",
      map_bounds: { legacy: true },
      laps: [{ legacy: true }],
    });
    const canonicalSegment = buildSegmentReadRow(ACTIVITY_ID, 0, "run", {
      summary: {
        version: 1,
        timing: { timingCoverage: "complete", activeMs: 1_000, movingMs: 900 },
        normalizedPowerResult,
      },
    });
    mockActivityAnalysis.loadActivitySegmentsByActivityId.mockResolvedValue(
      new Map([[ACTIVITY_ID, [canonicalSegment]]]),
    );
    const db = createDbMock({
      queryActivitiesFindFirst: [
        {
          profile_id: OWNER_ID,
        },
      ],
      joinedRows: [{ activity, activityPlan: null }],
      queryActivitySummariesFindFirst: [
        buildActivitySummaryRow({
          distance_meters: 22222,
          duration_seconds: 3333,
        }),
      ],
      queryActivityImportsFindFirst: [
        buildActivityImportRow({
          external_id: "split-external-id",
        }),
      ],
      queryActivityGeometryFindFirst: [
        buildActivityGeometryRow({
          polyline: "split-polyline",
          map_bounds: { split: true },
        }),
      ],
      activityLapRows: [],
      currentArtifactRows: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          digest_algorithm: "sha256",
          digest: "a".repeat(64),
          byte_size: 123456,
          media_type: "application/vnd.ant.fit",
          format: "fit",
          original_name: "activity.fit",
          availability: "accepted",
          first_accepted_at: new Date("2026-01-10T09:00:00.000Z"),
        },
      ],
    });

    const caller = createCaller(db);
    const result = await caller.getById({ id: ACTIVITY_ID });

    expect(result.detail).toMatchObject({
      performance: {
        distanceMeters: 1,
        elapsedSeconds: 2,
        activeSeconds: 2,
        movingSeconds: 1.9,
      },
      routePolyline: "legacy-polyline",
      laps: [{ legacy: true }],
      segments: expect.any(Array),
      currentArtifact: expect.objectContaining({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        availability: "accepted",
      }),
    });
    const [projectedSegment] = result.detail.segments;
    expect(projectedSegment?.status).toBe("available");
    if (!projectedSegment || projectedSegment.status !== "available") {
      throw new Error("Expected an available segment analysis");
    }
    expect(projectedSegment.summary.normalizedPowerResult).toEqual(normalizedPowerResult);
    expect(projectedSegment.summary).not.toHaveProperty("normalizedPowerWatts");
    expect(projectedSegment.summary.normalizedPowerResult).toMatchObject({
      status: "unavailable",
      reason: "insufficient_window",
      calculationVersion: "cycling-normalized-power-v1",
      diagnostics: { sourceTimeCoverage: 29 / 35, excludedGapDurationSeconds: 6 },
    });
    expect(result.detail.summary.activityComposition).toMatchObject({
      kind: "single",
      categories: ["run"],
    });
  });

  it("updates an owned activity", async () => {
    const updated = buildActivityRow({
      id: ACTIVITY_ID,
      profile_id: OWNER_ID,
      name: "Renamed Run",
      notes: "Felt strong",
    });
    const db = createDbMock({
      updatedRows: [updated],
    });

    const caller = createCaller(db);
    const result = await caller.update({
      id: ACTIVITY_ID,
      name: "Renamed Run",
      notes: "Felt strong",
    });

    expect(result).toEqual(publicActivityRow(updated));
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("does not expose internal athlete-state columns after updating an activity", async () => {
    const updated = buildActivityRow({
      athlete_state_common_load: 72,
      athlete_state_activity_category: "run",
      athlete_state_evidence_confidence: 0.9,
      athlete_state_capability_distance_meters: 10_000,
      athlete_state_capability_duration_minutes: 45,
      athlete_state_input_version: 1,
      athlete_state_computed_at: new Date("2026-01-10T09:00:00.000Z"),
      canonical_evidence_tier: "raw_samples",
      content_visibility: "private",
    });
    const result = await createCaller(createDbMock({ updatedRows: [updated] })).update({
      id: ACTIVITY_ID,
      content_visibility: "private",
    });

    expect(result).toMatchObject({ content_visibility: "private" });
    expect(result).not.toHaveProperty("canonical_evidence_tier");
    expect(result).not.toHaveProperty("athlete_state_common_load");
    expect(result).not.toHaveProperty("athlete_state_activity_category");
    expect(result).not.toHaveProperty("athlete_state_evidence_confidence");
    expect(result).not.toHaveProperty("athlete_state_capability_distance_meters");
    expect(result).not.toHaveProperty("athlete_state_capability_duration_minutes");
    expect(result).not.toHaveProperty("athlete_state_input_version");
    expect(result).not.toHaveProperty("athlete_state_computed_at");
  });

  it("rejects the removed legacy privacy field without persisting it", async () => {
    const db = createDbMock({ updatedRows: [buildActivityRow()] });
    const legacyPrivacyField = ["is", "private"].join("_");

    await expect(
      createCaller(db).update({ id: ACTIVITY_ID, [legacyPrivacyField]: true } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("deletes an owned activity", async () => {
    const db = createDbMock({
      queryActivitiesFindFirst: [
        {
          id: ACTIVITY_ID,
          profile_id: OWNER_ID,
        },
      ],
    });

    const caller = createCaller(db);
    const result = await caller.delete({ id: ACTIVITY_ID });

    expect(result).toEqual({ success: true, deletedActivityId: ACTIVITY_ID });
    expect(db.__spies.deleteWhere).toHaveBeenCalledTimes(1);
  });

  it("rejects non-ISO paginated list date filters at the router boundary", async () => {
    const caller = createCaller(createDbMock({}));

    await expect(
      caller.listPaginated({
        date_from: "not-a-date",
        date_to: "2026-01-31T23:59:59.999Z",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects malformed activity rows before returning paginated list results", async () => {
    const db = createDbMock({
      activityRows: [
        {
          ...buildActivityRow(),
          id: "",
        },
      ],
    });
    const caller = createCaller(db);

    await expect(
      caller.listPaginated({
        date_from: "2026-01-01T00:00:00.000Z",
        date_to: "2026-01-31T23:59:59.999Z",
      }),
    ).rejects.toThrow();
  });
});
