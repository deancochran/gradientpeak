import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { resolveE2EWebEnvironment } from "../../scripts/start-e2e-web.mjs";
import { isTrpcProcedure } from "../pages/network";
import { registerTrainingPlanCleanup } from "../training-plans/cleanup";
import { isolatedActorIdentity } from "./actors";
import { E2ECleanupRegistry, runCleanupFixture } from "./cleanup";
import type { E2EQuery, LocalE2EDatabase } from "./database";
import { localE2EDatabaseEnvironment, localE2EDatabaseUrl } from "./database-url";
import { addUtcDays, createE2EExecutionIdentity } from "./identity";

const testCoordinates = {
  parallelIndex: 2,
  processId: 42,
  project: { name: "Desktop Chrome" },
  repeatEachIndex: 1,
  retry: 0,
  testId: "fixture-foundation",
  titlePath: ["fixture foundation", "uses exact cleanup"],
  workerIndex: 3,
};

describe("local E2E database safety", () => {
  it("accepts only the dedicated loopback E2E PostgreSQL port and normalizes both variables", () => {
    const databaseUrl = "postgresql://tester:***@localhost:55322/e2e";
    expect(localE2EDatabaseUrl({ DATABASE_URL: databaseUrl })).toBe(databaseUrl);
    expect(localE2EDatabaseEnvironment({ POSTGRES_URL: databaseUrl })).toEqual({
      DATABASE_URL: databaseUrl,
      POSTGRES_URL: databaseUrl,
    });
  });

  it("rejects every configured remote or non-PostgreSQL database URL", () => {
    expect(() =>
      localE2EDatabaseUrl({
        DATABASE_URL: "postgresql://tester:test@database.example.com:5432/e2e",
        POSTGRES_URL: undefined,
      }),
    ).toThrow(/local-only/);
    expect(() =>
      localE2EDatabaseUrl({
        DATABASE_URL: "https://localhost/e2e",
        POSTGRES_URL: undefined,
      }),
    ).toThrow(/PostgreSQL protocol/);
    expect(() =>
      localE2EDatabaseEnvironment({
        DATABASE_URL: "postgresql://tester:***@localhost:55322/e2e",
        POSTGRES_URL: "postgresql://tester:***@database.example.com:5432/e2e",
      }),
    ).toThrow(/POSTGRES_URL is local-only/);
    expect(() => localE2EDatabaseEnvironment({ DATABASE_URL: "" })).toThrow(/valid PostgreSQL URL/);
    expect(() =>
      localE2EDatabaseEnvironment({
        DATABASE_URL: "postgresql://tester:***@localhost:54322/e2e",
      }),
    ).toThrow(/dedicated PostgreSQL port 55322/);
  });

  it("loads Playwright with the isolated web server and no stale-server reuse", async () => {
    const previousPort = process.env.PORT;
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousPostgresUrl = process.env.POSTGRES_URL;
    delete process.env.PORT;
    process.env.DATABASE_URL = "postgresql://tester:***@127.0.0.1:55322/e2e";
    process.env.POSTGRES_URL = "postgresql://tester:***@127.0.0.1:55322/e2e";
    vi.resetModules();
    try {
      const { default: config } = await import("../../playwright.config");
      expect(config.workers).toBe(1);
      expect(config.use?.baseURL).toBe("http://127.0.0.1:3100");
      expect(config.webServer).toMatchObject({
        reuseExistingServer: false,
        url: "http://127.0.0.1:3100",
      });
    } finally {
      if (previousPort === undefined) delete process.env.PORT;
      else process.env.PORT = previousPort;
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
      if (previousPostgresUrl === undefined) delete process.env.POSTGRES_URL;
      else process.env.POSTGRES_URL = previousPostgresUrl;
      vi.resetModules();
    }
  });

  it("fails Playwright config loading before a remote database can reach webServer", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousPostgresUrl = process.env.POSTGRES_URL;
    process.env.DATABASE_URL = "postgresql://tester:test@database.example.com:5432/e2e";
    process.env.POSTGRES_URL = "postgresql://tester:test@database.example.com:5432/e2e";
    vi.resetModules();
    try {
      await expect(import("../../playwright.config")).rejects.toThrow(/DATABASE_URL is local-only/);
    } finally {
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
      if (previousPostgresUrl === undefined) delete process.env.POSTGRES_URL;
      else process.env.POSTGRES_URL = previousPostgresUrl;
      vi.resetModules();
    }
  });

  it("fails Playwright config loading when the web port is not the dedicated E2E port", async () => {
    const previousPort = process.env.E2E_WEB_PORT;
    process.env.E2E_WEB_PORT = "3000";
    vi.resetModules();
    try {
      await expect(import("../../playwright.config")).rejects.toThrow(/requires E2E_WEB_PORT=3100/);
    } finally {
      if (previousPort === undefined) delete process.env.E2E_WEB_PORT;
      else process.env.E2E_WEB_PORT = previousPort;
      vi.resetModules();
    }
  });

  it("routes the direct dev:e2e launcher only to the isolated web, database, and Supabase ports", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(packageJson.scripts["dev:app:e2e"]).toBe("node scripts/start-e2e-web.mjs");

    expect(resolveE2EWebEnvironment({})).toMatchObject({
      APP_URL: "http://127.0.0.1:3100",
      DATABASE_URL: expect.stringContaining("@127.0.0.1:55322/"),
      NEXT_PRIVATE_SUPABASE_URL: "http://127.0.0.1:55321",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55321",
      PORT: "3100",
      POSTGRES_URL: expect.stringContaining("@127.0.0.1:55322/"),
    });

    expect(() => resolveE2EWebEnvironment({ PORT: "3000" })).toThrow(/PORT=3100/);
    expect(() =>
      resolveE2EWebEnvironment({
        DATABASE_URL: "postgresql://tester:***@127.0.0.1:54322/postgres",
      }),
    ).toThrow(/dedicated PostgreSQL port 55322/);
    expect(() =>
      resolveE2EWebEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      }),
    ).toThrow(/Supabase URL http:\/\/127\.0\.0\.1:55321/);
  });
});

describe("execution identity", () => {
  it("is stable for one execution and diverges across repeat, retry, worker, and process", () => {
    const first = createE2EExecutionIdentity(testCoordinates);
    const same = createE2EExecutionIdentity({ ...testCoordinates });
    const repeat = createE2EExecutionIdentity({ ...testCoordinates, repeatEachIndex: 2 });
    const retry = createE2EExecutionIdentity({ ...testCoordinates, retry: 1 });
    const worker = createE2EExecutionIdentity({ ...testCoordinates, workerIndex: 4 });
    const processIdentity = createE2EExecutionIdentity({ ...testCoordinates, processId: 43 });

    expect(first.name("Activity")).toBe(same.name("Activity"));
    expect(first.uuid("Activity")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(first.name("Activity")).not.toBe(retry.name("Activity"));
    expect(
      new Set(
        [first, repeat, retry, worker, processIdentity].map((identity) =>
          identity.uuid("Activity"),
        ),
      ).size,
    ).toBe(5);
    expect(first.calendarDate("Calendar")).toMatch(/^2027-\d{2}-\d{2}$/);
    expect(addUtcDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("isolated actor identity", () => {
  it("is stable inside one project/parallel slot and separates projects and labels", () => {
    const input = {
      identity: createE2EExecutionIdentity(testCoordinates),
      label: "athlete-primary",
    };
    const first = isolatedActorIdentity(input);
    expect(isolatedActorIdentity({ ...input })).toEqual(first);
    expect(first.email).toMatch(/^e2e-athlete-primary-[0-9a-f]{16}@gradientpeak\.local$/);
    expect(first.loopbackIp).toMatch(
      /^127\.(?:[1-9]|\d{2}|1\d{2}|2[0-4]\d|25[0-4])(?:\.(?:[1-9]|\d{2}|1\d{2}|2[0-4]\d|25[0-4])){2}$/,
    );
    expect(
      isolatedActorIdentity({
        ...input,
        identity: createE2EExecutionIdentity({
          ...testCoordinates,
          project: { name: "Desktop Firefox" },
        }),
      }).email,
    ).not.toBe(first.email);
    expect(isolatedActorIdentity({ ...input, label: "coach-secondary" }).email).not.toBe(
      first.email,
    );
  });
});

describe("exact cleanup registry", () => {
  it("deduplicates exact IDs and cleans in reverse registration order", async () => {
    const registry = new E2ECleanupRegistry();
    const calls: string[] = [];
    registry.registerExactId({
      kind: "activity",
      id: "one",
      cleanup: async () => {
        calls.push("old-one");
      },
    });
    registry.registerExactId({
      kind: "event",
      id: "two",
      cleanup: async () => {
        calls.push("two");
      },
    });
    registry.registerExactId({
      kind: "activity",
      id: "one",
      cleanup: async () => {
        calls.push("new-one");
      },
    });

    await registry.cleanup({} as LocalE2EDatabase);
    expect(calls).toEqual(["two", "new-one"]);
    expect(registry.size).toBe(0);
  });

  it("attempts every cleanup before reporting failures", async () => {
    const registry = new E2ECleanupRegistry();
    const later = vi.fn(async () => undefined);
    registry.registerExactId({
      kind: "activity",
      id: "one",
      cleanup: async () => {
        throw new Error("first failure");
      },
    });
    registry.registerExactId({ kind: "event", id: "two", cleanup: later });

    await expect(registry.cleanup({} as LocalE2EDatabase)).rejects.toThrow(/Could not clean/);
    expect(later).toHaveBeenCalledOnce();
  });

  it("preserves a primary test failure when cleanup also fails", async () => {
    const registry = new E2ECleanupRegistry();
    const primary = new Error("primary assertion");
    const annotations: Array<{ type: string; description?: string }> = [];
    const attach = vi.fn(async () => undefined);
    registry.registerExactId({
      kind: "event",
      id: "event-id",
      cleanup: async () => {
        throw new Error("cleanup failure");
      },
    });

    await expect(
      runCleanupFixture(
        registry,
        {} as LocalE2EDatabase,
        {
          annotations,
          attach,
          expectedStatus: "passed",
          status: "failed",
        } as never,
        async () => {
          throw primary;
        },
      ),
    ).rejects.toBe(primary);
    expect(annotations).toEqual([
      expect.objectContaining({ type: "cleanup-error", description: expect.any(String) }),
    ]);
    expect(attach).toHaveBeenCalledOnce();
  });

  it("constrains training-plan cleanup by exact ID and owner", async () => {
    const registry = new E2ECleanupRegistry();
    const calls: Array<[string, readonly unknown[] | undefined]> = [];
    const client = {
      query: async (sql: string, parameters?: readonly unknown[]) => {
        calls.push([sql, parameters]);
        return { rows: [] } as never;
      },
    } as E2EQuery;
    const database = {
      transaction: async (operation: (query: E2EQuery) => Promise<void>) => operation(client),
    } as unknown as LocalE2EDatabase;
    registerTrainingPlanCleanup(registry, {
      id: "11111111-1111-4111-8111-111111111111",
      ownerProfileId: "22222222-2222-4222-8222-222222222222",
      scheduledByProfileId: "22222222-2222-4222-8222-222222222222",
      systemTemplate: false,
    });

    await registry.cleanup(database);

    expect(calls).toHaveLength(2);
    for (const [sql] of calls) {
      expect(sql).toMatch(/"id"|"training_plan_id"/);
      expect(sql).toMatch(/"profile_id"/);
      expect(sql).not.toMatch(/"name"/);
    }
    expect(calls[1]?.[1]).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
  });

  it("constrains system-template cleanup to an exact unowned template", async () => {
    const registry = new E2ECleanupRegistry();
    const calls: Array<[string, readonly unknown[] | undefined]> = [];
    const client = {
      query: async (sql: string, parameters?: readonly unknown[]) => {
        calls.push([sql, parameters]);
        return { rows: [] } as never;
      },
    } as E2EQuery;
    const database = {
      transaction: async (operation: (query: E2EQuery) => Promise<void>) => operation(client),
    } as unknown as LocalE2EDatabase;
    registerTrainingPlanCleanup(registry, {
      id: "33333333-3333-4333-8333-333333333333",
      ownerProfileId: null,
      scheduledByProfileId: "22222222-2222-4222-8222-222222222222",
      systemTemplate: true,
    });

    await registry.cleanup(database);

    expect(calls[1]?.[0]).toMatch(/"id" = \$1/);
    expect(calls[1]?.[0]).toMatch(/"profile_id" is null/);
    expect(calls[1]?.[0]).toMatch(/"is_system_template" = true/);
    expect(calls[1]?.[0]).not.toMatch(/"name"/);
    expect(calls[1]?.[1]).toEqual(["33333333-3333-4333-8333-333333333333"]);
  });
});

describe("procedure-scoped tRPC matching", () => {
  it("matches exact single and batched procedures without matching prefixes", () => {
    expect(
      isTrpcProcedure(
        new URL("http://localhost/api/trpc/home.getDashboard?batch=1&input=%7B%7D"),
        "home.getDashboard",
      ),
    ).toBe(true);
    expect(
      isTrpcProcedure(
        new URL("http://localhost/api/trpc/home.getDashboard,goals.list?batch=1"),
        "goals.list",
      ),
    ).toBe(true);
    expect(
      isTrpcProcedure(
        new URL("http://localhost/api/trpc/home.getDashboardPreview?batch=1"),
        "home.getDashboard",
      ),
    ).toBe(false);
    expect(isTrpcProcedure(new URL("http://localhost/api/auth/session"), "auth.session")).toBe(
      false,
    );
  });
});

describe("baseline and variation identity contract", () => {
  it("keeps the exact 72-to-144 two-variation mapping", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../variation-coverage.json", import.meta.url), "utf8"),
    ) as {
      runtimeBaselineIdentityCount: number;
      variationIdentityCount: number;
      mappings: Record<string, string[]>;
    };
    const mappings = Object.values(manifest.mappings);
    const variationIdentities = mappings.flat();

    expect(manifest.runtimeBaselineIdentityCount).toBe(72);
    expect(manifest.variationIdentityCount).toBe(144);
    expect(mappings).toHaveLength(72);
    expect(mappings.every((variations) => variations.length === 2)).toBe(true);
    expect(new Set(variationIdentities).size).toBe(144);
  });
});
