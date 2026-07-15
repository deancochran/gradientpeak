import { defaultAthletePreferenceProfile } from "@repo/core";
import type { CompleteOnboarding } from "@repo/core/schemas/onboarding";
import {
  activities,
  activityEfforts,
  integrationCredentials,
  integrations,
  profileGoals,
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
import { getOnboardingGoalId } from "../../repositories/onboarding-lifecycle-repository";
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
  existingGoalRow?: {
    id: string;
    profile_id: string;
    target_date: string;
    title: string;
    priority: number;
    activity_category: string;
    target_payload: unknown;
  };
  failGoalWrite?: boolean;
  failSettingsWriteAfter?: number;
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
  let profileTrainingSettingsValue = params?.profileTrainingSettingsValue;
  let storedGoal = params?.existingGoalRow;
  let settingsWriteCount = 0;
  const syncRows = params?.syncRows ?? [];
  let lifecycleOnboarded = profileRow?.onboarded ?? false;
  const insertCalls: InsertCall[] = [];
  const updateCalls: Array<{ table: unknown; values: unknown }> = [];

  const db = {
    transaction: async () => undefined,
    update: (table: unknown) => {
      expect(table).toBe(profiles);

      return {
        set: (values: unknown) => {
          updateCalls.push({ table, values });
          if (values && typeof values === "object" && "onboarded" in values) {
            lifecycleOnboarded =
              (values as { onboarded?: boolean }).onboarded ?? lifecycleOnboarded;
          }

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
          onConflictDoNothing: async () => {
            if (table === profileGoals) {
              if (params?.failGoalWrite) throw new Error("goal write unavailable");
              if (!storedGoal) {
                storedGoal = values as typeof storedGoal;
              }
            }
            return [];
          },
          onConflictDoUpdate: async () => {
            if (table === profileTrainingSettings) {
              settingsWriteCount += 1;
              if (
                params?.failSettingsWriteAfter !== undefined &&
                settingsWriteCount > params.failSettingsWriteAfter
              ) {
                throw new Error("settings write unavailable");
              }
              profileTrainingSettingsValue = (values as { settings: unknown }).settings;
            }
            return [];
          },
          then: (resolve: (value: unknown[]) => void) => resolve([]),
        };
      },
    }),
    select: (selection?: Record<string, unknown>) => ({
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
          if (selection && "id" in selection) {
            const rows = updatedProfileId
              ? [{ id: updatedProfileId, onboarded: lifecycleOnboarded }]
              : [];
            return {
              where: () => ({
                limit: () => ({
                  for: async () => rows,
                  then: (resolve: (value: typeof rows) => void) => resolve(rows),
                }),
              }),
            };
          }
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
          const rows = () =>
            profileTrainingSettingsValue === undefined
              ? []
              : [{ settings: profileTrainingSettingsValue }];
          return {
            where: () => ({
              limit: () => ({
                for: async () => rows(),
                then: (resolve: (value: ReturnType<typeof rows>) => void) => resolve(rows()),
              }),
            }),
          };
        }

        if (table === profileGoals) {
          const goalRow = storedGoal
            ? {
                id: storedGoal.id,
                profile_id: storedGoal.profile_id,
                target_date: storedGoal.target_date,
                title: storedGoal.title,
                priority: storedGoal.priority,
                activity_category: storedGoal.activity_category,
                target_payload: storedGoal.target_payload,
              }
            : null;
          return {
            where: () => ({
              limit: async () => (goalRow ? [goalRow] : []),
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
  let transactionTail = Promise.resolve<unknown>(undefined);
  Object.assign(db, {
    transaction: (callback: (tx: typeof db) => Promise<unknown>) => {
      const result = transactionTail.then(() => callback(db));
      transactionTail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
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
      dob: "1990-01-01",
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

  it("persists the onboarding planning timezone", async () => {
    const { caller, updateCalls } = createCaller();

    await caller.completeOnboarding({
      full_name: "Test Athlete",
      username: "test-athlete",
      planning_timezone: "Pacific/Auckland",
    });

    expect(updateCalls).toEqual([
      expect.objectContaining({
        table: profiles,
        values: expect.objectContaining({ planning_timezone: "Pacific/Auckland" }),
      }),
    ]);
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
      baseline_field_sources: { ftp: "imported" },
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

  it("persists explicit DOB and gender clears as profile nulls", async () => {
    const { caller, updateCalls } = createCaller();

    await caller.completeOnboarding({
      full_name: "Clearing Athlete",
      username: "clearing-athlete",
      baseline_field_sources: { dob: "cleared", gender: "cleared" },
    });

    expect(updateCalls.find((call) => call.table === profiles)?.values).toEqual(
      expect.objectContaining({ dob: null, gender: null }),
    );
  });

  it("persists explicit estimated, imported, and manual metric provenance", async () => {
    const { caller, insertCalls } = createCaller();

    await caller.completeOnboarding({
      full_name: "Sourced Athlete",
      username: "sourced-athlete",
      experience_level: "advanced",
      max_hr: 185,
      resting_hr: 52,
      ftp: 250,
      baseline_field_sources: {
        max_hr: "estimated",
        resting_hr: "imported",
        ftp: "manual",
      },
    });

    expect(insertCalls.find((call) => call.table === profileMetrics)?.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metric_type: "max_hr",
          source: "estimated",
          method: "onboarding_estimated_seed",
          provenance: expect.objectContaining({ seed_type: "estimated" }),
        }),
        expect.objectContaining({
          metric_type: "resting_hr",
          source: "imported",
          method: "onboarding_imported_seed",
          provenance: expect.objectContaining({ seed_type: "imported" }),
        }),
        expect.objectContaining({
          metric_type: "ftp",
          source: "manual",
          method: "onboarding_manual_seed",
          provenance: expect.objectContaining({ seed_type: "manual" }),
        }),
      ]),
    );
    expect(insertCalls.find((call) => call.table === activityEfforts)?.values).toEqual([
      expect.objectContaining({ provenance: { seed_source: "manual" } }),
    ]);
  });

  it("suppresses cleared generated metrics and efforts without deleting historical evidence", async () => {
    const historicalMetric = { value: 275, recorded_at: new Date("2025-01-01T00:00:00.000Z") };
    const { caller, insertCalls } = createCaller({ profileMetricRows: [historicalMetric] });

    await caller.completeOnboarding({
      full_name: "Clear Baseline Athlete",
      username: "clear-baseline-athlete",
      experience_level: "beginner",
      dob: "1990-01-01",
      gender: "male",
      weight_kg: 70,
      max_hr: 190,
      ftp: 260,
      threshold_pace_seconds_per_km: 270,
      css_seconds_per_hundred_meters: 100,
      baseline_field_sources: {
        max_hr: "cleared",
        ftp: "cleared",
        threshold_pace_seconds_per_km: "cleared",
        css_seconds_per_hundred_meters: "cleared",
      },
    });

    const insertedMetrics =
      (insertCalls.find((call) => call.table === profileMetrics)?.values as
        | Array<{ metric_type: string }>
        | undefined) ?? [];
    expect(insertedMetrics.map(({ metric_type }) => metric_type)).not.toEqual(
      expect.arrayContaining([
        "max_hr",
        "ftp",
        "threshold_pace_seconds_per_km",
        "css_seconds_per_100m",
      ]),
    );
    expect(insertCalls.some((call) => call.table === activityEfforts)).toBe(false);
    // Completion deliberately has no delete/tombstone path; historical evidence is left untouched.
    expect(historicalMetric).toEqual({
      value: 275,
      recorded_at: new Date("2025-01-01T00:00:00.000Z"),
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
        dob: "1990-01-01",
        weight_kg: 70,
        gender: "male",
      }),
    ).resolves.toMatchObject({ success: true });
  });

  it("returns a stable conflict when the username is claimed during completion", async () => {
    const { caller, db } = createCaller();
    const transactionDb = db as typeof db & {
      transaction: (callback: (tx: typeof db) => Promise<unknown>) => Promise<unknown>;
    };
    transactionDb.transaction = async () => {
      throw {
        code: "23505",
        constraint: "profiles_username_unique_idx",
      };
    };

    await expect(
      caller.completeOnboarding({
        full_name: "Test Athlete",
        username: "testathlete",
        experience_level: "beginner",
        dob: "1990-01-01",
        weight_kg: 70,
        gender: "male",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "That username is already taken",
    });
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
        dob: "1990-01-01",
        weight_kg: 70,
        gender: "male",
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  const lifecycleProfile: CompleteOnboarding = {
    full_name: "Lifecycle Athlete",
    username: "lifecycle-athlete",
    experience_level: "skip",
    intents: ["train_event", "groups"],
    ftp: 250,
  };
  const lifecycleGoal = {
    target_date: "2026-09-13",
    title: "Break 20 for 5K",
    priority: 1,
    activity_category: "run" as const,
    target_payload: {
      type: "event_performance" as const,
      activity_category: "run" as const,
      distance_m: 5000,
      target_time_s: 1200,
      tolerance_pct: 0.02,
      environment: "road" as const,
    },
  };
  const lifecycleSettingsPatch = { preset: "push_harder" as const };

  it("completes lifecycle setup once and makes a repeat effect-idempotent", async () => {
    const { caller, insertCalls } = createCaller();

    const first = await caller.completeLifecycleSetup({
      profile: lifecycleProfile,
      goal: lifecycleGoal,
      settings_patch: lifecycleSettingsPatch,
    });
    const repeated = await caller.completeLifecycleSetup({
      profile: { ...lifecycleProfile, full_name: "Do Not Rewrite", username: "different-name" },
      goal: lifecycleGoal,
      settings_patch: lifecycleSettingsPatch,
    });

    expect(first).toMatchObject({
      status: "completed",
      goal: { status: "saved", retryable: false },
      settings: { status: "saved", retryable: false },
      retryable: false,
      cache_tags: [
        "onboarding.getImportedOnboardingValues",
        "goals.list",
        "profileSettings.getForProfile",
      ],
    });
    expect(repeated).toMatchObject({
      status: "already_completed",
      goal: { status: "saved", retryable: false },
      settings: { status: "unchanged", retryable: false },
    });
    expect(insertCalls.filter((call) => call.table === profileMetrics)).toHaveLength(1);
    expect(insertCalls.filter((call) => call.table === activityEfforts)).toHaveLength(1);
    expect(
      new Set(
        insertCalls
          .filter((call) => call.table === profileGoals)
          .map((call) => (call.values as { id: string }).id),
      ),
    ).toEqual(new Set([getOnboardingGoalId("11111111-1111-4111-8111-111111111111")]));
    expect(
      insertCalls.filter((call) => call.table === profileTrainingSettings).at(-1)?.values,
    ).toMatchObject({
      profile_id: "11111111-1111-4111-8111-111111111111",
      settings: { onboarding_intents: ["train_event", "groups"] },
    });
  });

  it("patches only named compact settings and preserves newer advanced settings", async () => {
    const current = {
      ...defaultAthletePreferenceProfile,
      dose_limits: {
        ...defaultAthletePreferenceProfile.dose_limits,
        min_sessions_per_week: 2,
        max_sessions_per_week: 8,
        max_weekly_duration_minutes: 900,
        sport_overrides: {
          run: { max_sessions_per_week: 6 },
          bike: { max_sessions_per_week: 7 },
        },
      },
      recovery_preferences: {
        ...defaultAthletePreferenceProfile.recovery_preferences,
        post_goal_recovery_days: 12,
      },
    };
    const { caller, insertCalls } = createCaller({
      profileRow: { dob: null, gender: null, onboarded: true },
      profileTrainingSettingsValue: current,
    });

    await caller.completeLifecycleSetup({
      profile: lifecycleProfile,
      settings_patch: { minSessionsPerWeek: 4 },
    });

    const saved = insertCalls.filter((call) => call.table === profileTrainingSettings).at(-1)
      ?.values as { settings: typeof current };
    expect(saved.settings.dose_limits.min_sessions_per_week).toBe(4);
    expect(saved.settings.dose_limits.max_sessions_per_week).toBe(8);
    expect(saved.settings.dose_limits.max_weekly_duration_minutes).toBe(900);
    expect(saved.settings.dose_limits.sport_overrides).toEqual(current.dose_limits.sport_overrides);
    expect(saved.settings.recovery_preferences.post_goal_recovery_days).toBe(12);
    expect(saved.settings.onboarding_intents).toEqual(lifecycleProfile.intents);
  });

  it("uses canonical defaults when no settings row exists", async () => {
    const { caller, insertCalls } = createCaller({
      profileRow: { dob: null, gender: null, onboarded: true },
    });

    await caller.completeLifecycleSetup({
      profile: lifecycleProfile,
      settings_patch: { maxWeeklyMinutes: 480, preset: "safer" },
    });

    const saved = insertCalls.filter((call) => call.table === profileTrainingSettings).at(-1)
      ?.values as { settings: typeof defaultAthletePreferenceProfile };
    expect(saved.settings.dose_limits.min_sessions_per_week).toBe(3);
    expect(saved.settings.dose_limits.max_weekly_duration_minutes).toBe(480);
    expect(saved.settings.training_style.progression_pace).toBe(0.25);
  });

  it("treats reordered sport override records as unchanged", async () => {
    const settings = {
      ...defaultAthletePreferenceProfile,
      dose_limits: {
        ...defaultAthletePreferenceProfile.dose_limits,
        sport_overrides: {
          bike: { max_sessions_per_week: 5 },
          run: { max_sessions_per_week: 4 },
        },
      },
      onboarding_intents: lifecycleProfile.intents,
    };
    const { caller } = createCaller({
      profileRow: { dob: null, gender: null, onboarded: true },
      profileTrainingSettingsValue: settings,
    });

    await expect(
      caller.completeLifecycleSetup({ profile: lifecycleProfile, settings_patch: {} }),
    ).resolves.toMatchObject({ settings: { status: "unchanged", retryable: false } });
  });

  it("rejects malformed compact settings before writes", async () => {
    const { caller, insertCalls, updateCalls } = createCaller();

    await expect(
      caller.completeLifecycleSetup({
        profile: lifecycleProfile,
        settings_patch: { minSessionsPerWeek: 9, maxSessionsPerWeek: 2 },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(insertCalls).toEqual([]);
    expect(updateCalls).toEqual([]);
  });

  it("returns a retryable partial failure when a valid patch conflicts with latest settings", async () => {
    const { caller } = createCaller({
      profileRow: { dob: null, gender: null, onboarded: true },
      profileTrainingSettingsValue: {
        ...defaultAthletePreferenceProfile,
        dose_limits: { ...defaultAthletePreferenceProfile.dose_limits, max_sessions_per_week: 3 },
      },
    });

    await expect(
      caller.completeLifecycleSetup({
        profile: lifecycleProfile,
        settings_patch: { minSessionsPerWeek: 4 },
      }),
    ).resolves.toMatchObject({
      status: "already_completed",
      settings: { status: "failed", retryable: true, failure_code: "temporarily_unavailable" },
      retryable: true,
    });
  });

  it("serializes rapid completion calls at the profile lock without duplicate observations", async () => {
    const { caller, insertCalls } = createCaller();

    const results = await Promise.all([
      caller.completeLifecycleSetup({ profile: lifecycleProfile }),
      caller.completeLifecycleSetup({ profile: lifecycleProfile }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      "already_completed",
      "completed",
    ]);
    expect(insertCalls.filter((call) => call.table === profileMetrics)).toHaveLength(1);
    expect(insertCalls.filter((call) => call.table === activityEfforts)).toHaveLength(1);
  });

  it("keeps legacy completion compatible while suppressing retry observations", async () => {
    const { caller, insertCalls } = createCaller();

    await expect(caller.completeOnboarding(lifecycleProfile)).resolves.toMatchObject({
      success: true,
      created: { profile_metrics: 1, activity_efforts: 1 },
    });
    await expect(
      caller.completeOnboarding({
        ...lifecycleProfile,
        full_name: "Finalized identity must not change",
      }),
    ).resolves.toMatchObject({
      success: true,
      created: { profile_metrics: 0, activity_efforts: 0 },
    });
    expect(insertCalls.filter((call) => call.table === profileMetrics)).toHaveLength(1);
    expect(insertCalls.filter((call) => call.table === activityEfforts)).toHaveLength(1);
  });

  it("repairs optional sections after onboarding and skips volatile provider prerequisites", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const integrationId = "22222222-2222-4222-8222-222222222222";
    const { caller } = createCaller({
      profileRow: { dob: null, gender: null, onboarded: true },
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
      caller.completeLifecycleSetup({
        profile: lifecycleProfile,
        goal: lifecycleGoal,
        settings_patch: lifecycleSettingsPatch,
      }),
    ).resolves.toMatchObject({
      status: "already_completed",
      goal: { status: "saved" },
      settings: { status: "saved" },
    });
  });

  it("continues to settings when goal persistence fails", async () => {
    const { caller } = createCaller({ failGoalWrite: true });

    await expect(
      caller.completeLifecycleSetup({
        profile: lifecycleProfile,
        goal: lifecycleGoal,
        settings_patch: lifecycleSettingsPatch,
      }),
    ).resolves.toMatchObject({
      status: "completed",
      goal: { status: "failed", retryable: true, failure_code: "temporarily_unavailable" },
      settings: { status: "saved", retryable: false },
      retryable: true,
    });
  });

  it("keeps a saved goal when optional settings persistence fails", async () => {
    const { caller } = createCaller({ failSettingsWriteAfter: 1 });

    await expect(
      caller.completeLifecycleSetup({
        profile: lifecycleProfile,
        goal: lifecycleGoal,
        settings_patch: lifecycleSettingsPatch,
      }),
    ).resolves.toMatchObject({
      status: "completed",
      goal: { status: "saved", retryable: false },
      settings: {
        status: "failed",
        retryable: true,
        failure_code: "temporarily_unavailable",
      },
      retryable: true,
    });
  });

  it("does not overwrite a deterministic onboarding goal conflict", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const { caller } = createCaller({
      existingGoalRow: {
        id: getOnboardingGoalId(userId),
        profile_id: userId,
        ...lifecycleGoal,
        title: "Existing different goal",
      },
    });

    await expect(
      caller.completeLifecycleSetup({ profile: lifecycleProfile, goal: lifecycleGoal }),
    ).resolves.toMatchObject({
      status: "completed",
      goal: { status: "failed", retryable: false, failure_code: "content_conflict" },
      settings: { status: "skipped", retryable: false },
    });
  });

  it("derives lifecycle ownership only from the authenticated session", async () => {
    const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const { caller, insertCalls } = createCaller({ userId });

    await caller.completeLifecycleSetup({
      profile: lifecycleProfile,
      goal: lifecycleGoal,
      settings_patch: lifecycleSettingsPatch,
    });

    expect(insertCalls.find((call) => call.table === profileGoals)?.values).toMatchObject({
      profile_id: userId,
    });
    expect(
      insertCalls.filter((call) => call.table === profileTrainingSettings).at(-1)?.values,
    ).toMatchObject({ profile_id: userId });
  });
});
