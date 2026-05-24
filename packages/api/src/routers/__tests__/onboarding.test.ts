import {
  activities,
  activityEfforts,
  integrationCredentials,
  integrations,
  profileMetrics,
  profiles,
  providerSyncState,
} from "@repo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../utils/profile-estimation-state", () => ({
  bumpProfileEstimationState: vi.fn(async () => undefined),
}));

const wahooClientMock = {
  getUserProfile: vi.fn(async () => ({
    birth: "1990-01-01",
    gender: 0,
    weight: 72,
  })),
  getPowerZones: vi.fn(async () => ({ ftp: 248 })),
};

vi.mock("../../lib/integrations/wahoo/client", () => ({
  createWahooClient: vi.fn(() => wahooClientMock),
}));

import { OnboardingProviderEnrichmentService } from "../../application/onboarding-provider-enrichment";
import { onboardingRouter } from "../onboarding";

type InsertCall = {
  table: unknown;
  values: unknown[] | unknown;
};

function createCaller(params?: {
  userId?: string;
  updatedProfileId?: string | null;
  latestActivityId?: string | null;
  integrationRows?: Array<{ id: string; provider: "strava" | "wahoo"; profile_id: string }>;
  activityEffortRows?: Array<{ id: string }>;
  profileRow?: {
    dob: Date | null;
    gender: "male" | "female" | "other" | null;
    onboarded: boolean | null;
  } | null;
  profileMetricRows?: Array<{ value: number; recorded_at: Date; notes?: string | null }>;
  syncRows?: Array<{
    integration_id: string;
    metadata: Record<string, unknown>;
    last_sync_started_at?: Date | null;
    last_sync_succeeded_at?: Date | null;
    last_sync_failed_at?: Date | null;
  }>;
}) {
  const userId = params?.userId ?? "11111111-1111-4111-8111-111111111111";
  const updatedProfileId = params?.updatedProfileId ?? userId;
  const latestActivityId = params?.latestActivityId ?? null;
  const integrationRows = params?.integrationRows ?? [];
  const activityEffortRows = params?.activityEffortRows ?? [];
  const profileRow = params?.profileRow ?? null;
  const profileMetricRows = params?.profileMetricRows ?? [];
  const syncRows = params?.syncRows ?? [];
  const insertCalls: InsertCall[] = [];
  const updateCalls: Array<{ table: unknown; values: unknown }> = [];

  const db = {
    update: (table: unknown) => {
      expect(table).toBe(profiles);

      return {
        set: (values: unknown) => {
          updateCalls.push({ table, values });

          return {
            where: () => ({
              returning: async () => (updatedProfileId ? [{ id: updatedProfileId }] : []),
            }),
          };
        },
      };
    },
    insert: (table: unknown) => ({
      values: (values: unknown[] | unknown) => {
        insertCalls.push({ table, values });
        return {
          onConflictDoUpdate: async () => [],
          then: (resolve: (value: unknown[]) => void) => resolve([]),
        };
      },
    }),
    select: () => ({
      from: (table: unknown) => {
        if (table === integrations) {
          return {
            where: () => ({
              limit: async () => integrationRows.slice(0, 1),
              then: (resolve: (value: typeof integrationRows) => void) => resolve(integrationRows),
            }),
          };
        }

        if (table === integrationCredentials) {
          return {
            where: () => ({
              limit: async () => [{ access_token: "wahoo-access-token", refresh_token: null }],
            }),
          };
        }

        if (table === providerSyncState) {
          return {
            where: async () => syncRows,
          };
        }

        if (table === profiles) {
          return {
            where: () => ({
              limit: async () => (profileRow ? [profileRow] : []),
            }),
          };
        }

        if (table === profileMetrics) {
          return {
            where: () => ({
              orderBy: () => ({
                limit: async () => profileMetricRows,
              }),
            }),
          };
        }

        if (table === activityEfforts) {
          return {
            where: () => ({
              limit: async () => activityEffortRows,
            }),
          };
        }

        expect(table).toBe(activities);

        return {
          where: () => ({
            orderBy: () => ({
              limit: async () => (latestActivityId ? [{ id: latestActivityId }] : []),
            }),
          }),
        };
      },
    }),
  };

  const caller = onboardingRouter.createCaller({
    db: db as any,
    session: { user: { id: userId } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);

  return { caller, db, insertCalls, updateCalls };
}

describe("onboardingRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wahooClientMock.getUserProfile.mockResolvedValue({
      birth: "1990-01-01",
      gender: 0,
      weight: 72,
    });
    wahooClientMock.getPowerZones.mockResolvedValue({ ftp: 248 });
  });

  it("completes onboarding while ignoring an extra primary_sport field for baseline efforts", async () => {
    const { caller, insertCalls } = createCaller();

    const result = await caller.completeOnboarding({
      experience_level: "beginner",
      dob: "1990-01-01T00:00:00.000Z",
      weight_kg: 70,
      gender: "male",
      primary_sport: "cycling",
    } as any);

    expect(result).toMatchObject({
      success: true,
      created: {
        profile_metrics: 5,
        activity_efforts: 0,
      },
      baseline_used: true,
      confidence: "low",
      warnings: [],
    });

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]?.table).toBe(profileMetrics);
    expect(insertCalls[0]?.values).toHaveLength(5);
    expect(insertCalls.some((call) => call.table === activityEfforts)).toBe(false);
  });

  it("returns imported onboarding values from canonical profile data and sync metadata", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const integrationId = "22222222-2222-4222-8222-222222222222";
    const { caller } = createCaller({
      userId,
      profileRow: { dob: new Date("1990-01-01T00:00:00.000Z"), gender: "male", onboarded: false },
      profileMetricRows: [{ value: 72, recorded_at: new Date("2026-05-16T00:00:00.000Z") }],
      integrationRows: [{ id: integrationId, provider: "wahoo", profile_id: userId }],
      syncRows: [
        {
          integration_id: integrationId,
          metadata: {
            status: "succeeded",
            blocking: true,
            fields_imported: ["dob", "gender", "weight_kg", "ftp"],
            imported_values: { ftp: 248 },
          },
          last_sync_succeeded_at: new Date("2026-05-16T00:00:00.000Z"),
        },
      ],
    });

    await expect(caller.getImportedOnboardingValues()).resolves.toMatchObject({
      values: {
        dob: "1990-01-01",
        gender: "male",
        weight_kg: 72,
        ftp: 248,
      },
      sources: {
        ftp: { provider: "wahoo", label: "Wahoo" },
      },
    });
  });

  it("writes Wahoo enrichment values to canonical storage and sync state", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const integrationId = "22222222-2222-4222-8222-222222222222";
    const { caller, insertCalls, updateCalls } = createCaller({
      userId,
      integrationRows: [{ id: integrationId, provider: "wahoo", profile_id: userId }],
    });

    await caller.startProviderEnrichment({ providers: ["wahoo"] });

    expect(updateCalls.some((call) => call.table === profiles)).toBe(true);
    expect(insertCalls.some((call) => call.table === profileMetrics)).toBe(true);
    expect(insertCalls.some((call) => call.table === providerSyncState)).toBe(true);
  });

  it("does not duplicate the latest provider-imported weight metric on retry", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const integrationId = "22222222-2222-4222-8222-222222222222";
    const { caller, insertCalls } = createCaller({
      userId,
      integrationRows: [{ id: integrationId, provider: "wahoo", profile_id: userId }],
      profileMetricRows: [
        {
          value: 72,
          recorded_at: new Date("2026-05-16T00:00:00.000Z"),
          notes: "Imported from Wahoo",
        },
      ],
    });

    await caller.startProviderEnrichment({ providers: ["wahoo"] });

    expect(insertCalls.some((call) => call.table === profileMetrics)).toBe(false);
    expect(insertCalls.some((call) => call.table === providerSyncState)).toBe(true);
  });

  it("refreshes setup data without overwriting existing canonical values", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const integrationId = "22222222-2222-4222-8222-222222222222";
    const { db, insertCalls, updateCalls } = createCaller({
      userId,
      integrationRows: [
        {
          id: integrationId,
          provider: "wahoo",
          profile_id: userId,
          access_token: "access-1",
          refresh_token: "refresh-1",
        } as any,
      ],
      profileRow: { dob: new Date("1988-02-03T00:00:00.000Z"), gender: "female", onboarded: true },
      profileMetricRows: [{ value: 70, recorded_at: new Date("2026-05-16T00:00:00.000Z") }],
    });
    const service = new OnboardingProviderEnrichmentService({ db: db as any });

    await expect(service.refreshSetupData(userId, "wahoo")).resolves.toEqual({
      fieldsFilled: [],
      fieldsKept: ["dob", "gender"],
      fieldsUpdated: ["weight_kg", "ftp"],
      keptExistingValues: true,
      provider: "wahoo",
      status: "succeeded",
    });

    expect(updateCalls).toHaveLength(0);
    expect(insertCalls.filter((call) => call.table === profileMetrics)).toHaveLength(2);
    const effortInsert = insertCalls.find((call) => call.table === activityEfforts);
    expect(effortInsert?.values).toHaveLength(10);
    expect(insertCalls.some((call) => call.table === providerSyncState)).toBe(true);
  });

  it("does not model an FTP-derived curve when recent real bike power efforts exist", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const integrationId = "22222222-2222-4222-8222-222222222222";
    const { db, insertCalls } = createCaller({
      userId,
      integrationRows: [
        {
          id: integrationId,
          provider: "wahoo",
          profile_id: userId,
          access_token: "access-1",
          refresh_token: "refresh-1",
        } as any,
      ],
      activityEffortRows: [{ id: "real-effort-1" }],
      profileRow: { dob: null, gender: null, onboarded: true },
    });
    const service = new OnboardingProviderEnrichmentService({ db: db as any });

    await service.refreshSetupData(userId, "wahoo");

    expect(insertCalls.some((call) => call.table === activityEfforts)).toBe(false);
    expect(insertCalls.some((call) => call.table === profileMetrics)).toBe(true);
  });

  it("marks unsupported connected providers as non-blocking skipped items", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const integrationId = "33333333-3333-4333-8333-333333333333";
    const { caller } = createCaller({
      userId,
      integrationRows: [{ id: integrationId, provider: "strava", profile_id: userId }],
    });

    await expect(caller.startProviderEnrichment({ providers: ["strava"] })).resolves.toMatchObject({
      status: "succeeded",
      canContinue: true,
      providers: [{ provider: "strava", status: "skipped_unsupported", blocking: false }],
    });
  });

  it("allows completion after clearing a failed provider requirement", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const integrationId = "22222222-2222-4222-8222-222222222222";
    const { caller } = createCaller({
      userId,
      integrationRows: [{ id: integrationId, provider: "wahoo", profile_id: userId }],
      syncRows: [
        {
          integration_id: integrationId,
          metadata: { status: "requirement_cleared", blocking: false },
          last_sync_succeeded_at: new Date("2026-05-16T00:00:00.000Z"),
        },
      ],
    });

    await expect(caller.clearProviderRequirement({ provider: "wahoo" })).resolves.toMatchObject({
      canContinue: true,
    });
    await expect(
      caller.completeOnboarding({
        experience_level: "beginner",
        dob: "1990-01-01T00:00:00.000Z",
        weight_kg: 70,
        gender: "male",
      }),
    ).resolves.toMatchObject({ success: true });
  });

  it("surfaces invalid heart-rate combinations from estimateMetrics as a thrown error", async () => {
    const { caller } = createCaller();

    await expect(
      caller.estimateMetrics({
        weight_kg: 70,
        gender: "male",
        age: 30,
        max_hr: 100,
        resting_hr: 120,
      }),
    ).rejects.toThrow("Max HR must be greater than resting HR");
  });

  it("rejects unexpected fields on estimateMetrics", async () => {
    const { caller } = createCaller();

    await expect(
      caller.estimateMetrics({
        weight_kg: 70,
        gender: "male",
        age: 30,
        unexpected: true,
      } as any),
    ).rejects.toThrow(/unrecognized/i);
  });

  it("blocks completion while Wahoo onboarding enrichment is running", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const integrationId = "22222222-2222-4222-8222-222222222222";
    const { caller } = createCaller({
      userId,
      integrationRows: [{ id: integrationId, provider: "wahoo", profile_id: userId }],
      syncRows: [
        {
          integration_id: integrationId,
          metadata: { status: "running", blocking: true },
          last_sync_started_at: new Date("2026-05-16T00:00:00.000Z"),
        },
      ],
    });

    await expect(
      caller.completeOnboarding({
        experience_level: "beginner",
        dob: "1990-01-01T00:00:00.000Z",
        weight_kg: 70,
        gender: "male",
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
