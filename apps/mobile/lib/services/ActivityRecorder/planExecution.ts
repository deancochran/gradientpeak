import { type IntervalStepV2, type RecordingServiceActivityPlan } from "@repo/core";
import { PlanManager } from "./plan";

export interface PlanExecutionProgress {
  movingTime: number;
  duration: number;
  progress: number;
  requiresManualAdvance: boolean;
  canAdvance: boolean;
}

export interface PlanExecutionStepInfo {
  index: number;
  total: number;
  current: IntervalStepV2 | undefined;
  progress: PlanExecutionProgress | null;
  isLast: boolean;
  isFinished: boolean;
}

export class PlanExecution {
  private steps: IntervalStepV2[] = [];
  private stepIndex = 0;
  private stepStartMovingTime = 0;

  public loadPlan(plan: RecordingServiceActivityPlan, eventId?: string): void {
    const planManager = new PlanManager(plan, eventId);
    this.steps = planManager.getSteps();
    this.stepIndex = 0;
    this.stepStartMovingTime = 0;
  }

  public clear(): void {
    this.steps = [];
    this.stepIndex = 0;
    this.stepStartMovingTime = 0;
  }

  public resetForRecordingStart(currentMovingTime = 0): void {
    this.stepStartMovingTime = currentMovingTime;
  }

  public getStepCount(): number {
    return this.steps.length;
  }

  public getCurrentStep(): IntervalStepV2 | undefined {
    return this.steps[this.stepIndex];
  }

  public getNextStep(): IntervalStepV2 | undefined {
    return this.steps[this.stepIndex + 1];
  }

  public getAllSteps(): IntervalStepV2[] {
    return this.steps;
  }

  public getStepIndex(): number {
    return this.stepIndex;
  }

  public isFinished(): boolean {
    return this.steps.length > 0 && this.stepIndex >= this.steps.length;
  }

  public hasManualAdvanceSteps(): boolean {
    return this.steps.some((step) => step.duration.type === "untilFinished");
  }

  public getStepProgress(currentMovingTime: number): PlanExecutionProgress | null {
    const step = this.getCurrentStep();
    if (!step) {
      return null;
    }

    const movingTime = currentMovingTime - this.stepStartMovingTime;

    let durationMs = 0;
    let requiresManualAdvance = false;

    if (step.duration.type === "untilFinished") {
      requiresManualAdvance = true;
    } else if (step.duration.type === "time") {
      durationMs = step.duration.seconds * 1000;
    } else if (step.duration.type === "distance") {
      const estimatedSpeedMPS = 5;
      durationMs = (step.duration.meters / estimatedSpeedMPS) * 1000;
    } else if (step.duration.type === "repetitions") {
      requiresManualAdvance = true;
    }

    if (requiresManualAdvance) {
      return {
        movingTime,
        duration: 0,
        progress: 0,
        requiresManualAdvance: true,
        canAdvance: this.stepIndex < this.steps.length - 1,
      };
    }

    const progress = durationMs > 0 ? Math.min(1, movingTime / durationMs) : 0;

    return {
      movingTime,
      duration: durationMs,
      progress,
      requiresManualAdvance: false,
      canAdvance: progress >= 1 && this.stepIndex < this.steps.length - 1,
    };
  }

  public getStepInfo(currentMovingTime: number): PlanExecutionStepInfo {
    const current = this.getCurrentStep();

    return {
      index: this.stepIndex,
      total: this.steps.length,
      current,
      progress: current ? this.getStepProgress(currentMovingTime) : null,
      isLast: this.stepIndex >= this.steps.length - 1,
      isFinished: this.isFinished(),
    };
  }

  public getPlanTimeRemaining(currentMovingTime: number): number {
    if (this.isFinished() || !this.getCurrentStep()) {
      return 0;
    }

    let totalRemainingMs = 0;
    const currentStepProgress = this.getStepProgress(currentMovingTime);
    if (currentStepProgress && !currentStepProgress.requiresManualAdvance) {
      totalRemainingMs += Math.max(
        0,
        currentStepProgress.duration - currentStepProgress.movingTime,
      );
    }

    for (let i = this.stepIndex + 1; i < this.steps.length; i++) {
      const step = this.steps[i];
      if (step.duration.type === "untilFinished" || step.duration.type === "repetitions") {
        return 0;
      }
      if (step.duration.type === "time") {
        totalRemainingMs += step.duration.seconds * 1000;
      } else if (step.duration.type === "distance") {
        const estimatedSpeedMPS = 5;
        totalRemainingMs += (step.duration.meters / estimatedSpeedMPS) * 1000;
      }
    }

    return totalRemainingMs;
  }

  public advance(currentMovingTime: number): boolean {
    const progress = this.getStepProgress(currentMovingTime);
    if (!progress?.canAdvance) {
      return false;
    }

    return this.goToStep(this.stepIndex + 1, currentMovingTime);
  }

  public skip(currentMovingTime: number): boolean {
    if (this.stepIndex >= this.steps.length - 1) {
      return false;
    }

    return this.goToStep(this.stepIndex + 1, currentMovingTime);
  }

  public previous(currentMovingTime: number): boolean {
    if (this.stepIndex <= 0) {
      return false;
    }

    return this.goToStep(this.stepIndex - 1, currentMovingTime);
  }

  public goToStep(index: number, currentMovingTime: number): boolean {
    if (!Number.isInteger(index) || index < 0 || index >= this.steps.length) {
      return false;
    }

    this.stepIndex = index;
    this.stepStartMovingTime = currentMovingTime;
    return true;
  }
}
