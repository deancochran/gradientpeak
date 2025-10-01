import {
  ActivityPlanStructure,
  Duration,
  PublicActivityPlansRow,
  PublicPlannedActivitiesRow,
  Step,
  StepOrRepetition,
} from "@repo/core";

export interface FlattenedStep extends Step {
  index: number;
  fromRepetition?: number;
}

export interface PlannedActivityProgress {
  state: "not_started" | "in_progress" | "finished";
  currentStepIndex: number;
  completedSteps: number;
  totalSteps: number;
  elapsedInStep: number;
  duration?: number;
  targets?: Step["targets"];
}

export class PlanManager {
  private flattenedSteps: FlattenedStep[] = [];
  public planProgress?: PlannedActivityProgress;
  public selectedPlannedActivity: PublicPlannedActivitiesRow & {
    activity_plan: PublicActivityPlansRow;
  };

  constructor(
    selectedPlannedActivity: PublicPlannedActivitiesRow & {
      activity_plan: PublicActivityPlansRow;
    },
  ) {
    this.selectedPlannedActivity = selectedPlannedActivity;
    this.flattenedSteps = this.flattenSteps(
      (selectedPlannedActivity.activity_plan.structure as ActivityPlanStructure)
        .steps,
    );

    this.planProgress = {
      state: "not_started",
      currentStepIndex: 0,
      completedSteps: 0,
      totalSteps: this.flattenedSteps.length,
      elapsedInStep: 0,
      targets: undefined,
    };
  }

  public clearPlannedActivity() {
    this.flattenedSteps = [];
    this.planProgress = undefined;
  }

  public advanceStep() {
    if (!this.planProgress) return;

    this.planProgress = {
      ...this.planProgress,
      completedSteps: this.planProgress.completedSteps + 1,
      currentStepIndex: this.planProgress.currentStepIndex + 1,
    };

    const nextStep = this.flattenedSteps[this.planProgress.currentStepIndex];
    if (!nextStep) {
      this.planProgress = {
        ...this.planProgress,
        state: "finished",
      };
      return;
    }

    this.moveToStep(this.planProgress.currentStepIndex);
  }

  public updatePlanProgress(deltaMs: number) {
    if (!this.planProgress || this.planProgress.state !== "in_progress") return;

    const step = this.flattenedSteps[this.planProgress.currentStepIndex];
    if (!step) return;
    if (step.duration === "untilFinished") return;

    this.planProgress = {
      ...this.planProgress,
      elapsedInStep: this.planProgress.elapsedInStep + deltaMs,
    };

    if (
      this.planProgress.duration &&
      this.planProgress.elapsedInStep >= this.planProgress.duration
    ) {
      this.advanceStep();
    }
  }

  private moveToStep(index: number) {
    const step = this.flattenedSteps[index];
    if (!step || !this.planProgress) return;

    this.planProgress = {
      ...this.planProgress,
      state: "in_progress",
      currentStepIndex: index,
      elapsedInStep: 0,
      targets: step.targets,
      duration:
        step.duration && step.duration !== "untilFinished"
          ? this.getDurationMs(step.duration)
          : undefined,
    };
  }

  private flattenSteps(
    steps: StepOrRepetition[],
    parentRep: number | null = null,
    acc: FlattenedStep[] = [],
  ): FlattenedStep[] {
    for (const step of steps) {
      if (step.type === "step") {
        acc.push({
          ...step,
          index: acc.length,
          fromRepetition: parentRep ?? undefined,
        });
      } else if (step.type === "repetition") {
        for (let i = 0; i < step.repeat; i++) {
          this.flattenSteps(step.steps, i, acc);
        }
      }
    }
    return acc;
  }

  private getDurationMs(duration: Duration): number | undefined {
    if (duration === "untilFinished") return undefined;
    switch (duration.unit) {
      case "seconds":
        return duration.value * 1000;
      case "minutes":
        return duration.value * 60 * 1000;
      default:
        return undefined;
    }
  }

  public getCurrentStep(): FlattenedStep | undefined {
    if (!this.planProgress) return undefined;
    return this.flattenedSteps[this.planProgress.currentStepIndex];
  }

  public getProgress(): PlannedActivityProgress | undefined {
    return this.planProgress;
  }
}
