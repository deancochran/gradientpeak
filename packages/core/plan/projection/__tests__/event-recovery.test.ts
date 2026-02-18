/**
 * Unit tests for event-recovery module
 *
 * Tests dynamic recovery profile calculation and post-event fatigue penalties.
 */

import { describe, expect, it } from "vitest";
import {
  computeEventRecoveryProfile,
  computePostEventFatiguePenalty,
  type EventRecoveryInput,
  type PostEventFatigueInput,
} from "../event-recovery";
import {
  createRaceTarget,
  createPaceThresholdTarget,
  createHrThresholdTarget,
  createMockProjectionPoint,
  RACE_PRESETS,
} from "./readiness.test-utils";

describe("computeEventRecoveryProfile - Race Performance", () => {
  it("5K race should have short recovery (2-3 days)", () => {
    const input: EventRecoveryInput = {
      target: createRaceTarget(
        "run",
        RACE_PRESETS["5K"].distance,
        RACE_PRESETS["5K"].times.moderate,
      ),
      projected_ctl_at_event: 50,
      projected_atl_at_event: 48,
    };

    const profile = computeEventRecoveryProfile(input);

    expect(profile.recovery_days_full).toBeGreaterThanOrEqual(2);
    expect(profile.recovery_days_full).toBeLessThanOrEqual(3);
    expect(profile.recovery_days_functional).toBeGreaterThanOrEqual(1);
    expect(profile.recovery_days_functional).toBeLessThanOrEqual(2);
    expect(profile.fatigue_intensity).toBeGreaterThanOrEqual(90);
    expect(profile.fatigue_intensity).toBeLessThanOrEqual(95);
  });

  it("half marathon should have medium recovery (5-7 days)", () => {
    const input: EventRecoveryInput = {
      target: createRaceTarget(
        "run",
        RACE_PRESETS.half_marathon.distance,
        RACE_PRESETS.half_marathon.times.moderate,
      ),
      projected_ctl_at_event: 50,
      projected_atl_at_event: 48,
    };

    const profile = computeEventRecoveryProfile(input);

    expect(profile.recovery_days_full).toBeGreaterThanOrEqual(5);
    expect(profile.recovery_days_full).toBeLessThanOrEqual(7);
    expect(profile.recovery_days_functional).toBeGreaterThanOrEqual(2);
    expect(profile.recovery_days_functional).toBeLessThanOrEqual(3);
    expect(profile.fatigue_intensity).toBeGreaterThanOrEqual(85);
    expect(profile.fatigue_intensity).toBeLessThanOrEqual(90);
  });

  it("marathon should have longer recovery (10-14 days)", () => {
    const input: EventRecoveryInput = {
      target: createRaceTarget(
        "run",
        RACE_PRESETS.marathon.distance,
        RACE_PRESETS.marathon.times.moderate,
      ),
      projected_ctl_at_event: 50,
      projected_atl_at_event: 48,
    };

    const profile = computeEventRecoveryProfile(input);

    expect(profile.recovery_days_full).toBeGreaterThanOrEqual(10);
    expect(profile.recovery_days_full).toBeLessThanOrEqual(14);
    expect(profile.recovery_days_functional).toBeGreaterThanOrEqual(4);
    expect(profile.recovery_days_functional).toBeLessThanOrEqual(6);
    expect(profile.fatigue_intensity).toBeGreaterThanOrEqual(80);
    expect(profile.fatigue_intensity).toBeLessThanOrEqual(85);
  });

  it("50K ultra should have extended recovery (14-18 days)", () => {
    const input: EventRecoveryInput = {
      target: createRaceTarget(
        "run",
        RACE_PRESETS["50K"].distance,
        RACE_PRESETS["50K"].times.moderate,
      ),
      projected_ctl_at_event: 50,
      projected_atl_at_event: 48,
    };

    const profile = computeEventRecoveryProfile(input);

    expect(profile.recovery_days_full).toBeGreaterThanOrEqual(14);
    expect(profile.recovery_days_full).toBeLessThanOrEqual(21);
    expect(profile.recovery_days_functional).toBeGreaterThanOrEqual(6);
    expect(profile.recovery_days_functional).toBeLessThanOrEqual(8);
    expect(profile.fatigue_intensity).toBeGreaterThanOrEqual(75);
    expect(profile.fatigue_intensity).toBeLessThanOrEqual(90);
  });

  it("100-mile ultra should have maximum recovery (21-28 days)", () => {
    const input: EventRecoveryInput = {
      target: createRaceTarget(
        "run",
        RACE_PRESETS["100_mile"].distance,
        RACE_PRESETS["100_mile"].times.moderate,
      ),
      projected_ctl_at_event: 50,
      projected_atl_at_event: 48,
    };

    const profile = computeEventRecoveryProfile(input);

    expect(profile.recovery_days_full).toBeGreaterThanOrEqual(21);
    expect(profile.recovery_days_full).toBeLessThanOrEqual(28);
    expect(profile.recovery_days_functional).toBeGreaterThanOrEqual(10);
    expect(profile.recovery_days_functional).toBeLessThanOrEqual(14);
    expect(profile.fatigue_intensity).toBeGreaterThanOrEqual(70);
    expect(profile.fatigue_intensity).toBeLessThanOrEqual(75);
  });

  it("bike events should have lower intensity than run", () => {
    const runInput: EventRecoveryInput = {
      target: createRaceTarget(
        "run",
        RACE_PRESETS.marathon.distance,
        RACE_PRESETS.marathon.times.moderate,
      ),
      projected_ctl_at_event: 50,
      projected_atl_at_event: 48,
    };

    const bikeInput: EventRecoveryInput = {
      target: createRaceTarget(
        "bike",
        RACE_PRESETS.marathon.distance,
        RACE_PRESETS.marathon.times.moderate,
      ),
      projected_ctl_at_event: 50,
      projected_atl_at_event: 48,
    };

    const runProfile = computeEventRecoveryProfile(runInput);
    const bikeProfile = computeEventRecoveryProfile(bikeInput);

    // Bike should have lower intensity (0.9x multiplier)
    expect(bikeProfile.fatigue_intensity).toBeLessThan(
      runProfile.fatigue_intensity,
    );
  });

  it("ATL spike factor should increase with duration", () => {
    const fiveKInput: EventRecoveryInput = {
      target: createRaceTarget(
        "run",
        RACE_PRESETS["5K"].distance,
        RACE_PRESETS["5K"].times.moderate,
      ),
      projected_ctl_at_event: 50,
      projected_atl_at_event: 48,
    };

    const marathonInput: EventRecoveryInput = {
      target: createRaceTarget(
        "run",
        RACE_PRESETS.marathon.distance,
        RACE_PRESETS.marathon.times.moderate,
      ),
      projected_ctl_at_event: 50,
      projected_atl_at_event: 48,
    };

    const fiveKProfile = computeEventRecoveryProfile(fiveKInput);
    const marathonProfile = computeEventRecoveryProfile(marathonInput);

    // Longer events cause bigger ATL spikes
    expect(marathonProfile.atl_spike_factor).toBeGreaterThan(
      fiveKProfile.atl_spike_factor,
    );
    expect(marathonProfile.atl_spike_factor).toBeLessThanOrEqual(2.5);
  });
});

describe("computeEventRecoveryProfile - Threshold Tests", () => {
  it("pace threshold test should have moderate recovery (3-5 days)", () => {
    const input: EventRecoveryInput = {
      target: createPaceThresholdTarget("run", 4.0, 1200), // 20-minute test
      projected_ctl_at_event: 50,
      projected_atl_at_event: 48,
    };

    const profile = computeEventRecoveryProfile(input);

    expect(profile.recovery_days_full).toBeGreaterThanOrEqual(3);
    expect(profile.recovery_days_full).toBeLessThanOrEqual(5);
    expect(profile.fatigue_intensity).toBe(75);
  });

  it("HR threshold test should have minimal recovery (3 days)", () => {
    const input: EventRecoveryInput = {
      target: createHrThresholdTarget(165),
      projected_ctl_at_event: 50,
      projected_atl_at_event: 48,
    };

    const profile = computeEventRecoveryProfile(input);

    expect(profile.recovery_days_full).toBe(3);
    expect(profile.recovery_days_functional).toBe(1);
    expect(profile.fatigue_intensity).toBe(65);
  });
});

describe("computePostEventFatiguePenalty", () => {
  it("should return 0 penalty before event", () => {
    const input: PostEventFatigueInput = {
      currentDate: "2026-03-13", // Day before event
      currentPoint: createMockProjectionPoint("2026-03-13", 65, 60, 5),
      eventGoal: {
        target_date: "2026-03-14",
        targets: [
          createRaceTarget(
            "run",
            RACE_PRESETS.marathon.distance,
            RACE_PRESETS.marathon.times.moderate,
          ),
        ],
        projected_ctl: 65,
        projected_atl: 60,
      },
    };

    const penalty = computePostEventFatiguePenalty(input);
    expect(penalty).toBe(0);
  });

  it("should return 0 penalty on event day", () => {
    const input: PostEventFatigueInput = {
      currentDate: "2026-03-14", // Event day
      currentPoint: createMockProjectionPoint("2026-03-14", 65, 60, 5),
      eventGoal: {
        target_date: "2026-03-14",
        targets: [
          createRaceTarget(
            "run",
            RACE_PRESETS.marathon.distance,
            RACE_PRESETS.marathon.times.moderate,
          ),
        ],
        projected_ctl: 65,
        projected_atl: 60,
      },
    };

    const penalty = computePostEventFatiguePenalty(input);
    expect(penalty).toBe(0);
  });

  it("should apply high penalty day 1 after marathon (35-45%)", () => {
    const input: PostEventFatigueInput = {
      currentDate: "2026-03-15", // Day after marathon
      currentPoint: createMockProjectionPoint("2026-03-15", 65, 68, -3),
      eventGoal: {
        target_date: "2026-03-14",
        targets: [
          createRaceTarget(
            "run",
            RACE_PRESETS.marathon.distance,
            RACE_PRESETS.marathon.times.moderate,
          ),
        ],
        projected_ctl: 65,
        projected_atl: 60,
      },
    };

    const penalty = computePostEventFatiguePenalty(input);
    expect(penalty).toBeGreaterThanOrEqual(35);
    expect(penalty).toBeLessThanOrEqual(45);
  });

  it("should apply moderate penalty day 3 after marathon (20-30%)", () => {
    const input: PostEventFatigueInput = {
      currentDate: "2026-03-17", // 3 days after marathon
      currentPoint: createMockProjectionPoint("2026-03-17", 65, 64, 1),
      eventGoal: {
        target_date: "2026-03-14",
        targets: [
          createRaceTarget(
            "run",
            RACE_PRESETS.marathon.distance,
            RACE_PRESETS.marathon.times.moderate,
          ),
        ],
        projected_ctl: 65,
        projected_atl: 60,
      },
    };

    const penalty = computePostEventFatiguePenalty(input);
    expect(penalty).toBeGreaterThanOrEqual(20);
    expect(penalty).toBeLessThanOrEqual(30);
  });

  it("should apply low penalty day 7 after marathon (8-12%)", () => {
    const input: PostEventFatigueInput = {
      currentDate: "2026-03-21", // 7 days after marathon
      currentPoint: createMockProjectionPoint("2026-03-21", 65, 60, 5),
      eventGoal: {
        target_date: "2026-03-14",
        targets: [
          createRaceTarget(
            "run",
            RACE_PRESETS.marathon.distance,
            RACE_PRESETS.marathon.times.moderate,
          ),
        ],
        projected_ctl: 65,
        projected_atl: 60,
      },
    };

    const penalty = computePostEventFatiguePenalty(input);
    expect(penalty).toBeGreaterThanOrEqual(8);
    expect(penalty).toBeLessThanOrEqual(13);
  });

  it("should apply minimal penalty day 14 after marathon (<5%)", () => {
    const input: PostEventFatigueInput = {
      currentDate: "2026-03-28", // 14 days after marathon
      currentPoint: createMockProjectionPoint("2026-03-28", 65, 60, 5),
      eventGoal: {
        target_date: "2026-03-14",
        targets: [
          createRaceTarget(
            "run",
            RACE_PRESETS.marathon.distance,
            RACE_PRESETS.marathon.times.moderate,
          ),
        ],
        projected_ctl: 65,
        projected_atl: 60,
      },
    };

    const penalty = computePostEventFatiguePenalty(input);
    expect(penalty).toBeLessThan(5);
  });

  it("should return 0 penalty when no targets provided", () => {
    const input: PostEventFatigueInput = {
      currentDate: "2026-03-15",
      currentPoint: createMockProjectionPoint("2026-03-15", 65, 68, -3),
      eventGoal: {
        target_date: "2026-03-14",
        targets: [],
        projected_ctl: 65,
        projected_atl: 60,
      },
    };

    const penalty = computePostEventFatiguePenalty(input);
    expect(penalty).toBe(0);
  });

  it("should increase penalty when ATL > CTL (overload)", () => {
    const normalInput: PostEventFatigueInput = {
      currentDate: "2026-03-15",
      currentPoint: createMockProjectionPoint("2026-03-15", 65, 60, 5), // ATL < CTL
      eventGoal: {
        target_date: "2026-03-14",
        targets: [
          createRaceTarget(
            "run",
            RACE_PRESETS.marathon.distance,
            RACE_PRESETS.marathon.times.moderate,
          ),
        ],
        projected_ctl: 65,
        projected_atl: 60,
      },
    };

    const overloadInput: PostEventFatigueInput = {
      currentDate: "2026-03-15",
      currentPoint: createMockProjectionPoint("2026-03-15", 65, 75, -10), // ATL > CTL
      eventGoal: {
        target_date: "2026-03-14",
        targets: [
          createRaceTarget(
            "run",
            RACE_PRESETS.marathon.distance,
            RACE_PRESETS.marathon.times.moderate,
          ),
        ],
        projected_ctl: 65,
        projected_atl: 60,
      },
    };

    const normalPenalty = computePostEventFatiguePenalty(normalInput);
    const overloadPenalty = computePostEventFatiguePenalty(overloadInput);

    // Overload should increase penalty
    expect(overloadPenalty).toBeGreaterThan(normalPenalty);
  });

  it("should cap penalty at 60%", () => {
    // Extreme scenario: very high ATL overload immediately after ultra
    const input: PostEventFatigueInput = {
      currentDate: "2026-03-15",
      currentPoint: createMockProjectionPoint("2026-03-15", 50, 100, -50), // Extreme overload
      eventGoal: {
        target_date: "2026-03-14",
        targets: [
          createRaceTarget(
            "run",
            RACE_PRESETS["100_mile"].distance,
            RACE_PRESETS["100_mile"].times.moderate,
          ),
        ],
        projected_ctl: 50,
        projected_atl: 48,
      },
    };

    const penalty = computePostEventFatiguePenalty(input);
    expect(penalty).toBeLessThanOrEqual(60);
  });

  it("penalty should decay exponentially over time", () => {
    const day1Input: PostEventFatigueInput = {
      currentDate: "2026-03-15",
      currentPoint: createMockProjectionPoint("2026-03-15", 65, 68, -3),
      eventGoal: {
        target_date: "2026-03-14",
        targets: [
          createRaceTarget(
            "run",
            RACE_PRESETS.marathon.distance,
            RACE_PRESETS.marathon.times.moderate,
          ),
        ],
        projected_ctl: 65,
        projected_atl: 60,
      },
    };

    const day3Input: PostEventFatigueInput = {
      ...day1Input,
      currentDate: "2026-03-17",
      currentPoint: createMockProjectionPoint("2026-03-17", 65, 64, 1),
    };

    const day7Input: PostEventFatigueInput = {
      ...day1Input,
      currentDate: "2026-03-21",
      currentPoint: createMockProjectionPoint("2026-03-21", 65, 60, 5),
    };

    const penalty1 = computePostEventFatiguePenalty(day1Input);
    const penalty3 = computePostEventFatiguePenalty(day3Input);
    const penalty7 = computePostEventFatiguePenalty(day7Input);

    // Should decay over time
    expect(penalty3).toBeLessThan(penalty1);
    expect(penalty7).toBeLessThan(penalty3);
  });
});

describe("Event Recovery - Edge Cases", () => {
  it("should handle very short events (< 30 minutes)", () => {
    const input: EventRecoveryInput = {
      target: createRaceTarget("run", 3000, 600), // 3K in 10 minutes
      projected_ctl_at_event: 50,
      projected_atl_at_event: 48,
    };

    const profile = computeEventRecoveryProfile(input);

    // Should still have minimum 2-day recovery
    expect(profile.recovery_days_full).toBeGreaterThanOrEqual(2);
    expect(profile.fatigue_intensity).toBeGreaterThanOrEqual(90);
  });

  it("should handle very long events (> 24 hours)", () => {
    const input: EventRecoveryInput = {
      target: createRaceTarget("run", 200000, 100800), // 200K in 28 hours
      projected_ctl_at_event: 50,
      projected_atl_at_event: 48,
    };

    const profile = computeEventRecoveryProfile(input);

    // Should cap at 28 days
    expect(profile.recovery_days_full).toBeLessThanOrEqual(28);
    expect(profile.fatigue_intensity).toBeGreaterThanOrEqual(70);
  });

  it("should be deterministic for same inputs", () => {
    const input: EventRecoveryInput = {
      target: createRaceTarget(
        "run",
        RACE_PRESETS.marathon.distance,
        RACE_PRESETS.marathon.times.moderate,
      ),
      projected_ctl_at_event: 50,
      projected_atl_at_event: 48,
    };

    const profile1 = computeEventRecoveryProfile(input);
    const profile2 = computeEventRecoveryProfile(input);

    expect(profile1).toEqual(profile2);
  });
});
