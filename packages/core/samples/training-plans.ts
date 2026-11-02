import type { TrainingPlan } from "../schemas";

/** Public shape retained for consumers that accept system-plan definitions. */
export type SystemTrainingPlanTemplate = {
  id: string;
  name: string;
  description: string;
  sessions_per_week_target: number;
  duration_hours: number;
  structure: TrainingPlan;
};

/**
 * Built-in training plans are no longer shipped. This intentionally does not
 * affect persisted athlete-created plans, which are resolved from storage.
 */
export const ALL_SAMPLE_PLANS: SystemTrainingPlanTemplate[] = [];
