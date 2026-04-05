import type { InferredStateSnapshot } from "@repo/core";
import type { TrainingPlanInsert, TrainingPlanRow } from "@repo/db";

export interface CreateTrainingPlanRecordInput
  extends Pick<TrainingPlanInsert, "description" | "name" | "structure"> {
  profileId: string;
}

export interface UpdateTrainingPlanRecordInput
  extends Pick<TrainingPlanInsert, "description" | "name" | "structure"> {
  id: string;
  profileId: string;
}

export interface TrainingPlanRepository {
  createTrainingPlan(input: CreateTrainingPlanRecordInput): Promise<TrainingPlanRow>;
  getOwnedTrainingPlan(input: { id: string; profileId: string }): Promise<TrainingPlanRow | null>;
  updateTrainingPlan(input: UpdateTrainingPlanRecordInput): Promise<TrainingPlanRow>;
  getPriorInferredStateSnapshot(profileId: string): Promise<InferredStateSnapshot | null>;
  persistInferredStateSnapshot(input: {
    profileId: string;
    inferredStateSnapshot: InferredStateSnapshot;
    trainingPlanId?: string;
  }): Promise<void>;
}
