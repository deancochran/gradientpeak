import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({
  createBucket: vi.fn(async () => ({ error: null })),
  createSignedUploadUrl: vi.fn(async (path: string) => ({
    data: { path, signedUrl: "https://example.com/upload" },
    error: null,
  })),
  createSignedUrl: vi.fn(async () => ({
    data: { signedUrl: "https://example.com/download" },
    error: null,
  })),
  download: vi.fn(async () => ({ data: new Blob(), error: null })),
  getPublicUrl: vi.fn((path: string) => ({
    data: { publicUrl: `https://example.com/storage/${path}` },
  })),
  remove: vi.fn(async () => ({ data: [], error: null })),
  upload: vi.fn(async () => ({ data: { path: "activity-file.fit" }, error: null })),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    storage: {
      createBucket: storageMocks.createBucket,
      from: vi.fn(() => ({
        createSignedUploadUrl: storageMocks.createSignedUploadUrl,
        createSignedUrl: storageMocks.createSignedUrl,
        download: storageMocks.download,
        getPublicUrl: storageMocks.getPublicUrl,
        remove: storageMocks.remove,
        upload: storageMocks.upload,
      })),
    },
  })),
}));

import { createQueryMapDbMock, type QueryMap } from "../../test/mock-query-db";
import {
  createMockInputForProcedure,
  ENDPOINT_PERFORMANCE_TIMEOUT_MS,
  getEndpointCaller,
  getEndpointPerformanceBudgets,
  measureEndpointPerformance,
} from "../../test/performance";
import { appRouter } from "../index";

const SESSION_USER_ID = "11111111-1111-4111-8111-111111111111";

const queryMap: QueryMap = {
  activity_efforts: { data: [], error: null },
  activity_plans: { data: [], error: null },
  activities: { data: [], error: null },
  events: { data: [], error: null },
  goals: { data: [], error: null },
  groups: { data: [], error: null },
  likes: { data: [], error: null },
  notifications: { data: [], error: null },
  profile_metrics: { data: [], error: null },
  profile_training_settings: { data: [], error: null },
  profiles: {
    data: {
      id: SESSION_USER_ID,
      created_at: new Date("2026-04-01T10:00:00.000Z"),
      updated_at: new Date("2026-04-01T10:00:00.000Z"),
      email: "athlete@example.com",
      full_name: "Athlete Example",
      username: "athlete",
      onboarded: true,
      is_public: true,
      preferred_units: "metric",
      language: "en",
    },
    error: null,
  },
  routes: { data: [], error: null },
  training_plans: { data: [], error: null },
};

function createPerformanceDb() {
  const { db } = createQueryMapDbMock(queryMap);
  const queryProxy = new Proxy(db.query ?? {}, {
    get(target, property) {
      if (property in target) return target[property as keyof typeof target];

      return {
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => []),
      };
    },
  });

  db.query = queryProxy;
  db.transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(db));

  return db;
}

function createPerformanceCaller() {
  return appRouter.createCaller({
    db: createPerformanceDb(),
    headers: new Headers(),
    session: {
      user: {
        id: SESSION_USER_ID,
        email: "athlete@example.com",
        emailVerified: true,
      },
    },
    clientType: "test",
    trpcSource: "vitest-performance",
  } as any);
}

describe("backend endpoint performance", () => {
  const budgets = getEndpointPerformanceBudgets(appRouter as any);
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it("discovers every app router endpoint for performance coverage", () => {
    expect(budgets).toHaveLength(Object.keys((appRouter as any)._def.procedures).length);
    expect(budgets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "profiles.get", type: "query" }),
        expect.objectContaining({ path: "events.list", type: "query" }),
        expect.objectContaining({ path: "trainingPlans.create", type: "mutation" }),
        expect.objectContaining({ path: "groups.events.list", type: "query" }),
      ]),
    );
  });

  it.each(budgets)("$path settles within $budgetMs ms", {
    timeout: ENDPOINT_PERFORMANCE_TIMEOUT_MS + 1_000,
  }, async ({ budgetMs, path }) => {
    const procedure = (appRouter as any)._def.procedures[path];
    const input = createMockInputForProcedure(procedure);
    const caller = createPerformanceCaller();
    const endpoint = getEndpointCaller(caller, path);

    if (typeof endpoint !== "function") {
      throw new Error(`Endpoint ${path} did not resolve to a caller function`);
    }

    const result = await measureEndpointPerformance(() => endpoint(input));

    expect(result.durationMs, formatPerformanceFailure(path, result)).toBeLessThanOrEqual(budgetMs);
  });
});

function formatPerformanceFailure(
  path: string,
  result: Awaited<ReturnType<typeof measureEndpointPerformance>>,
) {
  const error = result.error instanceof Error ? result.error.message : String(result.error ?? "");

  return `${path} ${result.status} in ${result.durationMs.toFixed(1)}ms${
    error ? ` (${error})` : ""
  }`;
}
