/**
 * Test utilities for readiness score testing
 *
 * Provides helper functions for creating mock goals, projection points,
 * and test scenarios for readiness calculation tests.
 */

import type { TrainingPlanGoalTarget } from "../../../schemas/training-plan-structure";
import type {
  ProjectionPointReadinessGoalInput,
  ProjectionPointReadinessInput,
} from "../readiness";

/**
 * Creates a mock projection point with LongTermLoad/RecentLoad/LoadBalance values
 */
export function createMockProjectionPoint(
  date: string,
  longTermLoad: number,
  recentLoad: number,
  loadBalance: number,
): ProjectionPointReadinessInput {
  return {
    date,
    predicted_fitness_longTermLoad: longTermLoad,
    predicted_fatigue_recentLoad: recentLoad,
    predicted_form_loadBalance: loadBalance,
  };
}

/**
 * Creates a mock goal with optional targets
 */
export function createMockGoal(
  targetDate: string,
  targets?: TrainingPlanGoalTarget[],
  priority?: number,
): ProjectionPointReadinessGoalInput & { targets?: TrainingPlanGoalTarget[] } {
  return {
    target_date: targetDate,
    ...(priority === undefined ? {} : { priority }),
    ...(targets === undefined ? {} : { targets }),
  };
}

/**
 * Creates a race_performance target for testing
 */
export function createRaceTarget(
  activityCategory: "run" | "bike" | "swim" | "other",
  distanceMeters: number,
  targetTimeSeconds: number,
): TrainingPlanGoalTarget {
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
): TrainingPlanGoalTarget {
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
export function createHrThresholdTarget(targetLthrBpm: number): TrainingPlanGoalTarget {
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
  startingLongTermLoad: number;
  startingRecentLoad: number;
  longTermLoadProgression?: "flat" | "ramp" | "peak";
}): ProjectionPointReadinessInput[] {
  const points: ProjectionPointReadinessInput[] = [];
  const {
    startDate,
    durationDays,
    startingLongTermLoad,
    startingRecentLoad,
    longTermLoadProgression = "flat",
  } = config;

  for (let day = 0; day < durationDays; day++) {
    const date = addDays(startDate, day);
    let longTermLoad = startingLongTermLoad;
    let recentLoad = startingRecentLoad;

    // Apply progression pattern
    if (longTermLoadProgression === "ramp") {
      longTermLoad = startingLongTermLoad + (day / durationDays) * 20;
      recentLoad = startingRecentLoad + (day / durationDays) * 15;
    } else if (longTermLoadProgression === "peak") {
      const progress = day / durationDays;
      const peakAt = 0.8; // Peak at 80% through timeline
      if (progress < peakAt) {
        longTermLoad = startingLongTermLoad + (progress / peakAt) * 25;
        recentLoad = startingRecentLoad + (progress / peakAt) * 20;
      } else {
        // Taper
        const taperProgress = (progress - peakAt) / (1 - peakAt);
        longTermLoad = startingLongTermLoad + 25 - taperProgress * 5;
        recentLoad = startingRecentLoad + 20 - taperProgress * 15;
      }
    }

    const loadBalance = longTermLoad - recentLoad;
    points.push(createMockProjectionPoint(date, longTermLoad, recentLoad, loadBalance));
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
 * Creates a LongTermLoad/RecentLoad state builder for more complex scenarios
 */
export class LongTermLoadRecentLoadStateBuilder {
  private points: ProjectionPointReadinessInput[] = [];
  private currentDate: string;
  private currentLongTermLoad: number;
  private currentRecentLoad: number;

  constructor(startDate: string, startingLongTermLoad: number, startingRecentLoad: number) {
    this.currentDate = startDate;
    this.currentLongTermLoad = startingLongTermLoad;
    this.currentRecentLoad = startingRecentLoad;
    this.addPoint();
  }

  private addPoint(): void {
    const loadBalance = this.currentLongTermLoad - this.currentRecentLoad;
    this.points.push(
      createMockProjectionPoint(
        this.currentDate,
        this.currentLongTermLoad,
        this.currentRecentLoad,
        loadBalance,
      ),
    );
  }

  /**
   * Advance by days with optional LongTermLoad/RecentLoad changes
   */
  advance(days: number, longTermLoadChange = 0, recentLoadChange = 0): this {
    for (let i = 0; i < days; i++) {
      this.currentDate = addDays(this.currentDate, 1);
      this.currentLongTermLoad += longTermLoadChange / days;
      this.currentRecentLoad += recentLoadChange / days;
      this.addPoint();
    }
    return this;
  }

  /**
   * Simulate a hard event (spike RecentLoad)
   */
  event(recentLoadSpike: number): this {
    this.currentRecentLoad += recentLoadSpike;
    this.points[this.points.length - 1] = createMockProjectionPoint(
      this.currentDate,
      this.currentLongTermLoad,
      this.currentRecentLoad,
      this.currentLongTermLoad - this.currentRecentLoad,
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
