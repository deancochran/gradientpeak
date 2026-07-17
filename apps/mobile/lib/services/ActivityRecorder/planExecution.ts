import {
  type CompiledRecordingPlan,
  compileRecordingPlan,
  type RecordingActivityPlanV3Input,
  type RecordingPlanOccurrence,
} from "./plan";

export interface PlanExecutionProgress {
  movingTime: number;
  duration: number;
  progress: number;
  requiresManualAdvance: boolean;
  canAutoAdvance: boolean;
  canManualAdvance: boolean;
  /** User-facing advance eligibility; aliases canManualAdvance. */
  canAdvance: boolean;
}

export interface PlanExecutionStepInfo {
  index: number;
  total: number;
  current: RecordingPlanOccurrence | undefined;
  next: RecordingPlanOccurrence | undefined;
  progress: PlanExecutionProgress | null;
  isLast: boolean;
  isFinished: boolean;
}

export class PlanExecution {
  private compiledPlan: CompiledRecordingPlan | null = null;
  private occurrenceIndex = 0;
  private occurrenceStartMovingTime = 0;
  private occurrenceStartDistanceMeters = 0;

  public loadPlan(plan: RecordingActivityPlanV3Input): void {
    this.compiledPlan = compileRecordingPlan(plan);
    this.occurrenceIndex = 0;
    this.occurrenceStartMovingTime = 0;
    this.occurrenceStartDistanceMeters = 0;
  }

  public clear(): void {
    this.compiledPlan = null;
    this.occurrenceIndex = 0;
    this.occurrenceStartMovingTime = 0;
    this.occurrenceStartDistanceMeters = 0;
  }

  public resetForRecordingStart(currentMovingTime = 0, currentDistanceMeters = 0): void {
    this.occurrenceStartMovingTime = currentMovingTime;
    this.occurrenceStartDistanceMeters = currentDistanceMeters;
  }

  public getCompiledPlan(): CompiledRecordingPlan | null {
    return this.compiledPlan;
  }

  public getStepCount(): number {
    return this.compiledPlan?.occurrences.length ?? 0;
  }

  public getCurrentStep(): RecordingPlanOccurrence | undefined {
    return this.compiledPlan?.occurrences[this.occurrenceIndex];
  }

  public getNextStep(): RecordingPlanOccurrence | undefined {
    return this.compiledPlan?.occurrences[this.occurrenceIndex + 1];
  }

  public getAllSteps(): RecordingPlanOccurrence[] {
    return [...(this.compiledPlan?.occurrences ?? [])];
  }

  public getStepIndex(): number {
    return this.occurrenceIndex;
  }

  public isFinished(): boolean {
    return this.getStepCount() > 0 && this.occurrenceIndex >= this.getStepCount();
  }

  public hasManualAdvanceSteps(): boolean {
    return this.getAllSteps().some(
      (occurrence) =>
        occurrence.duration.type === "untilFinished" || occurrence.duration.type === "repetitions",
    );
  }

  public getStepProgress(
    currentMovingTime: number,
    currentDistanceMeters = this.occurrenceStartDistanceMeters,
  ): PlanExecutionProgress | null {
    const occurrence = this.getCurrentStep();
    if (!occurrence) return null;

    const movingTime = Math.max(0, currentMovingTime - this.occurrenceStartMovingTime);
    const distance = Math.max(0, currentDistanceMeters - this.occurrenceStartDistanceMeters);
    const requiresManualAdvance =
      occurrence.duration.type === "untilFinished" || occurrence.duration.type === "repetitions";
    const progress =
      occurrence.duration.type === "time"
        ? Math.min(1, movingTime / (occurrence.duration.seconds * 1000))
        : occurrence.duration.type === "distance"
          ? Math.min(1, distance / occurrence.duration.meters)
          : 0;
    const duration = occurrence.duration.type === "time" ? occurrence.duration.seconds * 1000 : 0;

    const canAutoAdvance = !requiresManualAdvance && progress >= 1;
    const canManualAdvance = requiresManualAdvance || canAutoAdvance;
    return {
      movingTime,
      duration,
      progress,
      requiresManualAdvance,
      canAutoAdvance,
      canManualAdvance,
      canAdvance: canManualAdvance,
    };
  }

  public getStepInfo(currentMovingTime: number, currentDistanceMeters = 0): PlanExecutionStepInfo {
    const current = this.getCurrentStep();
    return {
      index: this.occurrenceIndex,
      total: this.getStepCount(),
      current,
      next: this.getNextStep(),
      progress: current ? this.getStepProgress(currentMovingTime, currentDistanceMeters) : null,
      isLast: this.occurrenceIndex >= this.getStepCount() - 1,
      isFinished: this.isFinished(),
    };
  }

  public getPlanTimeRemaining(currentMovingTime: number, currentDistanceMeters = 0): number {
    if (this.isFinished() || !this.getCurrentStep()) return 0;
    const currentProgress = this.getStepProgress(currentMovingTime, currentDistanceMeters);
    if (!currentProgress || currentProgress.requiresManualAdvance) return 0;
    let remaining = Math.max(0, currentProgress.duration - currentProgress.movingTime);
    for (const occurrence of this.getAllSteps().slice(this.occurrenceIndex + 1)) {
      if (occurrence.duration.type !== "time") return 0;
      remaining += occurrence.duration.seconds * 1000;
    }
    return remaining;
  }

  public advance(
    currentMovingTime: number,
    currentDistanceMeters = 0,
    origin: "automatic" | "manual" = "automatic",
  ): boolean {
    const progress = this.getStepProgress(currentMovingTime, currentDistanceMeters);
    const eligible = origin === "manual" ? progress?.canManualAdvance : progress?.canAutoAdvance;
    if (!eligible) return false;
    const nextIndex = this.occurrenceIndex + 1;
    if (nextIndex === this.getStepCount()) {
      this.occurrenceIndex = nextIndex;
      this.occurrenceStartMovingTime = currentMovingTime;
      this.occurrenceStartDistanceMeters = currentDistanceMeters;
      return true;
    }
    return this.goToStep(nextIndex, currentMovingTime, currentDistanceMeters);
  }

  public skip(currentMovingTime: number, currentDistanceMeters = 0): boolean {
    return this.goToStep(this.occurrenceIndex + 1, currentMovingTime, currentDistanceMeters);
  }

  public previous(currentMovingTime: number, currentDistanceMeters = 0): boolean {
    return this.goToStep(this.occurrenceIndex - 1, currentMovingTime, currentDistanceMeters);
  }

  public goToStep(index: number, currentMovingTime: number, currentDistanceMeters = 0): boolean {
    if (!Number.isInteger(index) || index < 0 || index >= this.getStepCount()) return false;
    this.occurrenceIndex = index;
    this.occurrenceStartMovingTime = currentMovingTime;
    this.occurrenceStartDistanceMeters = currentDistanceMeters;
    return true;
  }

  public restoreOccurrence(
    occurrenceId: string | null,
    movingTime: number,
    distanceMeters: number,
  ): void {
    if (occurrenceId === null && this.getStepCount() > 0) {
      this.occurrenceIndex = this.getStepCount();
      return;
    }
    const index = this.getAllSteps().findIndex((item) => item.occurrenceId === occurrenceId);
    if (index < 0) throw new Error("Checkpoint occurrence does not exist in the compiled plan");
    this.goToStep(index, movingTime, distanceMeters);
  }

  public completeForFinalization(): void {
    if (this.getCurrentStep()) this.occurrenceIndex += 1;
  }
}
