import { defaultAthletePreferenceProfile } from "@repo/core";
import {
  activities,
  activityEfforts,
  integrationCredentials,
  integrations,
  profileMetrics,
  profiles,
  profileTrainingSettings,
  providerSyncState,
} from "@repo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  activityEffortRows?: Array<{
    id: string;
    activity_id?: string | null;
    activityId?: string | null;
    duration_seconds?: number;
    durationSeconds?: number;
    unit?: string;
    value?: number;
    source: "manual" | "test" | "imported" | "provider" | "estimated" | "derived" | null;
    method: string | null;
    provenance: Record<string, unknown> | null;
  }>;
  profileRow?: {
    dob: Date | null;
    gender: "male" | "female" | "other" | null;
    onboarded: boolean | null;
  } | null;
  profileMetricRows?: Array<{ value: number; recorded_at: Date; notes?: string | null }>;
  profileTrainingSettingsValue?: unknown;
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
  const profileTrainingSettingsValue = params?.profileTrainingSettingsValue;
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

        if (table === profileTrainingSettings) {
          return {
            where: () => ({
              limit: async () =>
                profileTrainingSettingsValue === undefined
                  ? []
                  : [{ settings: profileTrainingSettingsValue }],
            }),
          };
        }

        if (table === activityEfforts) {
          return {
            where: () => {
              const rows = activityEffortRows.map((row) => ({
                ...row,
                activityId: row.activityId ?? row.activity_id ?? null,
                durationSeconds: row.durationSeconds ?? row.duration_seconds ?? 300,
                unit: row.unit ?? "watts",
                value: row.value ?? 300,
              }));
              return {
                limit: async () => rows,
                orderBy: () => ({ limit: async () => rows }),
                then: (resolve: (value: typeof rows) => void) => resolve(rows),
              };
            },
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
  Object.assign(db, {
    transaction: async (callback: (tx: typeof db) => Promise<unknown>) => callback(db),
  });

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
      full_name: "Test Athlete",
      username: "test-athlete",
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

    const metricsInsert = insertCalls.find((call) => call.table === profileMetrics);
    expect(metricsInsert?.values).toHaveLength(5);
    expect(metricsInsert?.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "manual",
          method: "onboarding_manual_seed",
          provenance: expect.objectContaining({ seed_type: "manual" }),
        }),
      ]),
    );
    expect(insertCalls.some((call) => call.table === activityEfforts)).toBe(false);
  });

  it("merges onboarding intents into existing profile settings", async () => {
    const { caller, insertCalls } = createCaller({
      profileTrainingSettingsValue: {
        ...defaultAthletePreferenceProfile,
        onboarding_intents: ["explore"],
      },
    });

    await caller.completeOnboarding({
      full_name: "Test Athlete",
      username: "test-athlete",
      intents: ["train_event", "groups"],
    });

    expect(insertCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: profileTrainingSettings,
          values: expect.objectContaining({
            profile_id: "11111111-1111-4111-8111-111111111111",
            settings: {
              ...defaultAthletePreferenceProfile,
              onboarding_intents: ["train_event", "groups"],
            },
          }),
        }),
      ]),
    );
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

  it("persists one modeled anchor per threshold without attaching an unrelated activity", async () => {
    const { caller, insertCalls } = createCaller({ latestActivityId: crypto.randomUUID() });

    await caller.completeOnboarding({
      full_name: "Test Athlete",
      username: "test-athlete",
      experience_level: "advanced",
      ftp: 240,
      threshold_pace_seconds_per_km: 270,
      css_seconds_per_hundred_meters: 95,
    } as any);

    expect(insertCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: profileMetrics,
          values: expect.arrayContaining([
            expect.objectContaining({
              metric_type: "threshold_pace_seconds_per_km",
              unit: "seconds_per_km",
              source: "manual",
            }),
            expect.objectContaining({
              metric_type: "css_seconds_per_100m",
              unit: "seconds_per_100m",
              source: "manual",
            }),
          ]),
        }),
      ]),
    );

    const effortInsert = insertCalls.find((call) => call.table === activityEfforts);
    expect(effortInsert?.values).toHaveLength(3);
    expect(effortInsert?.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activity_id: null,
          activity_category: "bike",
          duration_seconds: 3600,
          value: 240,
          source: "derived",
          method: "onboarding_modeled_curve",
          calculation_version: "onboarding-effort-curve-v1",
        }),
        expect.objectContaining({
          activity_id: null,
          activity_category: "run",
          duration_seconds: 3600,
        }),
        expect.objectContaining({
          activity_id: null,
          activity_category: "swim",
          duration_seconds: 1800,
        }),
      ]),
    );
    expect(
      (effortInsert?.values as Array<{ value: number }>).some((effort) => effort.value === 4240),
    ).toBe(false);
  });

  it("preserves provider FTP identity on completion and labels its modeled anchor", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const integrationId = "22222222-2222-4222-8222-222222222222";
    const { caller, insertCalls } = createCaller({
      userId,
      integrationRows: [{ id: integrationId, provider: "wahoo", profile_id: userId }],
      syncRows: [
        {
          integration_id: integrationId,
          metadata: {
            status: "succeeded",
            blocking: true,
            fields_imported: ["ftp"],
            imported_values: { ftp: 248 },
          },
          last_sync_succeeded_at: new Date("2026-05-16T00:00:00.000Z"),
        },
      ],
    });

    const result = await caller.completeOnboarding({
      full_name: "Provider Athlete",
      username: "provider-athlete",
      experience_level: "advanced",
      ftp: 248,
    });

    expect(result.created.profile_metrics).toBe(0);
    expect(insertCalls.some((call) => call.table === profileMetrics)).toBe(false);
    expect(insertCalls.find((call) => call.table === activityEfforts)?.values).toEqual([
      expect.objectContaining({
        value: 248,
        activity_id: null,
        provenance: { seed_source: "provider_wahoo_ftp" },
      }),
    ]);
  });

  it("persists a genuinely changed provider FTP as a manual onboarding value", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const integrationId = "22222222-2222-4222-8222-222222222222";
    const { caller, insertCalls } = createCaller({
      userId,
      integrationRows: [{ id: integrationId, provider: "wahoo", profile_id: userId }],
      syncRows: [
        {
          integration_id: integrationId,
          metadata: {
            status: "succeeded",
            blocking: true,
            fields_imported: ["ftp"],
            imported_values: { ftp: 248 },
          },
          last_sync_succeeded_at: new Date("2026-05-16T00:00:00.000Z"),
        },
      ],
    });

    await caller.completeOnboarding({
      full_name: "Changed FTP Athlete",
      username: "changed-ftp-athlete",
      experience_level: "advanced",
      ftp: 260,
    });

    expect(insertCalls.find((call) => call.table === profileMetrics)?.values).toEqual([
      expect.objectContaining({
        metric_type: "ftp",
        value: 260,
        source: "manual",
        method: "onboarding_manual_seed",
      }),
    ]);
    expect(insertCalls.find((call) => call.table === activityEfforts)?.values).toEqual([
      expect.objectContaining({
        value: 260,
        provenance: { seed_source: "advanced" },
      }),
    ]);
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
    const metricInserts = insertCalls.filter((call) => call.table === profileMetrics);
    expect(metricInserts).toHaveLength(2);
    expect(insertCalls.some((call) => call.table === providerSyncState)).toBe(true);
    expect(insertCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: profileMetrics,
          values: expect.objectContaining({
            source: "provider",
            provenance: expect.objectContaining({ provider: "wahoo" }),
          }),
        }),
        expect.objectContaining({
          table: profileMetrics,
          values: expect.objectContaining({
            metric_type: "ftp",
            value: 248,
            unit: "W",
            source: "provider",
            method: "provider_metric_import",
            calculation_version: "provider-import-v1",
            provenance: expect.objectContaining({
              integration_id: integrationId,
              provider: "wahoo",
            }),
          }),
        }),
      ]),
    );
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

    expect(insertCalls.filter((call) => call.table === profileMetrics)).toEqual([
      expect.objectContaining({
        values: expect.objectContaining({ metric_type: "ftp", value: 248, source: "provider" }),
      }),
    ]);
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
    expect(effortInsert?.values).toHaveLength(1);
    expect(effortInsert?.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "derived",
          method: "onboarding_modeled_curve",
          unit: "watts",
          activity_id: null,
          duration_seconds: 3600,
          value: 248,
        }),
      ]),
    );
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
      activityEffortRows: [
        {
          id: "real-effort-1",
          activity_id: "33333333-3333-4333-8333-333333333333",
          duration_seconds: 300,
          value: 300,
          unit: "watts",
          source: "imported",
          method: "activity_file_best_effort",
          provenance: {
            activity_id: "33333333-3333-4333-8333-333333333333",
            derived_from: "activity_file_stream",
          },
        },
      ],
      profileRow: { dob: null, gender: null, onboarded: true },
    });
    const service = new OnboardingProviderEnrichmentService({ db: db as any });

    await service.refreshSetupData(userId, "wahoo");

    expect(insertCalls.some((call) => call.table === activityEfforts)).toBe(false);
    expect(insertCalls.some((call) => call.table === profileMetrics)).toBe(true);
  });

  it("does not treat a linked modeled effort as observed provider evidence", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const integrationId = "22222222-2222-4222-8222-222222222222";
    const { db, insertCalls } = createCaller({
      userId,
      integrationRows: [{ id: integrationId, provider: "wahoo", profile_id: userId }],
      activityEffortRows: [
        {
          id: "modeled-effort-1",
          source: "derived",
          method: "onboarding_modeled_curve",
          provenance: { seed_source: "provider_wahoo_ftp" },
        },
      ],
      profileRow: { dob: null, gender: null, onboarded: true },
    });
    const service = new OnboardingProviderEnrichmentService({ db: db as any });

    await service.refreshSetupData(userId, "wahoo");

    expect(insertCalls.find((call) => call.table === activityEfforts)?.values).toEqual([
      expect.objectContaining({ activity_id: null, duration_seconds: 3600, value: 248 }),
    ]);
  });

  it("does not treat unlinked imported efforts as observed provider evidence", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const integrationId = "22222222-2222-4222-8222-222222222222";
    const { db, insertCalls } = createCaller({
      userId,
      integrationRows: [{ id: integrationId, provider: "wahoo", profile_id: userId }],
      activityEffortRows: [
        {
          id: "unlinked-imported-effort-1",
          activity_id: null,
          duration_seconds: 300,
          value: 300,
          unit: "watts",
          source: "imported",
          method: "activity_file_best_effort",
          provenance: { derived_from: "activity_file_stream" },
        },
      ],
      profileRow: { dob: null, gender: null, onboarded: true },
    });
    const service = new OnboardingProviderEnrichmentService({ db: db as any });

    await service.refreshSetupData(userId, "wahoo");

    expect(insertCalls.find((call) => call.table === activityEfforts)?.values).toEqual([
      expect.objectContaining({ activity_id: null, duration_seconds: 3600, value: 248 }),
    ]);
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
        full_name: "Test Athlete",
        username: "testathlete",
        experience_level: "beginner",
        dob: "1990-01-01T00:00:00.000Z",
        weight_kg: 70,
        gender: "male",
      }),
    ).resolves.toMatchObject({ success: true });
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
        full_name: "Test Athlete",
        username: "testathlete",
        experience_level: "beginner",
        dob: "1990-01-01T00:00:00.000Z",
        weight_kg: 70,
        gender: "male",
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
