/**
 * Test utilities for readiness score testing
 *
 * Provides helper functions for creating mock goals, projection points,
 * and test scenarios for readiness calculation tests.
 */

import type { GoalTargetV2 } from "../../../schemas/training_plan_structure";
import type {
  ProjectionPointReadinessInput,
  ProjectionPointReadinessGoalInput,
} from "../readiness";

/**
 * Creates a mock projection point with CTL/ATL/TSB values
 */
export function createMockProjectionPoint(
  date: string,
  ctl: number,
  atl: number,
  tsb: number,
): ProjectionPointReadinessInput {
  return {
    date,
    predicted_fitness_ctl: ctl,
    predicted_fatigue_atl: atl,
    predicted_form_tsb: tsb,
  };
}

/**
 * Creates a mock goal with optional targets
 */
export function createMockGoal(
  targetDate: string,
  targets?: GoalTargetV2[],
  priority?: number,
): ProjectionPointReadinessGoalInput & { targets?: GoalTargetV2[] } {
  return {
    target_date: targetDate,
    priority,
    targets,
  };
}

/**
 * Creates a race_performance target for testing
 */
export function createRaceTarget(
  activityCategory: "run" | "bike" | "swim" | "other",
  distanceMeters: number,
  targetTimeSeconds: number,
): GoalTargetV2 {
  return {
    target_type: "race_performance",
    activity_category: activityCategory,
    distance_m: distanceMeters,
    target_time_s: targetTimeSeconds,
  };
}

/**
 * Creates a pace threshold test target
 */
export function createPaceThresholdTarget(
  activityCategory: "run" | "bike" | "swim" | "other",
  targetSpeedMps: number,
  testDurationSeconds: number,
): GoalTargetV2 {
  return {
    target_type: "pace_threshold",
    target_speed_mps: targetSpeedMps,
    activity_category: activityCategory,
    test_duration_s: testDurationSeconds,
  };
}

/**
 * Creates an HR threshold test target
 */
export function createHrThresholdTarget(targetLthrBpm: number): GoalTargetV2 {
  return {
    target_type: "hr_threshold",
    target_lthr_bpm: targetLthrBpm,
  };
}

/**
 * Common race distances and typical finish times
 */
export const RACE_PRESETS = {
  "5K": {
    distance: 5000,
    times: {
      fast: 1200, // 20 minutes
      moderate: 1500, // 25 minutes
      slow: 1800, // 30 minutes
    },
  },
  "10K": {
    distance: 10000,
    times: {
      fast: 2400, // 40 minutes
      moderate: 3000, // 50 minutes
      slow: 3600, // 60 minutes
    },
  },
  half_marathon: {
    distance: 21097,
    times: {
      fast: 5400, // 1:30
      moderate: 6300, // 1:45
      slow: 7200, // 2:00
    },
  },
  marathon: {
    distance: 42195,
    times: {
      fast: 10800, // 3:00
      moderate: 12600, // 3:30
      slow: 14400, // 4:00
    },
  },
  "50K": {
    distance: 50000,
    times: {
      fast: 18000, // 5:00
      moderate: 21600, // 6:00
      slow: 25200, // 7:00
    },
  },
  "100_mile": {
    distance: 160934,
    times: {
      fast: 72000, // 20:00
      moderate: 86400, // 24:00
      slow: 100800, // 28:00
    },
  },
} as const;

/**
 * Creates a test scenario with multiple projection points
 */
export function createTestScenario(config: {
  startDate: string;
  durationDays: number;
  startingCtl: number;
  startingAtl: number;
  ctlProgression?: "flat" | "ramp" | "peak";
}): ProjectionPointReadinessInput[] {
  const points: ProjectionPointReadinessInput[] = [];
  const {
    startDate,
    durationDays,
    startingCtl,
    startingAtl,
    ctlProgression = "flat",
  } = config;

  for (let day = 0; day < durationDays; day++) {
    const date = addDays(startDate, day);
    let ctl = startingCtl;
    let atl = startingAtl;

    // Apply progression pattern
    if (ctlProgression === "ramp") {
      ctl = startingCtl + (day / durationDays) * 20;
      atl = startingAtl + (day / durationDays) * 15;
    } else if (ctlProgression === "peak") {
      const progress = day / durationDays;
      const peakAt = 0.8; // Peak at 80% through timeline
      if (progress < peakAt) {
        ctl = startingCtl + (progress / peakAt) * 25;
        atl = startingAtl + (progress / peakAt) * 20;
      } else {
        // Taper
        const taperProgress = (progress - peakAt) / (1 - peakAt);
        ctl = startingCtl + 25 - taperProgress * 5;
        atl = startingAtl + 20 - taperProgress * 15;
      }
    }

    const tsb = ctl - atl;
    points.push(createMockProjectionPoint(date, ctl, atl, tsb));
  }

  return points;
}

/**
 * Helper to add days to a date string (YYYY-MM-DD format)
 */
function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split("T")[0] as string;
}

/**
 * Creates a CTL/ATL state builder for more complex scenarios
 */
export class CtlAtlStateBuilder {
  private points: ProjectionPointReadinessInput[] = [];
  private currentDate: string;
  private currentCtl: number;
  private currentAtl: number;

  constructor(startDate: string, startingCtl: number, startingAtl: number) {
    this.currentDate = startDate;
    this.currentCtl = startingCtl;
    this.currentAtl = startingAtl;
    this.addPoint();
  }

  private addPoint(): void {
    const tsb = this.currentCtl - this.currentAtl;
    this.points.push(
      createMockProjectionPoint(
        this.currentDate,
        this.currentCtl,
        this.currentAtl,
        tsb,
      ),
    );
  }

  /**
   * Advance by days with optional CTL/ATL changes
   */
  advance(days: number, ctlChange = 0, atlChange = 0): this {
    for (let i = 0; i < days; i++) {
      this.currentDate = addDays(this.currentDate, 1);
      this.currentCtl += ctlChange / days;
      this.currentAtl += atlChange / days;
      this.addPoint();
    }
    return this;
  }

  /**
   * Simulate a hard event (spike ATL)
   */
  event(atlSpike: number): this {
    this.currentAtl += atlSpike;
    this.points[this.points.length - 1] = createMockProjectionPoint(
      this.currentDate,
      this.currentCtl,
      this.currentAtl,
      this.currentCtl - this.currentAtl,
    );
    return this;
  }

  /**
   * Build and return the points array
   */
  build(): ProjectionPointReadinessInput[] {
    return this.points;
  }
}
