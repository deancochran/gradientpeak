import { describe, expect, it } from "vitest";
import {
  buildDeterministicProjectionPayload,
  getProjectionWeekPattern,
  weeklyLoadFromBlockAndBaseline,
} from "../projectionCalculations";

describe("projection calculations", () => {
  it("blends block target range and baseline weekly TSS", () => {
    const weeklyTss = weeklyLoadFromBlockAndBaseline(
      {
        target_weekly_tss_range: { min: 280, max: 320 },
      },
      200,
    );

    expect(weeklyTss).toBe(265);
  });

  it("uses baseline weekly TSS when block has no target range", () => {
    expect(weeklyLoadFromBlockAndBaseline(undefined, 187.34)).toBe(187.3);
  });

  it("classifies event week when goal lands inside week", () => {
    const pattern = getProjectionWeekPattern({
      blockPhase: "build",
      weekIndexWithinBlock: 1,
      weekStartDate: "2026-03-09",
      weekEndDate: "2026-03-15",
      goals: [{ target_date: "2026-03-12" }],
    });

    expect(pattern).toEqual({ pattern: "event", multiplier: 0.82 });
  });

  it("classifies pre-goal week as taper", () => {
    const pattern = getProjectionWeekPattern({
      blockPhase: "build",
      weekIndexWithinBlock: 1,
      weekStartDate: "2026-03-02",
      weekEndDate: "2026-03-08",
      goals: [{ target_date: "2026-03-14" }],
    });

    expect(pattern).toEqual({ pattern: "taper", multiplier: 0.9 });
  });

  it("applies stronger taper impact for higher-priority goals", () => {
    const highPriorityPattern = getProjectionWeekPattern({
      blockPhase: "build",
      weekIndexWithinBlock: 1,
      weekStartDate: "2026-03-02",
      weekEndDate: "2026-03-08",
      goals: [{ target_date: "2026-03-13", priority: 1 }],
    });
    const lowPriorityPattern = getProjectionWeekPattern({
      blockPhase: "build",
      weekIndexWithinBlock: 1,
      weekStartDate: "2026-03-02",
      weekEndDate: "2026-03-08",
      goals: [{ target_date: "2026-03-13", priority: 8 }],
    });

    expect(highPriorityPattern.pattern).toBe("taper");
    expect(lowPriorityPattern.pattern).toBe("taper");
    expect(highPriorityPattern.multiplier).toBeLessThan(
      lowPriorityPattern.multiplier,
    );
  });

  it("blends multi-goal taper influence using priority-aware weighting", () => {
    const highPriorityOnly = getProjectionWeekPattern({
      blockPhase: "build",
      weekIndexWithinBlock: 1,
      weekStartDate: "2026-03-02",
      weekEndDate: "2026-03-08",
      goals: [{ target_date: "2026-03-10", priority: 1 }],
    });
    const lowPriorityOnly = getProjectionWeekPattern({
      blockPhase: "build",
      weekIndexWithinBlock: 1,
      weekStartDate: "2026-03-02",
      weekEndDate: "2026-03-08",
      goals: [{ target_date: "2026-03-09", priority: 8 }],
    });
    const combined = getProjectionWeekPattern({
      blockPhase: "build",
      weekIndexWithinBlock: 1,
      weekStartDate: "2026-03-02",
      weekEndDate: "2026-03-08",
      goals: [
        { target_date: "2026-03-10", priority: 1 },
        { target_date: "2026-03-09", priority: 8 },
      ],
    });

    expect(combined.pattern).toBe("taper");
    expect(combined.multiplier).toBeGreaterThan(highPriorityOnly.multiplier);
    expect(combined.multiplier).toBeLessThan(lowPriorityOnly.multiplier);
  });
});

describe("deterministic projection goal conflict weighting", () => {
  it("reduces weekly TSS more when the conflicting high-priority goal is more urgent", () => {
    const highPriorityUrgent = buildDeterministicProjectionPayload({
      timeline: {
        start_date: "2026-03-02",
        end_date: "2026-03-08",
      },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-03-02",
          end_date: "2026-03-08",
          target_weekly_tss_range: { min: 200, max: 200 },
        },
      ],
      goals: [
        {
          id: "goal-urgent",
          name: "A race",
          target_date: "2026-03-10",
          priority: 1,
        },
        {
          id: "goal-secondary",
          name: "B race",
          target_date: "2026-03-13",
          priority: 8,
        },
      ],
      baseline_weekly_tss: 200,
      starting_ctl: 28,
      creation_config: {
        optimization_profile: "balanced",
        post_goal_recovery_days: 0,
        max_weekly_tss_ramp_pct: 20,
        max_ctl_ramp_per_week: 8,
      },
    });

    const lowPriorityUrgent = buildDeterministicProjectionPayload({
      timeline: {
        start_date: "2026-03-02",
        end_date: "2026-03-08",
      },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-03-02",
          end_date: "2026-03-08",
          target_weekly_tss_range: { min: 200, max: 200 },
        },
      ],
      goals: [
        {
          id: "goal-urgent",
          name: "A race",
          target_date: "2026-03-10",
          priority: 8,
        },
        {
          id: "goal-secondary",
          name: "B race",
          target_date: "2026-03-13",
          priority: 1,
        },
      ],
      baseline_weekly_tss: 200,
      starting_ctl: 28,
      creation_config: {
        optimization_profile: "balanced",
        post_goal_recovery_days: 0,
        max_weekly_tss_ramp_pct: 20,
        max_ctl_ramp_per_week: 8,
      },
    });

    expect(highPriorityUrgent.microcycles[0]?.planned_weekly_tss).toBeLessThan(
      lowPriorityUrgent.microcycles[0]?.planned_weekly_tss ?? 0,
    );
  });
});
