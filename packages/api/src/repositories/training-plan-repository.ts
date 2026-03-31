import type { InferredStateSnapshot } from "@repo/core";

export interface CreateTrainingPlanRecordInput {
  name: string;
  description: string | null;
  structure: Record<string, unknown>;
  profileId: string;
}

export type CreatedTrainingPlanRecord = {
  id: string;
} & Record<string, unknown>;

export interface TrainingPlanRepository {
  createTrainingPlan(input: CreateTrainingPlanRecordInput): Promise<CreatedTrainingPlanRecord>;
  getPriorInferredStateSnapshot(profileId: string): Promise<InferredStateSnapshot | null>;
  persistInferredStateSnapshot(input: {
    profileId: string;
    inferredStateSnapshot: InferredStateSnapshot;
    trainingPlanId?: string;
  }): Promise<void>;
}
