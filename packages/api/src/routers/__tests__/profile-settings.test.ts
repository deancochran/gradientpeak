import { defaultAthletePreferenceProfile } from "@repo/core";
import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { profileSettingsRouter } from "../profile-settings";

type QueryResult = {
  data: any;
  error: { message: string } | null;
};

type QueryMap = Record<string, QueryResult | QueryResult[]>;

const baseSettings = defaultAthletePreferenceProfile;

function createSupabaseMock(queryMap: QueryMap) {
  const counters = new Map<string, number>();

  const nextResult = (table: string): QueryResult => {
    const entry = queryMap[table];
    if (!entry) return { data: null, error: null };
    if (!Array.isArray(entry)) return entry;

    const index = counters.get(table) ?? 0;
    counters.set(table, index + 1);

    return entry[index] ?? entry[entry.length - 1] ?? { data: null, error: null };
  };

  return {
    from: (table: string) => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        upsert: () => builder,
        single: () => Promise.resolve(nextResult(table)),
        maybeSingle: () => Promise.resolve(nextResult(table)),
        then: (onFulfilled: (value: QueryResult) => unknown) =>
          Promise.resolve(nextResult(table)).then(onFulfilled),
      };

      return builder;
    },
  };
}

function createCaller(params?: { userId?: string; queryMap?: QueryMap }) {
  const { userId, queryMap = {} } = params ?? {};
  const supabase = createSupabaseMock(queryMap);

  const caller = profileSettingsRouter.createCaller({
    supabase: supabase as any,
    session: { user: { id: userId ?? "11111111-1111-4111-8111-111111111111" } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);

  return { caller };
}

describe("profileSettingsRouter", () => {
  it("returns null when profile settings do not exist", async () => {
    const { caller } = createCaller({
      userId: "11111111-1111-4111-8111-111111111111",
      queryMap: {
        profile_training_settings: { data: null, error: null },
      },
    });

    const result = await caller.getForProfile({
      profile_id: "11111111-1111-4111-8111-111111111111",
    });

    expect(result).toBeNull();
  });

  it("rejects unauthorized profile settings access", async () => {
    const { caller } = createCaller({
      userId: "99999999-9999-4999-8999-999999999999",
      queryMap: {
        coaches_athletes: { data: null, error: null },
      },
    });

    await expect(
      caller.getForProfile({
        profile_id: "11111111-1111-4111-8111-111111111111",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } as Partial<TRPCError>);
  });

  it("upserts settings for an authorized coach", async () => {
    const profileId = "11111111-1111-4111-8111-111111111111";
    const coachId = "22222222-2222-4222-8222-222222222222";
    const { caller } = createCaller({
      userId: coachId,
      queryMap: {
        coaches_athletes: { data: { coach_id: coachId }, error: null },
        profile_training_settings: {
          data: {
            profile_id: profileId,
            settings: baseSettings,
            updated_at: "2026-03-06T00:00:00.000Z",
          },
          error: null,
        },
      },
    });

    const result = await caller.upsert({
      profile_id: profileId,
      settings: baseSettings,
    });

    expect(result.profile_id).toBe(profileId);
    expect(result.cache_tags).toContain("profileSettings.getForProfile");
  });

  it("coerces legacy stored training settings into canonical profile preferences", async () => {
    const profileId = "11111111-1111-4111-8111-111111111111";
    const { caller } = createCaller({
      userId: profileId,
      queryMap: {
        profile_training_settings: {
          data: {
            profile_id: profileId,
            settings: {
              availability_config: {
                template: "custom",
                days: [
                  {
                    day: "monday",
                    windows: [{ start_minute_of_day: 360, end_minute_of_day: 420 }],
                    max_sessions: 1,
                  },
                  ...["tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(
                    (day) => ({ day, windows: [] }),
                  ),
                ],
              },
              recent_influence: { influence_score: 0.2 },
              recent_influence_action: "accepted",
              constraints: {
                hard_rest_days: ["friday"],
                min_sessions_per_week: 3,
                max_sessions_per_week: 5,
                max_single_session_duration_minutes: 120,
              },
              optimization_profile: "balanced",
              post_goal_recovery_days: 6,
              behavior_controls_v1: {
                aggressiveness: 0.55,
                variability: 0.4,
                spike_frequency: 0.3,
                shape_target: 0,
                shape_strength: 0.35,
                recovery_priority: 0.7,
                starting_fitness_confidence: 0.6,
              },
              calibration_composite_locks: {
                target_attainment_weight: false,
                envelope_weight: false,
                durability_weight: false,
                evidence_weight: false,
              },
              calibration: {},
            },
            updated_at: "2026-03-06T00:00:00.000Z",
          },
          error: null,
        },
      },
    });

    const result = await caller.getForProfile({ profile_id: profileId });

    expect(result?.settings.availability.hard_rest_days).toEqual(["friday"]);
    expect(result?.settings.training_style.progression_pace).toBe(0.55);
    expect(result?.settings.recovery_preferences.post_goal_recovery_days).toBe(6);
    expect(result?.settings.goal_strategy_preferences.target_surplus_preference).toBe(0);
  });

  it("coerces legacy stored settings even when extra legacy metadata keys are present", async () => {
    const profileId = "11111111-1111-4111-8111-111111111111";
    const { caller } = createCaller({
      userId: profileId,
      queryMap: {
        profile_training_settings: {
          data: {
            profile_id: profileId,
            settings: {
              availability_config: {
                template: "moderate",
                days: [
                  {
                    day: "monday",
                    windows: [{ start_minute_of_day: 360, end_minute_of_day: 450 }],
                    max_sessions: 1,
                  },
                  {
                    day: "tuesday",
                    windows: [{ start_minute_of_day: 360, end_minute_of_day: 450 }],
                    max_sessions: 1,
                  },
                  { day: "wednesday", windows: [], max_sessions: 0 },
                  {
                    day: "thursday",
                    windows: [{ start_minute_of_day: 360, end_minute_of_day: 450 }],
                    max_sessions: 1,
                  },
                  { day: "friday", windows: [], max_sessions: 0 },
                  {
                    day: "saturday",
                    windows: [{ start_minute_of_day: 450, end_minute_of_day: 570 }],
                    max_sessions: 1,
                  },
                  { day: "sunday", windows: [], max_sessions: 0 },
                ],
              },
              recent_influence: { influence_score: 0 },
              recent_influence_action: "disabled",
              constraints: {
                hard_rest_days: ["wednesday", "friday", "sunday"],
                max_sessions_per_week: 4,
                min_sessions_per_week: 3,
                goal_difficulty_preference: "conservative",
                max_single_session_duration_minutes: 90,
              },
              optimization_profile: "balanced",
              post_goal_recovery_days: 5,
              behavior_controls_v1: {
                variability: 0.5,
                shape_target: 0,
                aggressiveness: 0.48,
                shape_strength: 0.35,
                spike_frequency: 0.35,
                recovery_priority: 0.45,
                starting_fitness_confidence: 0.6,
              },
              locks: {
                hard_rest_days: { locked: false },
              },
              calibration: {
                version: 1,
                readiness_timeline: {
                  target_tsb: 8,
                  form_tolerance: 20,
                  max_step_delta: 9,
                  smoothing_lambda: 0.28,
                  smoothing_iterations: 24,
                  fatigue_overflow_scale: 0.4,
                  feasibility_blend_weight: 0.15,
                },
              },
              availability_provenance: {
                source: "user",
              },
              recent_influence_provenance: {
                source: "user",
              },
              calibration_composite_locks: {
                envelope_weight: false,
                evidence_weight: false,
                durability_weight: false,
                target_attainment_weight: false,
              },
            },
            updated_at: "2026-03-10T00:51:07.995Z",
          },
          error: null,
        },
      },
    });

    const result = await caller.getForProfile({ profile_id: profileId });

    expect(result?.settings.availability.hard_rest_days).toEqual(["wednesday", "friday", "sunday"]);
    expect(result?.settings.dose_limits.max_sessions_per_week).toBe(4);
    expect(result?.settings.training_style.progression_pace).toBe(0.48);
  });
});
