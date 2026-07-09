import { describe, expect, it } from "vitest";
import { defaultAthletePreferenceProfile } from "../../schemas/settings/profile_settings";
import { buildDailyLoadDistribution } from "../dailyLoadDistribution";
import type { WeeklyAllocation } from "../weeklyAllocation";

type CategoryConfig = {
  role?: "primary" | "secondary" | "support" | "recovery" | "optional";
  sessions: number;
  duration?: number;
  unit?: "minutes" | "sets";
  exposure?:
    | "long_session"
    | "threshold_interval"
    | "vo2_interval"
    | "race_specific"
    | "strength_heavy"
    | "strength_hypertrophy"
    | "strength_power"
    | "durability"
    | "mobility"
    | "technique"
    | "recovery";
  loadMultiplier?: number;
};

function weeklyAllocationFor(
  categories: Partial<Record<"run" | "bike" | "swim" | "strength", CategoryConfig>>,
): WeeklyAllocation {
  const activity_categories = Object.fromEntries(
    Object.entries(categories).map(([activityCategory, config]) => {
      const duration = config.duration ?? (activityCategory === "strength" ? 12 : 60);
      const unit = config.unit ?? (activityCategory === "strength" ? "sets" : "minutes");
      return [
        activityCategory,
        {
          role: config.role ?? (activityCategory === "run" ? "primary" : "secondary"),
          volume: {
            unit,
            minimum_effective: duration,
            target: duration,
            maximum_recoverable: duration,
            duration_minutes: {
              minimum_effective: unit === "sets" ? duration * 6 : duration,
              target: unit === "sets" ? duration * 6 : duration,
              maximum_recoverable: unit === "sets" ? duration * 6 : duration,
            },
          },
          sessions: { min: 0, target: config.sessions, max: Math.max(config.sessions, 1) },
          key_exposures: config.exposure
            ? [
                {
                  type: config.exposure,
                  activity_category: activityCategory,
                  min_frequency_per_week: 0,
                  target_frequency_per_week: 1,
                  max_frequency_per_week: 1,
                },
              ]
            : [],
          intensity_distribution: { aerobic_endurance: 1 },
          load_model: {
            load_method:
              activityCategory === "strength"
                ? "strength_volume"
                : activityCategory === "bike"
                  ? "bike_power"
                  : activityCategory === "swim"
                    ? "swim_threshold_speed"
                    : "run_pace",
            fatigue_cost_multiplier: config.loadMultiplier ?? 1,
            mechanical_load_multiplier: 1,
          },
        },
      ];
    }),
  ) as WeeklyAllocation["activity_categories"];

  return {
    version: 1,
    activity_categories,
    totals: {
      target_duration_minutes: Object.values(activity_categories).reduce(
        (sum, category) => sum + (category?.volume.duration_minutes?.target ?? 0),
        0,
      ),
      target_sessions: Object.values(activity_categories).reduce(
        (sum, category) => sum + (category?.sessions.target ?? 0),
        0,
      ),
      estimated_fatigue_cost: 0,
    },
  };
}

function sumRecommendedLoad(points: ReturnType<typeof buildDailyLoadDistribution>) {
  return Math.round(points.reduce((sum, point) => sum + point.recommended_load_tss, 0) * 10) / 10;
}

function profileWithSessionCount(sessionCount: number) {
  return {
    ...defaultAthletePreferenceProfile,
    dose_limits: {
      ...defaultAthletePreferenceProfile.dose_limits,
      min_sessions_per_week: sessionCount,
      max_sessions_per_week: sessionCount,
    },
  };
}

describe("buildDailyLoadDistribution", () => {
  it("returns no points for inverted date ranges", () => {
    expect(
      buildDailyLoadDistribution({
        startDate: "2026-01-12",
        endDate: "2026-01-05",
        weeklyTargets: [{ weekStartDate: "2026-01-12", targetTss: 300 }],
        preferenceProfile: defaultAthletePreferenceProfile,
      }),
    ).toEqual([]);
  });

  it("distributes derived weekly load across available training days", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 300, phase: "ramp" }],
      preferenceProfile: defaultAthletePreferenceProfile,
    });

    const loads = points.map((point) => point.recommended_load_tss);
    expect(loads.reduce((sum, load) => sum + load, 0)).toBe(300);
    expect(loads.filter((load) => load > 0).length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...loads)).toBeLessThan(300);
    expect(Math.max(...loads)).toBeLessThanOrEqual(135);
  });

  it("honors hard rest days from profile preferences", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 210 }],
      preferenceProfile: {
        ...defaultAthletePreferenceProfile,
        availability: {
          ...defaultAthletePreferenceProfile.availability,
          hard_rest_days: ["wednesday", "friday", "sunday"],
        },
      },
    });

    expect(points.find((point) => point.date === "2026-01-07")?.recommended_load_tss).toBe(0);
    expect(points.find((point) => point.date === "2026-01-09")?.recommended_load_tss).toBe(0);
    expect(points.find((point) => point.date === "2026-01-11")?.recommended_load_tss).toBe(0);
    expect(points.reduce((sum, point) => sum + point.recommended_load_tss, 0)).toBe(210);
  });

  it("prorates weekly targets across partial weeks while keeping the date range contiguous", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-14",
      weeklyTargets: [
        { weekStartDate: "2026-01-05", targetTss: 210 },
        { weekStartDate: "2026-01-12", targetTss: 280 },
      ],
      preferenceProfile: defaultAthletePreferenceProfile,
    });

    expect(points.map((point) => point.date)).toEqual([
      "2026-01-05",
      "2026-01-06",
      "2026-01-07",
      "2026-01-08",
      "2026-01-09",
      "2026-01-10",
      "2026-01-11",
      "2026-01-12",
      "2026-01-13",
      "2026-01-14",
    ]);
    expect(points.slice(0, 7).reduce((sum, point) => sum + point.recommended_load_tss, 0)).toBe(
      210,
    );
    expect(points.slice(7).reduce((sum, point) => sum + point.recommended_load_tss, 0)).toBe(120);
  });

  it("uses profile dose limits when preferences are unadjusted elsewhere", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 280 }],
      preferenceProfile: {
        ...defaultAthletePreferenceProfile,
        dose_limits: {
          ...defaultAthletePreferenceProfile.dose_limits,
          min_sessions_per_week: 4,
          max_sessions_per_week: 4,
        },
      },
    });

    expect(points.filter((point) => point.recommended_load_tss > 0)).toHaveLength(4);
    expect(points.reduce((sum, point) => sum + point.recommended_load_tss, 0)).toBe(280);
  });

  it("uses explicit scheduling constraints before profile defaults", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 200 }],
      preferenceProfile: {
        ...defaultAthletePreferenceProfile,
        availability: {
          ...defaultAthletePreferenceProfile.availability,
          hard_rest_days: ["monday"],
        },
      },
      schedulingConstraints: {
        preferredWeekdays: [0, 2], // Numeric convention is Monday = 0, Wednesday = 2.
        hardRestDays: ["tuesday"],
        minSessionsPerWeek: 2,
        maxSessionsPerWeek: 2,
      },
    });

    expect(
      points.find((point) => point.date === "2026-01-05")?.recommended_load_tss,
    ).toBeGreaterThan(0);
    expect(points.find((point) => point.date === "2026-01-06")?.recommended_load_tss).toBe(0);
    expect(
      points.find((point) => point.date === "2026-01-07")?.recommended_load_tss,
    ).toBeGreaterThan(0);
    expect(points.filter((point) => point.recommended_load_tss > 0)).toHaveLength(2);
  });

  it("anchors generated load on planned session dates", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 300 }],
      plannedSessions: [{ date: "2026-01-11", estimatedTss: 90 }],
      schedulingConstraints: {
        preferredWeekdays: [0, 2],
        minSessionsPerWeek: 2,
        maxSessionsPerWeek: 2,
      },
    });

    const sunday = points.find((point) => point.date === "2026-01-11");
    expect(sunday?.recommended_load_tss).toBeGreaterThan(0);
    expect(sunday?.reason_codes).toContain("planned_session_date_applied");
    expect(points.filter((point) => point.recommended_load_tss > 0)).toHaveLength(2);
  });

  it("distributes triathlon weekly allocation across run, bike, and swim days", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 420, phase: "build" }],
      weeklyAllocation: weeklyAllocationFor({
        run: { role: "primary", sessions: 2, duration: 120, exposure: "long_session" },
        bike: { role: "secondary", sessions: 2, duration: 150, exposure: "threshold_interval" },
        swim: { role: "secondary", sessions: 1, duration: 45, exposure: "technique" },
      }),
    });

    const trainingPoints = points.filter((point) => point.recommended_load_tss > 0);
    expect(trainingPoints).toHaveLength(5);
    expect(trainingPoints.map((point) => point.activity_category)).toEqual([
      "run",
      "bike",
      "swim",
      "run",
      "bike",
    ]);
    expect(new Set(trainingPoints.map((point) => point.activity_category))).toEqual(
      new Set(["run", "bike", "swim"]),
    );
    expect(sumRecommendedLoad(points)).toBe(420);
  });

  it("treats strength as a first-class allocation with strength focus", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 300 }],
      weeklyAllocation: weeklyAllocationFor({
        run: { role: "primary", sessions: 3, duration: 150 },
        strength: {
          role: "support",
          sessions: 2,
          duration: 10,
          unit: "sets",
          exposure: "strength_heavy",
          loadMultiplier: 0.6,
        },
      }),
    });

    const strengthPoints = points.filter((point) => point.activity_category === "strength");
    expect(strengthPoints).toHaveLength(2);
    expect(strengthPoints.every((point) => point.primary_focus === "max_strength")).toBe(true);
    expect(sumRecommendedLoad(points)).toBe(300);
  });

  it("falls back to the primary allocation category when no planned session pin exists", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 180 }],
      weeklyAllocation: weeklyAllocationFor({
        bike: { role: "primary", sessions: 3, duration: 180 },
      }),
    });

    expect(
      points
        .filter((point) => point.recommended_load_tss > 0)
        .every((point) => point.activity_category === "bike"),
    ).toBe(true);
    expect(sumRecommendedLoad(points)).toBe(180);
  });

  it("pins planned session category and focus when the session is selected", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 240 }],
      weeklyAllocation: weeklyAllocationFor({
        run: { role: "primary", sessions: 2, duration: 120 },
        swim: { role: "secondary", sessions: 1, duration: 45 },
      }),
      plannedSessions: [
        {
          date: "2026-01-07",
          activityCategory: "swim",
          primaryFocus: "recovery",
        },
      ],
    });

    const pinned = points.find((point) => point.date === "2026-01-07");
    expect(pinned?.recommended_load_tss).toBeGreaterThan(0);
    expect(pinned?.activity_category).toBe("swim");
    expect(pinned?.primary_focus).toBe("recovery");
    expect(pinned?.reason_codes).toContain("planned_session_category_pin");
    expect(sumRecommendedLoad(points)).toBe(240);
  });

  it("uses build templates by session count while preserving weekly load", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 300, phase: "build" }],
      preferenceProfile: profileWithSessionCount(3),
    });

    const trainingPoints = points.filter((point) => point.recommended_load_tss > 0);
    expect(trainingPoints.map((point) => point.primary_focus)).toEqual([
      "endurance",
      "threshold",
      "long_endurance",
    ]);
    expect(sumRecommendedLoad(points)).toBe(300);
  });

  it("uses explicit deload templates without hard workout focus", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 180, phase: "deload" }],
      preferenceProfile: profileWithSessionCount(4),
    });

    const trainingFocuses = points
      .filter((point) => point.recommended_load_tss > 0)
      .map((point) => point.primary_focus);
    expect(trainingFocuses).toEqual(["recovery", "endurance", "mobility", "recovery"]);
    expect(trainingFocuses).not.toContain("threshold");
    expect(trainingFocuses).not.toContain("tempo");
    expect(sumRecommendedLoad(points)).toBe(180);
  });

  it("protects race day and degrades adjacent hard taper focus", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [
        {
          weekStartDate: "2026-01-05",
          targetTss: 140,
          phase: "event",
          eventDate: "2026-01-07",
        },
      ],
      preferenceProfile: profileWithSessionCount(2),
    });

    expect(points.find((point) => point.date === "2026-01-06")?.primary_focus).toBe("endurance");
    expect(points.find((point) => point.date === "2026-01-07")?.primary_focus).toBe(
      "race_specific",
    );
    expect(sumRecommendedLoad(points)).toBe(140);
  });

  it("keeps event day in event weeks and assigns post-event recovery", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [
        {
          weekStartDate: "2026-01-05",
          targetTss: 210,
          phase: "event",
          eventDate: "2026-01-11",
          recoveryRanges: [{ startDate: "2026-01-12", endDate: "2026-01-14" }],
        },
      ],
      preferenceProfile: profileWithSessionCount(3),
    });

    expect(points.find((point) => point.date === "2026-01-11")?.primary_focus).toBe(
      "race_specific",
    );
    expect(
      points.find((point) => point.date === "2026-01-11")?.recommended_load_tss,
    ).toBeGreaterThan(0);
    expect(sumRecommendedLoad(points)).toBe(210);
  });

  it("assigns post-event recovery later in the same event week", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [
        {
          weekStartDate: "2026-01-05",
          targetTss: 200,
          phase: "event",
          eventDate: "2026-01-07",
        },
      ],
      preferenceProfile: profileWithSessionCount(4),
    });

    expect(points.find((point) => point.date === "2026-01-07")?.primary_focus).toBe(
      "race_specific",
    );
    expect(points.find((point) => point.date === "2026-01-09")?.primary_focus).toBe("recovery");
    expect(points.find((point) => point.date === "2026-01-11")?.primary_focus).toBe("mobility");
    expect(sumRecommendedLoad(points)).toBe(200);
  });

  it("marks recovery overlap ranges when projection metadata provides them", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-12",
      endDate: "2026-01-18",
      weeklyTargets: [
        {
          weekStartDate: "2026-01-12",
          targetTss: 120,
          phase: "recovery",
          recoveryRanges: [{ startDate: "2026-01-12", endDate: "2026-01-18" }],
        },
      ],
      preferenceProfile: profileWithSessionCount(3),
    });

    const trainingFocuses = points
      .filter((point) => point.recommended_load_tss > 0)
      .map((point) => point.primary_focus);
    expect(trainingFocuses).toEqual(["recovery", "mobility", "recovery"]);
    expect(sumRecommendedLoad(points)).toBe(120);
  });

  it("caps daily load by explicit availability duration", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 300 }],
      preferenceProfile: {
        ...defaultAthletePreferenceProfile,
        availability: {
          weekly_windows: [
            { day: "monday", windows: [{ start_minute_of_day: 360, end_minute_of_day: 390 }] },
            { day: "wednesday", windows: [{ start_minute_of_day: 360, end_minute_of_day: 390 }] },
            { day: "friday", windows: [{ start_minute_of_day: 360, end_minute_of_day: 390 }] },
          ],
          hard_rest_days: [],
        },
        dose_limits: {
          ...defaultAthletePreferenceProfile.dose_limits,
          min_sessions_per_week: 3,
          max_sessions_per_week: 3,
          max_single_session_duration_minutes: 120,
        },
      },
    });

    expect(points.find((point) => point.date === "2026-01-06")?.recommended_load_tss).toBe(0);
    expect(Math.max(...points.map((point) => point.recommended_load_tss))).toBeLessThanOrEqual(
      40.5,
    );
    expect(points.reduce((sum, point) => sum + point.recommended_load_tss, 0)).toBeLessThan(300);
    expect(
      points.some((point) =>
        point.reason_codes.includes("weekly_target_under_allocated_daily_caps"),
      ),
    ).toBe(true);
  });

  it("caps daily load by max single session duration", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 250 }],
      preferenceProfile: {
        ...defaultAthletePreferenceProfile,
        dose_limits: {
          ...defaultAthletePreferenceProfile.dose_limits,
          min_sessions_per_week: 3,
          max_sessions_per_week: 3,
          max_single_session_duration_minutes: 30,
        },
      },
    });

    expect(Math.max(...points.map((point) => point.recommended_load_tss))).toBeLessThanOrEqual(
      40.5,
    );
    expect(points.reduce((sum, point) => sum + point.recommended_load_tss, 0)).toBeLessThan(250);
  });

  it("keeps hard rest days at zero and under-allocates instead of spilling above caps", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 400 }],
      preferenceProfile: {
        ...defaultAthletePreferenceProfile,
        availability: {
          weekly_windows: [
            { day: "monday", windows: [{ start_minute_of_day: 360, end_minute_of_day: 420 }] },
            { day: "tuesday", windows: [{ start_minute_of_day: 360, end_minute_of_day: 420 }] },
          ],
          hard_rest_days: ["tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
        },
        dose_limits: {
          ...defaultAthletePreferenceProfile.dose_limits,
          min_sessions_per_week: 1,
          max_sessions_per_week: 1,
          max_single_session_duration_minutes: 60,
        },
      },
    });

    expect(points.find((point) => point.date === "2026-01-06")?.recommended_load_tss).toBe(0);
    expect(points.reduce((sum, point) => sum + point.recommended_load_tss, 0)).toBeLessThanOrEqual(
      60,
    );
    expect(points.find((point) => point.date === "2026-01-06")?.reason_codes).toContain(
      "hard_rest_day_cap",
    );
  });

  it("caps daily load for low CTL and low readiness", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 220 }],
      preferenceProfile: {
        ...defaultAthletePreferenceProfile,
        dose_limits: {
          ...defaultAthletePreferenceProfile.dose_limits,
          min_sessions_per_week: 3,
          max_sessions_per_week: 3,
          max_single_session_duration_minutes: 120,
        },
      },
      capacityContext: { startingCtl: 12, startingAtl: 20, startingTsb: -8, readinessScore: 30 },
    });

    expect(Math.max(...points.map((point) => point.recommended_load_tss))).toBeLessThanOrEqual(20);
    expect(points.reduce((sum, point) => sum + point.recommended_load_tss, 0)).toBeLessThan(220);
    expect(
      points.some((point) => point.reason_codes.includes("athlete_capacity_cap_applied")),
    ).toBe(true);
  });

  it("does not add rounding remainder above a binding daily cap", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 100.1 }],
      preferenceProfile: {
        ...defaultAthletePreferenceProfile,
        dose_limits: {
          ...defaultAthletePreferenceProfile.dose_limits,
          min_sessions_per_week: 2,
          max_sessions_per_week: 2,
          max_single_session_duration_minutes: 50,
        },
      },
    });

    expect(Math.max(...points.map((point) => point.recommended_load_tss))).toBeLessThanOrEqual(
      60.1,
    );
    expect(points.reduce((sum, point) => sum + point.recommended_load_tss, 0)).toBeLessThanOrEqual(
      100.1,
    );
  });

  it("returns zero load when every profiled day is unavailable", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 180 }],
      preferenceProfile: {
        ...defaultAthletePreferenceProfile,
        availability: {
          weekly_windows: [],
          hard_rest_days: [
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
          ],
        },
      },
    });

    expect(points.map((point) => point.recommended_load_tss)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(
      points.every((point) => point.reason_codes.includes("all_training_days_unavailable")),
    ).toBe(true);
  });

  it("emits deterministic high confidence provenance for profile-backed planned dates", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekStartDate: "2026-01-05", targetTss: 300 }],
      preferenceProfile: defaultAthletePreferenceProfile,
      plannedSessions: [{ date: "2026-01-07", estimatedTss: 80 }],
    });

    const plannedDay = points.find((point) => point.date === "2026-01-07");
    expect(plannedDay).toBeDefined();
    if (!plannedDay) return;
    expect(plannedDay.confidence).toBe("high");
    expect(plannedDay.confidence_score).toBeGreaterThanOrEqual(80);
    expect(plannedDay.reason_codes).toEqual([
      "daily_load_distribution_v1",
      "source_weekly_target",
      "target_positive_tss",
      "source_preference_profile",
      "availability_default_pattern",
      "source_planned_session_dates",
      "planned_session_date_applied",
      "planned_session_date_specific",
      "fallback_default_activity_category",
      "profile_goal_weekly_distribution",
      "weekly_allocation_category_budget",
      "max_single_session_duration_cap_applied",
    ]);
  });

  it("marks missing weekly targets and default patterns as low confidence", () => {
    const points = buildDailyLoadDistribution({
      startDate: "2026-01-05",
      endDate: "2026-01-07",
      weeklyTargets: [],
    });

    expect(points[0]?.confidence).toBe("low");
    expect(points[0]?.reason_codes).toEqual([
      "daily_load_distribution_v1",
      "source_missing_weekly_target",
      "target_zero_tss",
      "partial_week_scaled",
      "fallback_missing_preference_profile",
      "availability_default_pattern",
      "fallback_anchor_session_pattern",
      "fallback_default_activity_category",
      "profile_goal_weekly_distribution",
      "weekly_allocation_category_budget",
      "daily_cap_binding",
    ]);
  });
});
