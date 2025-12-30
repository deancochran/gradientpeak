import type {
  ActivityPlanStructureV2,
  DurationV2,
  IntensityTargetV2,
  IntervalV2,
  IntervalStepV2,
} from "./activity_plan_v2";
import { Duration } from "./duration_helpers";
import { Target } from "./target_helpers";

/**
 * Generate a UUID v4
 * Cross-platform implementation that works in Node.js, browser, and React Native
 */
function generateUUID(): string {
  // Use crypto.randomUUID if available (Node.js 16+, modern browsers)
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback: Generate UUID v4 manually
  // Template: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ==============================
// PLAN BUILDER V2
// Fluent API for building activity plans
// ==============================

/**
 * Fluent builder for creating activity plan structures
 *
 * NOTE: Works with interval-based structure.
 * All steps must be inside an interval (even single steps become intervals with repetitions=1).
 */
export class PlanBuilderV2 {
  private intervals: IntervalV2[] = [];

  /**
   * Add a single step to the plan (creates an interval with 1 step and 1 repetition)
   */
  step(config: {
    name: string;
    duration: DurationV2;
    targets?: IntensityTargetV2[];
    notes?: string;
    description?: string;
    intervalName?: string;
  }): this {
    const intervalStep: IntervalStepV2 = {
      id: generateUUID(),
      name: config.name,
      duration: config.duration,
      targets: config.targets,
      notes: config.notes,
      description: config.description,
    };

    this.intervals.push({
      id: generateUUID(),
      name: config.intervalName || config.name,
      repetitions: 1,
      steps: [intervalStep],
    });

    return this;
  }

  /**
   * Add an interval with multiple steps and repetitions
   *
   * NOTE: Repetitions are stored as metadata, NOT expanded into individual steps.
   */
  interval(config: {
    repeat: number;
    name?: string;
    steps: Array<{
      name: string;
      duration: DurationV2;
      targets?: IntensityTargetV2[];
      notes?: string;
      description?: string;
    }>;
    notes?: string;
  }): this {
    const { repeat, name, steps, notes } = config;

    const intervalSteps: IntervalStepV2[] = steps.map((step) => ({
      id: generateUUID(),
      name: step.name,
      duration: step.duration,
      targets: step.targets,
      notes: step.notes,
      description: step.description,
    }));

    this.intervals.push({
      id: generateUUID(),
      name: name || `Interval ${this.intervals.length + 1}`,
      repetitions: repeat,
      steps: intervalSteps,
      notes,
    });

    return this;
  }

  /**
   * Add a warmup interval
   */
  warmup(config: {
    name?: string;
    duration: DurationV2;
    targets?: IntensityTargetV2[];
    notes?: string;
  }): this {
    return this.step({
      name: config.name || "Warmup",
      duration: config.duration,
      targets: config.targets,
      notes: config.notes,
      intervalName: "Warmup",
    });
  }

  /**
   * Add a cooldown interval
   */
  cooldown(config: {
    name?: string;
    duration: DurationV2;
    targets?: IntensityTargetV2[];
    notes?: string;
  }): this {
    return this.step({
      name: config.name || "Cooldown",
      duration: config.duration,
      targets: config.targets,
      notes: config.notes,
      intervalName: "Cooldown",
    });
  }

  /**
   * Add a rest/recovery step
   */
  rest(config: { name?: string; duration: DurationV2; notes?: string }): this {
    return this.step({
      name: config.name || "Rest",
      duration: config.duration,
      targets: [],
      notes: config.notes,
      intervalName: "Rest",
    });
  }

  /**
   * Build the final activity plan structure
   */
  build(): ActivityPlanStructureV2 {
    if (this.intervals.length === 0) {
      throw new Error("Plan must have at least one interval");
    }

    if (this.intervals.length > 50) {
      throw new Error("Plan cannot have more than 50 intervals");
    }

    return {
      version: 2,
      intervals: this.intervals,
    };
  }

  /**
   * Get current interval count
   */
  getIntervalCount(): number {
    return this.intervals.length;
  }

  /**
   * Get total step count (intervals × steps × repetitions)
   */
  getTotalStepCount(): number {
    return this.intervals.reduce((total, interval) => {
      return total + interval.steps.length * interval.repetitions;
    }, 0);
  }

  /**
   * Clear all intervals
   */
  clear(): this {
    this.intervals = [];
    return this;
  }
}

/**
 * Create a new plan builder
 */
export function createPlan(): PlanBuilderV2 {
  return new PlanBuilderV2();
}

// ==============================
// SAMPLE PLAN TEMPLATES
// ==============================

/**
 * Create a basic tempo run plan
 */
export function createTempoRunPlan(): ActivityPlanStructureV2 {
  return createPlan()
    .warmup({
      duration: Duration.minutes(10),
      targets: [Target.ftp(65)],
    })
    .step({
      name: "Tempo",
      duration: Duration.minutes(20),
      targets: [Target.ftp(85), Target.bpm(165)],
      notes: "Maintain steady tempo pace",
    })
    .cooldown({
      duration: Duration.minutes(10),
      targets: [Target.ftp(60)],
    })
    .build();
}

/**
 * Create a VO2 max intervals plan
 */
export function createVO2MaxPlan(): ActivityPlanStructureV2 {
  return createPlan()
    .warmup({
      duration: Duration.minutes(15),
      targets: [Target.ftp(65)],
    })
    .interval({
      repeat: 5,
      name: "VO2 Max",
      steps: [
        {
          name: "Hard",
          duration: Duration.minutes(3),
          targets: [Target.ftp(110), Target.bpm(180)],
          notes: "Push hard!",
        },
        {
          name: "Recovery",
          duration: Duration.minutes(3),
          targets: [Target.ftp(55)],
          notes: "Easy spin",
        },
      ],
    })
    .cooldown({
      duration: Duration.minutes(10),
      targets: [Target.ftp(60)],
    })
    .build();
}

/**
 * Create a strength workout plan
 */
export function createStrengthPlan(): ActivityPlanStructureV2 {
  return createPlan()
    .warmup({
      duration: Duration.minutes(5),
      notes: "Dynamic stretching",
    })
    .interval({
      repeat: 3,
      name: "Squats",
      steps: [
        {
          name: "Squats",
          duration: Duration.reps(10),
          targets: [Target.rpe(7)],
        },
        {
          name: "Rest",
          duration: Duration.seconds(90),
        },
      ],
    })
    .interval({
      repeat: 3,
      name: "Bench Press",
      steps: [
        {
          name: "Bench Press",
          duration: Duration.reps(8),
          targets: [Target.rpe(8)],
        },
        {
          name: "Rest",
          duration: Duration.seconds(90),
        },
      ],
    })
    .cooldown({
      duration: Duration.minutes(5),
      notes: "Static stretching",
    })
    .build();
}

/**
 * Create a long endurance ride plan
 */
export function createEnduranceRidePlan(): ActivityPlanStructureV2 {
  return createPlan()
    .warmup({
      duration: Duration.minutes(15),
      targets: [Target.ftp(60)],
    })
    .step({
      name: "Endurance",
      duration: Duration.hours(2),
      targets: [Target.ftp(70), Target.bpm(145)],
      notes: "Stay aerobic, conversational pace",
    })
    .cooldown({
      duration: Duration.minutes(10),
      targets: [Target.ftp(55)],
    })
    .build();
}

/**
 * Create a threshold intervals plan
 */
export function createThresholdPlan(): ActivityPlanStructureV2 {
  return createPlan()
    .warmup({
      duration: Duration.minutes(15),
      targets: [Target.ftp(65)],
    })
    .interval({
      repeat: 3,
      name: "Threshold",
      steps: [
        {
          name: "Threshold",
          duration: Duration.minutes(8),
          targets: [Target.ftp(95), Target.thresholdHR(100)],
          notes: "Sustainable hard effort",
        },
        {
          name: "Recovery",
          duration: Duration.minutes(4),
          targets: [Target.ftp(55)],
        },
      ],
    })
    .cooldown({
      duration: Duration.minutes(10),
      targets: [Target.ftp(60)],
    })
    .build();
}

// Export helper functions
export { Duration, Target };
