import type { CompleteOnboarding } from "@repo/core/schemas/onboarding";
import {
  integrations,
  oauthStates,
  profileAthleteState,
  profileGoals,
  profileMetrics,
  profiles,
  providerSyncJobs,
} from "@repo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queueMock = vi.hoisted(() =>
  vi.fn(async (_tx: unknown, input: { jobType: string }) => ({
    id: input.jobType,
    status: "queued",
  })),
);
vi.mock("../../infrastructure/repositories", () => ({
  createWahooSyncRepository: vi.fn(() => ({ enqueueJobInTransaction: queueMock })),
}));

import { onboardingRouter } from "../onboarding";

vi.mock("../../application/wahoo-profile-setup-service", () => ({
  WahooProfileSetupService: class {
    async getSetupData() {
      return {
        profile: { dob: null, gender: null, onboarding_status: "provider_selection" },
        values: {},
        sources: {},
      };
    }
  },
}));

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const INTEGRATION_ID = "22222222-2222-4222-8222-222222222222";
const profileInput: CompleteOnboarding = {
  full_name: "Lifecycle Athlete",
  username: "lifecycle_athlete",
  experience_level: "skip",
  intents: ["train_event"],
  baseline_field_sources: {},
};
const goalInput = {
  target_date: "2026-09-13",
  title: "Finish 5K",
  priority: 1,
  activity_category: "run" as const,
  target_payload: {
    type: "completion" as const,
    activity_category: "run" as const,
    distance_m: 5000,
  },
};

function createCaller(input?: {
  authenticated?: boolean;
  pendingOAuth?: boolean;
  providers?: boolean;
  status?: "provider_selection" | "processing" | "review" | "completed";
}) {
  let status = input?.status ?? "provider_selection";
  const providers = input?.providers ?? false;
  const insertedTables: unknown[] = [];
  let storedGoal: Record<string, unknown> | null = null;
  const db = {
    execute: vi.fn(async () => ({ rows: [] })),
    transaction: async (operation: (tx: unknown) => Promise<unknown>) => operation(db),
    select: (selection?: Record<string, unknown>) => ({
      from: (table: unknown) => {
        if (table === profiles) {
          return {
            where: () => ({
              limit: () => ({
                for: async () => [{ id: PROFILE_ID, onboarding_status: status }],
                then: (resolve: (rows: unknown[]) => void) =>
                  resolve([{ id: PROFILE_ID, onboarding_status: status }]),
              }),
            }),
          };
        }
        if (table === integrations) {
          const rows = providers
            ? [
                {
                  id: INTEGRATION_ID,
                  generation: 1,
                  provider: "wahoo",
                  scope: "workouts_read offline_data user_read",
                },
              ]
            : [];
          return {
            innerJoin: () => ({
              where: () => ({
                for: async () => rows,
                then: (resolve: (value: typeof rows) => void) => resolve(rows),
              }),
            }),
          };
        }
        if (table === oauthStates) {
          const rows = input?.pendingOAuth ? [{ id: "33333333-3333-4333-8333-333333333333" }] : [];
          return {
            where: () => ({
              limit: () => ({
                for: async () => rows,
              }),
            }),
          };
        }
        if (table === providerSyncJobs) {
          const rows = [
            {
              active: true,
              id: INTEGRATION_ID,
              generation: 1,
              provider: "wahoo",
              scope: "workouts_read offline_data user_read",
              job_id: "history",
              import_run_id: null,
              payload_import_run_id: null,
              job_type: "wahoo.activity_history_reconcile",
              status: "completed",
              last_error: null,
            },
            {
              active: true,
              id: INTEGRATION_ID,
              generation: 1,
              provider: "wahoo",
              scope: "workouts_read offline_data user_read",
              job_id: "profile",
              import_run_id: null,
              payload_import_run_id: null,
              job_type: "wahoo.profile_enrichment",
              status: "completed",
              last_error: null,
            },
          ];
          return { innerJoin: () => ({ leftJoin: () => ({ where: async () => rows }) }) };
        }
        if (table === profileAthleteState) {
          return { where: () => ({ limit: async () => [] }) };
        }
        if (table === profileGoals) {
          const projectedGoal =
            storedGoal && selection
              ? Object.fromEntries(Object.keys(selection).map((key) => [key, storedGoal?.[key]]))
              : storedGoal;
          return {
            where: () => ({ limit: async () => (projectedGoal ? [projectedGoal] : []) }),
          };
        }
        if (table === profileMetrics)
          return { where: () => ({ orderBy: () => ({ limit: async () => [] }) }) };
        throw new Error(`Unexpected table ${String(table)}`);
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            if (table === profiles && typeof values.onboarding_status === "string") {
              status = values.onboarding_status as typeof status;
            }
            return [{ id: PROFILE_ID }];
          },
        }),
      }),
    }),
    insert: (table: unknown) => {
      insertedTables.push(table);
      return {
        values: (values: unknown) => ({
          onConflictDoNothing: async () => {
            if (table === profileGoals) storedGoal = values as Record<string, unknown>;
            return [];
          },
          onConflictDoUpdate: async () => [],
          then: (resolve: (rows: unknown[]) => void) => resolve([]),
        }),
      };
    },
  };
  return {
    caller: onboardingRouter.createCaller({
      db: db as never,
      session: input?.authenticated === false ? null : { user: { id: PROFILE_ID } },
      headers: new Headers(),
      clientType: "test",
      trpcSource: "vitest",
    } as never),
    getStatus: () => status,
    insertedTables,
  };
}

describe("onboarding lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("WAHOO_CLIENT_ID", "client");
    vi.stubEnv("WAHOO_CLIENT_SECRET", "secret");
  });

  it("saves a draft without completing or advancing the lifecycle", async () => {
    const { caller, getStatus } = createCaller();
    await expect(caller.saveDraft({ profile: profileInput })).resolves.toEqual({
      status: "provider_selection",
    });
    expect(getStatus()).toBe("provider_selection");
    expect(queueMock).not.toHaveBeenCalled();
  });

  it("moves zero-provider onboarding directly to review", async () => {
    const { caller, getStatus } = createCaller();
    await expect(caller.startProcessing()).resolves.toEqual({ status: "review", providers: [] });
    expect(getStatus()).toBe("review");
    expect(queueMock).not.toHaveBeenCalled();
  });

  it("keeps provider selection open while an OAuth callback is pending", async () => {
    const { caller, getStatus } = createCaller({ pendingOAuth: true });
    await expect(caller.startProcessing()).rejects.toMatchObject({ code: "CONFLICT" });
    expect(getStatus()).toBe("provider_selection");
    expect(queueMock).not.toHaveBeenCalled();
  });

  it("completes from provider selection with identity only and no optional writes", async () => {
    const identityOnlyProfile = { ...profileInput, intents: [] };
    const { caller, getStatus, insertedTables } = createCaller();
    await expect(caller.completeLifecycleSetup({ profile: identityOnlyProfile })).resolves.toEqual({
      status: "completed",
      goal: { status: "skipped" },
      created: { profile_metrics: 0 },
    });
    expect(getStatus()).toBe("completed");
    expect(insertedTables).toEqual([]);
    expect(queueMock).not.toHaveBeenCalled();
  });

  it("persists an optional goal when the client supplies one", async () => {
    const { caller, insertedTables } = createCaller();
    await expect(
      caller.completeLifecycleSetup({
        profile: { ...profileInput, intents: [] },
        goal: goalInput,
      }),
    ).resolves.toMatchObject({
      status: "completed",
      goal: { status: "saved" },
    });
    expect(insertedTables).toEqual([profileGoals]);
  });

  it("does not bypass a pending provider authorization during identity-only completion", async () => {
    const { caller, getStatus } = createCaller({ pendingOAuth: true });
    await expect(
      caller.completeLifecycleSetup({ profile: { ...profileInput, intents: [] } }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(getStatus()).toBe("provider_selection");
  });

  it("queues both required initial Wahoo jobs and closes provider selection", async () => {
    const { caller, getStatus } = createCaller({ providers: true });
    await expect(caller.startProcessing()).resolves.toEqual({
      status: "processing",
      providers: ["wahoo"],
    });
    expect(queueMock).toHaveBeenCalledTimes(2);
    expect(queueMock.mock.calls.map(([, job]) => job.jobType).sort()).toEqual([
      "wahoo.activity_history_reconcile",
      "wahoo.profile_enrichment",
    ]);
    expect(getStatus()).toBe("processing");
  });

  it("replays startProcessing without duplicating durable work", async () => {
    const { caller } = createCaller({ providers: true, status: "processing" });
    await expect(caller.startProcessing()).resolves.toEqual({
      status: "processing",
      providers: ["wahoo"],
    });
    expect(queueMock).not.toHaveBeenCalled();
  });

  it("exposes protected read-only aggregate progress", async () => {
    const { caller, getStatus } = createCaller({ providers: true, status: "processing" });
    await expect(caller.getProgress()).resolves.toMatchObject({
      status: "processing",
      phase: "recovery_required",
      percent: 50,
      provider_summary: [{ provider: "wahoo", label: "Wahoo" }],
    });
    expect(getStatus()).toBe("processing");
    expect(queueMock).not.toHaveBeenCalled();
  });

  it("keeps terminal processing below ready until review is persisted", async () => {
    const { caller } = createCaller({ providers: true, status: "processing" });
    const progress = await caller.getProgress();
    expect(progress.status).toBe("processing");
    expect(progress.phase).not.toBe("ready");
    expect(progress.percent).not.toBe(100);
  });

  it("executes lost-anchor restart through the protected mutation", async () => {
    const { caller, getStatus } = createCaller({ providers: false, status: "processing" });
    await expect(caller.restartProviderSelection()).resolves.toEqual({
      status: "provider_selection",
    });
    expect(getStatus()).toBe("provider_selection");
    expect(queueMock).not.toHaveBeenCalled();
  });

  it("protects aggregate progress from unauthenticated callers", async () => {
    const { caller } = createCaller({ authenticated: false });
    await expect(caller.getProgress()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("does not bypass provider work that is already processing", async () => {
    const { caller } = createCaller({ status: "processing" });
    await expect(
      caller.completeLifecycleSetup({ profile: profileInput, goal: goalInput }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
