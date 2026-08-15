import { selectThresholdCandidate } from "@repo/core/performance-calibration";
import { describe, expect, it, vi } from "vitest";
import {
  insertThresholdEvaluation,
  planThresholdChain,
  planThresholdEvaluationPersistence,
  readThresholdsAsOf,
  readThresholdsForRequests,
  reconstructThresholdPublicationReason,
  thresholdEffortId,
  thresholdEvaluationId,
} from "./threshold-repository";

const profileId = "11111111-1111-4111-8111-111111111111";
const activityId = "22222222-2222-4222-8222-222222222222";
const evaluationId = "33333333-3333-4333-8333-333333333333";
const effortId = "44444444-4444-4444-8444-444444444444";

function rootSnapshotDb(execute: ReturnType<typeof vi.fn>) {
  const snapshotExecutor = { execute };
  const transaction = vi.fn(async (read: (executor: typeof snapshotExecutor) => Promise<unknown>) =>
    read(snapshotExecutor),
  );
  return { $client: {}, transaction, execute, snapshotExecutor };
}

function candidate() {
  return {
    activityCategory: "run" as const,
    metric: "speed" as const,
    unit: "meters_per_second" as const,
    method: "run_speed_30m" as const,
    value: 4,
    sourceSeriesId: "segment:speed",
    sourceSeriesMetric: "speed" as const,
    startTimestampSeconds: 1_767_265_200,
    endTimestampSeconds: 1_767_267_000,
    exactWindowSeconds: 1_800,
    conversionFactor: 1,
    policyVersion: "threshold-policy-v1" as const,
    plausibilityVersion: "threshold-plausibility-v1" as const,
  };
}

function repositoryRead(
  options: { effectiveAt?: string; value?: number; count?: number; policyVersion?: string } = {},
) {
  const effectiveAt = options.effectiveAt ?? "2026-01-01T12:00:00.000Z";
  const thresholdRows = Array.from({ length: options.count ?? 1 }, (_, ordinal) => ({
    ordinal,
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    activity_category: "run",
    metric: "speed",
    value: options.value ?? 4,
    unit: "meters_per_second",
    confidence: 1,
    method: "run_speed_30m",
    effective_at: new Date(effectiveAt),
    policy_version: options.policyVersion ?? "threshold-policy-v1",
    evaluation_id: evaluationId,
    state: "provisional",
  }));
  const provenanceRows = [
    {
      published_evaluation_id: evaluationId,
      origin_evaluation_id: evaluationId,
      effort_id: effortId,
      source_activity_id: activityId,
      role: "primary",
      ordinal: 0,
    },
  ];
  const execute = vi
    .fn()
    .mockResolvedValueOnce({ rows: thresholdRows })
    .mockResolvedValueOnce({ rows: provenanceRows });
  return { ...rootSnapshotDb(execute), thresholdRows, provenanceRows };
}

function setBasedReadDb(thresholdRows: unknown[], provenanceRows: unknown[]) {
  const execute = vi
    .fn()
    .mockResolvedValueOnce({ rows: thresholdRows })
    .mockResolvedValueOnce({ rows: provenanceRows });
  return rootSnapshotDb(execute);
}

describe("threshold persistence identities", () => {
  it("reconstructs supported lower publications without confusing them with confirmation", () => {
    expect(
      reconstructThresholdPublicationReason({
        hasSupportingProvenance: true,
        value: 3.81,
        supersedesId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        supersededValue: 4.3,
        materialChangeRelativeThreshold: 0.03,
      }),
    ).toBe("supported_decrease");
    expect(
      reconstructThresholdPublicationReason({
        hasSupportingProvenance: true,
        value: 4.01,
        supersedesId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        supersededValue: 4,
        materialChangeRelativeThreshold: 0.03,
      }),
    ).toBe("independent_confirmation");
  });

  it("uses every immutable source-window field in the deterministic effort key", () => {
    const base = {
      activityId,
      segmentId: "55555555-5555-4555-8555-555555555555",
      sourceArtifactId: "66666666-6666-4666-8666-666666666666",
      sourceRevision: 3,
      effortType: "speed",
      sourceSeries: "raw_speed" as const,
      startOffsetMs: 2_000,
      endOffsetMs: 1_802_000,
      method: "activity_file_best_effort",
      calculationVersion: "best-effort-extraction-v1",
    };
    expect(thresholdEffortId(base)).toBe(thresholdEffortId(base));
    expect(thresholdEffortId({ ...base, sourceRevision: 4 })).not.toBe(thresholdEffortId(base));
    expect(thresholdEffortId({ ...base, startOffsetMs: 3_000 })).not.toBe(thresholdEffortId(base));
    expect(thresholdEffortId({ ...base, sourceSeries: "grade_adjusted_speed" })).not.toBe(
      thresholdEffortId(base),
    );
  });

  it("changes evaluation identity only when the immutable source or policy identity changes", () => {
    const base = {
      profileId,
      sourceActivityId: activityId,
      sourceRevision: 2,
      identity: { activityCategory: "bike" as const, metric: "power" as const },
      method: "bike_power_30m",
      policyVersion: "threshold-policy-v1",
    };
    expect(thresholdEvaluationId(base)).toBe(thresholdEvaluationId(base));
    expect(thresholdEvaluationId({ ...base, sourceRevision: 3 })).not.toBe(
      thresholdEvaluationId(base),
    );
  });

  it("accepts an identical evaluation replay and fails closed on same-revision divergence", async () => {
    const selection = selectThresholdCandidate({ activityCategory: "run", observations: [] });
    const evaluation = selection.attempts[0]?.evaluation;
    if (!evaluation) throw new Error("Expected Core rejection diagnostics");
    const now = new Date("2026-08-10T13:00:00.000Z");
    const observedAt = new Date("2026-08-10T12:00:00.000Z");
    const desired = {
      id: evaluationId,
      profile_id: profileId,
      activity_category: "run",
      metric: "speed",
      method: "run_speed_30m",
      outcome: "rejected",
      value: null,
      unit: "meters_per_second",
      confidence: null,
      observed_at: observedAt,
      rejection_reason: "series_missing" as "series_missing" | "source_not_accepted",
      policy_version: "threshold-policy-v1",
      diagnostics: {
        selection,
        candidate: null,
      },
      source_activity_id: activityId,
      source_revision: 2,
      created_at: now,
    } as const;
    const transaction = (existing: typeof desired) => {
      const select = vi
        .fn()
        .mockImplementationOnce(() => ({
          from: () => ({ where: () => ({ limit: vi.fn().mockResolvedValue([existing]) }) }),
        }))
        .mockImplementationOnce(() => ({
          from: () => ({ where: vi.fn().mockResolvedValue([]) }),
        }));
      return {
        insert: vi.fn(() => ({
          values: () => ({
            onConflictDoNothing: () => ({ returning: vi.fn().mockResolvedValue([]) }),
          }),
        })),
        select,
      };
    };
    const input = {
      id: evaluationId,
      profileId,
      identity: { activityCategory: "run" as const, metric: "speed" as const },
      evaluation,
      selection,
      persistedValue: null,
      sourceActivityId: activityId,
      sourceRevision: 2,
      observedAt,
      effortLinks: [],
      now,
    };
    await expect(insertThresholdEvaluation(transaction(desired) as never, input)).resolves.toEqual({
      row: desired,
      inserted: false,
    });
    await expect(
      insertThresholdEvaluation(
        transaction({ ...desired, rejection_reason: "source_not_accepted" }) as never,
        input,
      ),
    ).rejects.toThrow("replay diverged");
  });

  it("keeps a truthful source-local effort link for a measured rejection", async () => {
    const selection = selectThresholdCandidate({
      activityCategory: "run",
      observations: [
        {
          evidenceId: effortId,
          activityId,
          seriesId: "segment:speed",
          metric: "speed",
          sourceAccepted: true,
          ownershipVerified: true,
          availability: "available",
          durationSeconds: 1_800,
          value: 20,
          startTimestampSeconds: 0,
          endTimestampSeconds: 1_800,
          windowCoverage: 1,
          maximumGapSeconds: 2,
        },
      ],
    });
    const evaluation = selection.attempts[1]?.evaluation;
    if (!evaluation || evaluation.status !== "rejected") {
      throw new Error("Expected measured fallback rejection");
    }
    const primaryEffort = {
      effortId,
      activityId,
      sourceRevision: 1,
      effortType: "speed" as const,
      sourceSeries: "raw_speed" as const,
      role: "primary" as const,
      ordinal: 0,
    };

    await expect(
      planThresholdEvaluationPersistence({} as never, {
        id: evaluationId,
        profileId,
        identity: { activityCategory: "run", metric: "speed" },
        evaluation,
        selection,
        sourceActivityId: activityId,
        observedAt: new Date("2026-01-01T00:00:00.000Z"),
        primaryEffort,
      }),
    ).resolves.toEqual({ persistedValue: null, effortLinks: [primaryEffort] });
  });
});

describe("threshold as-of resolution", () => {
  it("returns an old threshold as usable without projecting repository freshness", async () => {
    const db = repositoryRead();
    const asOf = new Date("2026-08-10T12:00:00.000Z");
    await expect(readThresholdsAsOf(db as never, { profileId, asOf })).resolves.toEqual([
      expect.objectContaining({
        status: "available",
        activityCategory: "run",
        metric: "speed",
        value: 4,
        state: "provisional",
        sourceEvaluationIds: [evaluationId],
        sourceEffortIds: [effortId],
        sourceActivityIds: [activityId],
      }),
    ]);
    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(db.transaction).toHaveBeenCalledWith(expect.any(Function), {
      accessMode: "read only",
      isolationLevel: "repeatable read",
    });
  });

  it("does not leak a future threshold even if the database adapter over-returns it", async () => {
    const db = repositoryRead({ effectiveAt: "2026-08-11T12:00:00.000Z" });
    await expect(
      readThresholdsAsOf(db as never, {
        profileId,
        asOf: new Date("2026-08-10T12:00:00.000Z"),
      }),
    ).rejects.toThrow("future published truth");
  });

  it("reads persisted published truth without replaying evaluation diagnostics", async () => {
    const db = repositoryRead({ value: 4.1 });
    await expect(
      readThresholdsAsOf(db as never, {
        profileId,
        asOf: new Date("2026-08-10T12:00:00.000Z"),
      }),
    ).resolves.toEqual([expect.objectContaining({ value: 4.1 })]);
  });

  it("keeps compatible historical published rows readable across policy bumps", async () => {
    const db = repositoryRead({ policyVersion: "threshold-policy-v0" });
    await expect(
      readThresholdsAsOf(db as never, {
        profileId,
        asOf: new Date("2026-08-10T12:00:00.000Z"),
      }),
    ).resolves.toEqual([
      expect.objectContaining({ policyVersion: "threshold-policy-v0", value: 4 }),
    ]);
  });

  it("keeps query count fixed at the representative max batch", async () => {
    const db = repositoryRead({ count: 525 });
    const requests = Array.from({ length: 525 }, (_, index) => ({
      profileId,
      asOf: new Date(Date.parse("2026-01-02T12:00:00.000Z") + index * 1_000),
      ...(index % 2 === 0 ? {} : { excludedActivityId: crypto.randomUUID() }),
    }));

    const result = await readThresholdsForRequests(db as never, requests);

    expect(result).toHaveLength(525);
    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(result[0]?.[0]).toMatchObject({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    expect(result.at(-1)?.[0]).toMatchObject({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
  });

  it("preserves request order and matches single reads across owners, as-ofs, exclusions, and stale boundaries", async () => {
    const secondProfileId = "55555555-5555-4555-8555-555555555555";
    const secondEvaluationId = "66666666-6666-4666-8666-666666666666";
    const secondActivityId = "77777777-7777-4777-8777-777777777777";
    const secondEffortId = "88888888-8888-4888-8888-888888888888";
    const bikeEvaluationId = "99999999-9999-4999-8999-999999999999";
    const bikeActivityId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const bikeEffortId = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
    const directRow = (input: {
      ordinal: number;
      id: string;
      activityCategory: "bike" | "run";
      metric: "power" | "speed";
      value: number;
      unit: "watts" | "meters_per_second";
      confidence: number;
      method: "bike_power_30m" | "run_speed_30m";
      effectiveAt: string;
      evaluationId: string;
      state: "provisional" | "confirmed";
    }) => ({
      ordinal: input.ordinal,
      id: input.id,
      activity_category: input.activityCategory,
      metric: input.metric,
      value: input.value,
      unit: input.unit,
      confidence: input.confidence,
      method: input.method,
      effective_at: new Date(input.effectiveAt),
      policy_version: "threshold-policy-v1",
      evaluation_id: input.evaluationId,
      state: input.state,
    });
    const oldRun = {
      id: "10000000-0000-4000-8000-000000000001",
      activityCategory: "run",
      metric: "speed",
      value: 4,
      unit: "meters_per_second",
      confidence: 0.6,
      method: "run_speed_30m",
      effectiveAt: new Date("2026-01-01T12:00:00.000Z"),
      evaluationId,
      state: "provisional",
    } as const;
    const newRun = {
      id: "10000000-0000-4000-8000-000000000002",
      activityCategory: "run",
      metric: "speed",
      value: 4.01,
      unit: "meters_per_second",
      confidence: 0.95,
      method: "run_speed_30m",
      effectiveAt: new Date("2026-01-02T12:00:00.000Z"),
      evaluationId: secondEvaluationId,
      state: "confirmed",
    } as const;
    const bike = {
      id: "10000000-0000-4000-8000-000000000003",
      activityCategory: "bike",
      metric: "power",
      value: 250,
      unit: "watts",
      confidence: 0.8,
      method: "bike_power_30m",
      effectiveAt: new Date("2026-01-03T12:00:00.000Z"),
      evaluationId: bikeEvaluationId,
      state: "provisional",
    } as const;
    const asDirect = (ordinal: number, row: typeof oldRun | typeof newRun | typeof bike) =>
      directRow({ ...row, ordinal, effectiveAt: row.effectiveAt.toISOString() });
    const thresholdRows = [
      asDirect(0, bike),
      asDirect(1, oldRun),
      asDirect(2, oldRun),
      asDirect(3, newRun),
    ];
    const provenanceRows = [
      {
        published_evaluation_id: evaluationId,
        origin_evaluation_id: evaluationId,
        effort_id: effortId,
        source_activity_id: activityId,
        role: "primary",
        ordinal: 0,
      },
      {
        published_evaluation_id: secondEvaluationId,
        origin_evaluation_id: evaluationId,
        effort_id: effortId,
        source_activity_id: activityId,
        role: "supporting",
        ordinal: 0,
      },
      {
        published_evaluation_id: secondEvaluationId,
        origin_evaluation_id: secondEvaluationId,
        effort_id: secondEffortId,
        source_activity_id: secondActivityId,
        role: "primary",
        ordinal: 0,
      },
      {
        published_evaluation_id: bikeEvaluationId,
        origin_evaluation_id: bikeEvaluationId,
        effort_id: bikeEffortId,
        source_activity_id: bikeActivityId,
        role: "primary",
        ordinal: 0,
      },
    ];
    const requests = [
      { profileId: secondProfileId, asOf: new Date("2026-01-04T12:00:00.000Z") },
      { profileId, asOf: new Date("2026-01-01T18:00:00.000Z") },
      {
        profileId,
        asOf: new Date("2026-01-03T12:00:00.000Z"),
        excludedActivityId: secondActivityId,
      },
      { profileId, asOf: new Date("2026-04-03T12:00:00.000Z") },
      { profileId, asOf: new Date("2025-12-31T12:00:00.000Z") },
    ];
    const batchDb = setBasedReadDb(thresholdRows, provenanceRows);

    const batch = await readThresholdsForRequests(batchDb as never, requests);
    const singles = await Promise.all(
      requests.map((request, ordinal) => {
        const singleRows = thresholdRows
          .filter((row) => row.ordinal === ordinal)
          .map((row) => ({ ...row, ordinal: 0 }));
        return readThresholdsAsOf(setBasedReadDb(singleRows, provenanceRows) as never, request);
      }),
    );

    expect(batch).toEqual(singles);
    expect(batchDb.execute).toHaveBeenCalledTimes(2);
    expect(batch.map((facts) => facts[0]?.id ?? null)).toEqual([
      "10000000-0000-4000-8000-000000000003",
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000002",
      null,
    ]);
    expect(batch[3]?.[0]).toMatchObject({
      sourceEvaluationIds: [evaluationId, secondEvaluationId],
      sourceEffortIds: [effortId, secondEffortId],
      sourceActivityIds: [activityId, secondActivityId],
    });
  });
});

describe("profile-locked threshold lifecycle planning", () => {
  it("builds provisional, confirmed, increased, and supported-decrease successors", () => {
    const evidence = (id: string, activity: string, observedAt: string, value: number) => ({
      ...candidate(),
      evidenceId: id,
      activityId: activity,
      observedAt,
      value,
    });
    const e1 = evidence(
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000101",
      "2026-01-01T12:00:00.000Z",
      4,
    );
    const e2 = evidence(
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000102",
      "2026-01-02T12:00:00.000Z",
      4.02,
    );
    const e3 = evidence(
      "00000000-0000-4000-8000-000000000003",
      "00000000-0000-4000-8000-000000000103",
      "2026-01-03T12:00:00.000Z",
      4.3,
    );
    const e4 = evidence(
      "00000000-0000-4000-8000-000000000004",
      "00000000-0000-4000-8000-000000000104",
      "2026-01-04T12:00:00.000Z",
      3.8,
    );
    const e5 = evidence(
      "00000000-0000-4000-8000-000000000005",
      "00000000-0000-4000-8000-000000000105",
      "2026-01-05T12:00:00.000Z",
      3.82,
    );
    const plan = planThresholdChain({
      profileId,
      identity: { activityCategory: "run", metric: "speed" },
      evidence: [e1, e2, e3, e4, e5],
      now: new Date("2026-01-06T12:00:00.000Z"),
    });
    expect(
      plan.desired.map(({ evaluation_id, confidence }) => ({
        evaluationId: evaluation_id,
        confidence,
      })),
    ).toEqual([
      { evaluationId: e1.evidenceId, confidence: 1 },
      { evaluationId: e2.evidenceId, confidence: 1 },
      { evaluationId: e3.evidenceId, confidence: 1 },
      { evaluationId: e5.evidenceId, confidence: 1 },
    ]);
    expect(plan.desired.map(({ value }) => value)).toEqual([
      4,
      4.01,
      4.3,
      expect.closeTo(3.81, 10),
    ]);
    expect(plan.desired[0]?.supersedes_id).toBeNull();
    expect(
      plan.desired.slice(1).every((row, index) => row.supersedes_id === plan.desired[index]?.id),
    ).toBe(true);
    expect(plan.lifecycleByEvaluation.get(e2.evidenceId)?.threshold.selectedEvidenceIds).toEqual([
      e1.evidenceId,
      e2.evidenceId,
    ]);
    expect(plan.lifecycleByEvaluation.get(e5.evidenceId)?.threshold.selectedEvidenceIds).toEqual([
      e4.evidenceId,
      e5.evidenceId,
    ]);
    expect(plan.lifecycleByEvaluation.get(e5.evidenceId)).toMatchObject({
      decision: "supported_decrease",
      threshold: { publicationReason: "supported_decrease" },
    });
  });

  it("folds histories beyond the former read cap and can continue an older-policy chain", () => {
    const priorThresholdId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const evidence = Array.from({ length: 1_001 }, (_, index) => ({
      ...candidate(),
      evidenceId: `evaluation-${String(index).padStart(4, "0")}`,
      activityId: `activity-${String(index).padStart(4, "0")}`,
      observedAt: new Date(
        Date.parse("2026-01-01T00:00:00.000Z") + index * 3_600_000,
      ).toISOString(),
      value: 4,
    }));

    const plan = planThresholdChain({
      profileId,
      identity: { activityCategory: "run", metric: "speed" },
      evidence,
      now: new Date("2026-03-01T00:00:00.000Z"),
      initialSupersedesId: priorThresholdId,
    });

    expect(plan.desired).toHaveLength(2);
    expect(plan.desired[0]?.supersedes_id).toBe(priorThresholdId);
    expect(plan.desired[1]?.supersedes_id).toBe(plan.desired[0]?.id);
    expect(plan.lifecycleByEvaluation.get("evaluation-0001")?.state).toBe("confirmed");
  });
});
