import type { InferredStateSnapshot } from "@repo/core";

export interface CreateTrainingPlanRecordInput {
  name: string;
  description: string | null;
  structure: Record<string, unknown>;
  isActive: boolean;
  profileId: string;
}

export type CreatedTrainingPlanRecord = {
  id: string;
} & Record<string, unknown>;

export interface TrainingPlanRepository {
  deactivateActivePlans(profileId: string): Promise<void>;
  createTrainingPlan(
    input: CreateTrainingPlanRecordInput,
  ): Promise<CreatedTrainingPlanRecord>;
  getPriorInferredStateSnapshot(
    profileId: string,
  ): Promise<InferredStateSnapshot | null>;
  persistInferredStateSnapshot(input: {
    profileId: string;
    inferredStateSnapshot: InferredStateSnapshot;
    trainingPlanId?: string;
  }): Promise<void>;
}
