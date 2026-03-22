import {
  type ActivityPlanStructureV2,
  type IntervalStepV2,
  type RecordingServiceActivityPlan,
} from "@repo/core";

export function expandPlanSteps(plan: RecordingServiceActivityPlan): IntervalStepV2[] {
  const structure = plan.structure as ActivityPlanStructureV2;
  const flatSteps: IntervalStepV2[] = [];

  for (const interval of structure.intervals) {
    for (let repetition = 0; repetition < interval.repetitions; repetition += 1) {
      for (const step of interval.steps) {
        flatSteps.push(step);
      }
    }
  }

  return flatSteps;
}

export class PlanManager {
  private readonly steps: IntervalStepV2[];
  public readonly selectedActivityPlan: RecordingServiceActivityPlan;
  public readonly eventId: string | undefined;

  constructor(selectedPlannedActivity: RecordingServiceActivityPlan, eventId: string | undefined) {
    this.selectedActivityPlan = selectedPlannedActivity;
    this.eventId = eventId;
    this.steps = expandPlanSteps(selectedPlannedActivity);
  }

  public clearPlannedActivity(): void {
    // Compatibility no-op. Progression now lives in planExecution.ts.
  }

  public getCurrentStep(): IntervalStepV2 | undefined {
    return this.steps[0];
  }

  public getSteps(): IntervalStepV2[] {
    return [...this.steps];
  }

  public cleanup(): void {
    // Compatibility no-op. Progression timers/listeners no longer live here.
  }
}
