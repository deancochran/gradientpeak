import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  parseFitFileWithSDK: vi.fn(),
  calculateBestEfforts: vi.fn(),
  calculateDecouplingFromStreams: vi.fn(),
  calculateEfficiencyFactor: vi.fn(),
  calculateGradedSpeedStream: vi.fn(),
  calculateNGP: vi.fn(),
  calculateNormalizedPower: vi.fn(),
  calculateNormalizedSpeed: vi.fn(),
  detectLTHR: vi.fn(),
  estimateVO2Max: vi.fn(),
  fetchActivityTemperature: vi.fn(),
}));

vi.mock("@repo/core", () => ({
  parseFitFileWithSDK: mocks.parseFitFileWithSDK,
}));

vi.mock("@repo/core/calculations", () => ({
  calculateAerobicDecoupling: vi.fn(),
  calculateBestEfforts: mocks.calculateBestEfforts,
  calculateDecouplingFromStreams: mocks.calculateDecouplingFromStreams,
  calculateEfficiencyFactor: mocks.calculateEfficiencyFactor,
  calculateGradedSpeedStream: mocks.calculateGradedSpeedStream,
  calculateNGP: mocks.calculateNGP,
  calculateNormalizedPower: mocks.calculateNormalizedPower,
  calculateNormalizedSpeed: mocks.calculateNormalizedSpeed,
  detectLTHR: mocks.detectLTHR,
  estimateVO2Max: mocks.estimateVO2Max,
}));

vi.mock("../../utils/weather", () => ({
  fetchActivityTemperature: mocks.fetchActivityTemperature,
}));

import { fitFilesRouter } from "../fit-files";

type QueryResult = {
  data: any;
  error: { message?: string; details?: string; hint?: string; code?: string } | null;
};

type QueryPlan = Record<string, QueryResult | QueryResult[]>;

type TerminalCall = {
  table: string;
  terminal: "single" | "maybeSingle" | "then";
  filters: Array<{ type: string; args: unknown[] }>;
};

function createSupabaseMock(queryPlan: QueryPlan = {}) {
  const counters = new Map<string, number>();
  const terminalCalls: TerminalCall[] = [];
  const inserts: Array<{ table: string; values: unknown }> = [];
  const storageRemovals: string[][] = [];

  const nextResult = (key: string): QueryResult => {
    const entry = queryPlan[key];
    if (!entry) return { data: null, error: null };
    if (!Array.isArray(entry)) return entry;

    const index = counters.get(key) ?? 0;
    counters.set(key, index + 1);
    return entry[index] ?? entry[entry.length - 1] ?? { data: null, error: null };
  };

  const from = (table: string) => {
    const filters: Array<{ type: string; args: unknown[] }> = [];

    const builder: any = {
      select: () => builder,
      eq: (...args: unknown[]) => {
        filters.push({ type: "eq", args });
        return builder;
      },
      gte: (...args: unknown[]) => {
        filters.push({ type: "gte", args });
        return builder;
      },
      lte: (...args: unknown[]) => {
        filters.push({ type: "lte", args });
        return builder;
      },
      order: (...args: unknown[]) => {
        filters.push({ type: "order", args });
        return builder;
      },
      limit: (...args: unknown[]) => {
        filters.push({ type: "limit", args });
        return builder;
      },
      insert: (values: unknown) => {
        inserts.push({ table, values });
        return builder;
      },
      maybeSingle: () => {
        terminalCalls.push({ table, terminal: "maybeSingle", filters: [...filters] });
        return Promise.resolve(nextResult(`${table}:maybeSingle`));
      },
      single: () => {
        terminalCalls.push({ table, terminal: "single", filters: [...filters] });
        return Promise.resolve(nextResult(`${table}:single`));
      },
      then: (onFulfilled: (value: QueryResult) => unknown) => {
        terminalCalls.push({ table, terminal: "then", filters: [...filters] });
        return Promise.resolve(nextResult(`${table}:then`)).then(onFulfilled);
      },
    };

    return builder;
  };

  return {
    supabase: {
      from,
      storage: {
        from: () => ({
          createSignedUploadUrl: vi.fn(async (filePath: string) => ({
            data: { signedUrl: "https://example.test/upload", token: "token", path: filePath },
            error: null,
          })),
          download: vi.fn(async () => ({
            data: new Blob(["fit bytes"], { type: "application/octet-stream" }),
            error: null,
          })),
          remove: vi.fn(async (paths: string[]) => {
            storageRemovals.push(paths);
            return { data: null, error: null };
          }),
        }),
      },
    },
    terminalCalls,
    inserts,
    storageRemovals,
  };
}

function createCaller(queryPlan?: QueryPlan) {
  const { supabase, terminalCalls, inserts, storageRemovals } = createSupabaseMock(queryPlan);

  const caller = fitFilesRouter.createCaller({
    supabase: supabase as any,
    session: { user: { id: "11111111-1111-4111-8111-111111111111" } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);

  return { caller, terminalCalls, inserts, storageRemovals };
}

describe("fitFilesRouter", () => {
  it("exposes the signed upload and process procedures", () => {
    expect(fitFilesRouter._def.procedures.getSignedUploadUrl).toBeDefined();
    expect(fitFilesRouter._def.procedures.processFitFile).toBeDefined();
  });

  it("uses as-of historical context and completion timestamps during FIT import", async () => {
    const startTime = new Date("2025-05-10T10:00:00.000Z");
    const finishedAt = "2025-05-10T11:00:00.000Z";
    const cutoffAt = "2025-02-09T11:00:00.000Z";

    mocks.parseFitFileWithSDK.mockReturnValue({
      metadata: { type: "cycling", startTime },
      summary: {
        totalTime: 3600,
        totalDistance: 40250,
        calories: 900,
        totalAscent: 410,
        avgHeartRate: 162,
        maxHeartRate: 182,
        avgPower: 240,
        maxPower: 450,
        avgCadence: 88,
        maxCadence: 102,
        avgSpeed: 11.18,
        maxSpeed: 18.1,
      },
      records: [
        {
          timestamp: startTime,
          power: 230,
          heartRate: 160,
          cadence: 86,
          altitude: 120,
          speed: 11,
        },
        {
          timestamp: new Date("2025-05-10T10:20:00.000Z"),
          power: 245,
          heartRate: 168,
          cadence: 90,
          altitude: 150,
          speed: 11.5,
        },
      ],
      laps: [],
    });

    mocks.calculateNormalizedPower.mockReturnValue(250);
    mocks.calculateNormalizedSpeed.mockReturnValue(11.1);
    mocks.calculateEfficiencyFactor.mockReturnValue(1.55);
    mocks.calculateDecouplingFromStreams.mockReturnValue(0.03);
    mocks.calculateBestEfforts.mockReturnValue([{ duration: 1200, value: 300, startIndex: 0 }]);
    mocks.detectLTHR.mockReturnValue(175);
    mocks.estimateVO2Max.mockReturnValue(52);
    mocks.fetchActivityTemperature.mockResolvedValue(null);

    const { caller, terminalCalls, inserts, storageRemovals } = createCaller({
      "profile_metrics:maybeSingle": [
        { data: { value: 168 }, error: null },
        { data: { value: 188 }, error: null },
        { data: { value: 52 }, error: null },
      ],
      "activity_efforts:maybeSingle": { data: { value: 315 }, error: null },
      "activities:single": {
        data: { id: "activity-1", started_at: startTime.toISOString(), finished_at: finishedAt },
        error: null,
      },
      "activity_efforts:then": { data: null, error: null },
      "profile_metrics:then": { data: null, error: null },
    });

    const result = await caller.processFitFile({
      fitFilePath: "activities/user/uploads/123_history.fit",
      name: "Morning Ride",
      notes: "Imported",
      activityType: "bike",
      importProvenance: {
        import_source: "manual_historical",
        import_file_type: "fit",
        import_original_file_name: "morning-ride.fit",
      },
    });

    expect(result.success).toBe(true);
    expect(storageRemovals).toEqual([]);

    const profileMetricQueries = terminalCalls.filter(
      (call) => call.table === "profile_metrics" && call.terminal === "maybeSingle",
    );
    expect(profileMetricQueries).toHaveLength(3);
    for (const call of profileMetricQueries) {
      expect(call.filters).toContainEqual({
        type: "lte",
        args: ["recorded_at", finishedAt],
      });
    }

    const ftpContextQuery = terminalCalls.find(
      (call) => call.table === "activity_efforts" && call.terminal === "maybeSingle",
    );
    expect(ftpContextQuery?.filters).toContainEqual({
      type: "gte",
      args: ["recorded_at", cutoffAt],
    });
    expect(ftpContextQuery?.filters).toContainEqual({
      type: "lte",
      args: ["recorded_at", finishedAt],
    });

    const effortsInsert = inserts.find((entry) => entry.table === "activity_efforts");
    expect(effortsInsert).toBeDefined();
    expect((effortsInsert?.values as Array<{ recorded_at: string }>)[0]?.recorded_at).toBe(
      finishedAt,
    );

    const profileMetricInsert = inserts.find(
      (entry) => entry.table === "profile_metrics" && !Array.isArray(entry.values),
    );
    expect(profileMetricInsert?.values).toMatchObject({
      metric_type: "lthr",
      recorded_at: finishedAt,
      value: 175,
    });

    const activityInsert = inserts.find((entry) => entry.table === "activities");
    expect(activityInsert?.values).toMatchObject({
      import_source: "manual_historical",
      import_file_type: "fit",
      import_original_file_name: "morning-ride.fit",
    });

    expect(inserts.some((entry) => entry.table === "notifications")).toBe(false);
  });
});
