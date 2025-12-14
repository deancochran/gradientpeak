import type {
  ActivityPlanStructureV2,
  DurationV2,
  IntensityTargetV2,
  PlanStepV2,
} from "./activity_plan_v2";
import { Duration } from "./duration_helpers";
import { Target } from "./target_helpers";

// ==============================
// PLAN BUILDER V2
// Fluent API for building activity plans
// ==============================

/**
 * Fluent builder for creating activity plan structures
 *
 * NOTE: Repetitions are expanded at creation time.
 * The builder handles the expansion, creating individual steps with metadata.
 */
export class PlanBuilderV2 {
  private steps: PlanStepV2[] = [];

  /**
   * Add a single step to the plan
   */
  step(config: {
    name: string;
    duration: DurationV2;
    targets?: IntensityTargetV2[];
    notes?: string;
    description?: string;
    segmentName?: string;
  }): this {
    this.steps.push({
      name: config.name,
      duration: config.duration,
      targets: config.targets,
      notes: config.notes,
      description: config.description,
      segmentName: config.segmentName,
    });
    return this;
  }

  /**
   * Add an interval (repetition expanded into individual steps)
   *
   * NOTE: This expands repetitions at creation time.
   * Each repetition becomes individual steps with originalRepetitionCount metadata.
   */
  interval(config: {
    repeat: number;
    segmentName?: string;
    steps: Array<{
      name: string;
      duration: DurationV2;
      targets?: IntensityTargetV2[];
      notes?: string;
      description?: string;
    }>;
  }): this {
    const { repeat, segmentName, steps } = config;

    // Expand repetitions into individual steps
    for (let i = 0; i < repeat; i++) {
      for (let j = 0; j < steps.length; j++) {
        const step = steps[j];
        if (!step) continue;

        this.steps.push({
          name: step.name,
          duration: step.duration,
          targets: step.targets,
          notes: step.notes,
          description: step.description,
          segmentName: segmentName || `Interval ${i + 1}`,
          segmentIndex: i,
          originalRepetitionCount: repeat,
        });
      }
    }

    return this;
  }

  /**
   * Add a warmup segment
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
      segmentName: "Warmup",
    });
  }

  /**
   * Add a cooldown segment
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
      segmentName: "Cooldown",
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
    });
  }

  /**
   * Build the final activity plan structure
   */
  build(): ActivityPlanStructureV2 {
    if (this.steps.length === 0) {
      throw new Error("Plan must have at least one step");
    }

    if (this.steps.length > 200) {
      throw new Error("Plan cannot have more than 200 steps");
    }

    return {
      version: 2,
      steps: this.steps,
    };
  }

  /**
   * Get current step count
   */
  getStepCount(): number {
    return this.steps.length;
  }

  /**
   * Clear all steps
   */
  clear(): this {
    this.steps = [];
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
      segmentName: "VO2 Max",
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
      segmentName: "Squats",
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
      segmentName: "Bench Press",
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
      segmentName: "Threshold",
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
