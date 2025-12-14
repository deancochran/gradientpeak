import {
  ActivityPlanStructureV2,
  getDurationSeconds,
  PlanStepV2,
  RecordingServiceActivityPlan,
} from "@repo/core";
import { EventEmitter } from "expo";

export interface PlannedActivityProgress {
  state: "not_started" | "in_progress" | "finished";
  currentStepIndex: number;
  completedSteps: number;
  totalSteps: number;
  elapsedInStep: number;
  duration?: number;
  targets?: PlanStepV2["targets"];
}

// Define event types for PlanManager
interface PlanManagerEvents {
  planStarted: (progress: PlannedActivityProgress) => void;
  planFinished: (progress: PlannedActivityProgress) => void;
  stepAdvanced: (data: {
    from: number;
    to: number;
    progress: PlannedActivityProgress;
  }) => void;
  planProgressUpdate: (progress: PlannedActivityProgress) => void;
  [key: string]: (...args: any[]) => void; // Index signature for EventsMap
}

export class PlanManager extends EventEmitter<PlanManagerEvents> {
  private steps: PlanStepV2[] = [];
  public planProgress?: PlannedActivityProgress;
  public selectedActivityPlan: RecordingServiceActivityPlan;
  public plannedActivityId: string | undefined;
  private isAdvancing = false;
  private advanceTimeout?: number;
  public lastUpdateTime?: number;

  constructor(
    selectedPlannedActivity: RecordingServiceActivityPlan,
    plannedActivityId: string | undefined,
  ) {
    super();
    this.selectedActivityPlan = selectedPlannedActivity;

    // V2 structure - steps are already flat
    const structure =
      selectedPlannedActivity.structure as ActivityPlanStructureV2;
    this.steps = structure.steps;

    this.plannedActivityId = plannedActivityId;

    this.planProgress = {
      state: "not_started",
      currentStepIndex: 0,
      completedSteps: 0,
      totalSteps: this.steps.length,
      elapsedInStep: 0,
      targets: undefined,
    };
  }

  public clearPlannedActivity() {
    this.steps = [];
    this.planProgress = undefined;
  }

  /**
   * Start the plan by moving to the first step
   */
  public start() {
    if (!this.planProgress) {
      console.warn("Cannot start plan: no plan progress");
      return;
    }

    if (this.planProgress.state !== "not_started") {
      console.warn("Plan already started");
      return;
    }

    console.log("Starting plan, moving to first step");
    this.lastUpdateTime = Date.now();
    this.moveToStep(0);
    this.emit("planStarted", this.planProgress);
  }

  public async advanceStep(): Promise<boolean> {
    if (this.isAdvancing || !this.planProgress) {
      console.log("Step advancement already in progress or no plan progress");
      return false;
    }

    this.isAdvancing = true;

    try {
      // Clear any pending advance operations
      if (this.advanceTimeout) {
        clearTimeout(this.advanceTimeout);
      }

      const oldIndex = this.planProgress.currentStepIndex;

      this.planProgress = {
        ...this.planProgress,
        completedSteps: this.planProgress.completedSteps + 1,
        currentStepIndex: this.planProgress.currentStepIndex + 1,
      };

      const nextStep = this.steps[this.planProgress.currentStepIndex];
      if (!nextStep) {
        this.planProgress = { ...this.planProgress, state: "finished" };
        this.emit("planFinished", this.planProgress);
        return true;
      }

      this.moveToStep(this.planProgress.currentStepIndex);
      this.emit("stepAdvanced", {
        from: oldIndex,
        to: this.planProgress.currentStepIndex,
        progress: this.planProgress,
      });

      return true;
    } finally {
      // Reset advancing state after a delay to prevent rapid clicking
      this.advanceTimeout = setTimeout(() => {
        this.isAdvancing = false;
      }, 500);
    }
  }

  public isCurrentlyAdvancing(): boolean {
    return this.isAdvancing;
  }

  public updatePlanProgress(deltaMs: number) {
    if (!this.planProgress || this.planProgress.state !== "in_progress") return;

    const step = this.steps[this.planProgress.currentStepIndex];
    if (!step) return;

    // Handle "untilFinished" duration
    if (step.duration.type === "untilFinished") {
      return;
    }

    this.planProgress = {
      ...this.planProgress,
      elapsedInStep: this.planProgress.elapsedInStep + deltaMs,
    };

    // Emit progress update so UI can track step time
    this.emit("planProgressUpdate", this.planProgress);

    if (
      this.planProgress.duration &&
      this.planProgress.elapsedInStep >= this.planProgress.duration
    ) {
      this.advanceStep();
    }
  }

  private moveToStep(index: number) {
    const step = this.steps[index];
    if (!step || !this.planProgress) return;

    console.log(`Moving to step ${index}:`, {
      name: step.name,
      duration: step.duration,
      targets: step.targets,
    });

    // Calculate duration in milliseconds
    let durationMs: number | undefined;
    if (step.duration.type !== "untilFinished") {
      durationMs = getDurationSeconds(step.duration) * 1000;
    }

    this.planProgress = {
      ...this.planProgress,
      state: "in_progress",
      currentStepIndex: index,
      elapsedInStep: 0,
      targets: step.targets,
      duration: durationMs,
    };

    // Reset last update time for accurate delta calculation
    this.lastUpdateTime = Date.now();

    // Emit plan progress update
    this.emit("planProgressUpdate", this.planProgress);
  }

  public getCurrentStep(): PlanStepV2 | undefined {
    if (!this.planProgress) return undefined;
    return this.steps[this.planProgress.currentStepIndex];
  }

  public getProgress(): PlannedActivityProgress | undefined {
    return this.planProgress;
  }

  public cleanup() {
    if (this.advanceTimeout) {
      clearTimeout(this.advanceTimeout);
    }

    // Remove all listeners for each event type
    this.removeAllListeners("planStarted");
    this.removeAllListeners("planFinished");
    this.removeAllListeners("stepAdvanced");
    this.removeAllListeners("planProgressUpdate");
  }
}
