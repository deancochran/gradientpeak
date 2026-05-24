import type { InferredStateSnapshot } from "@repo/core";
import type { TrainingPlanInsert, TrainingPlanRow } from "@repo/db";

export type TrainingPlanOwnerScope = "own" | "system" | "public" | "all";

export type TrainingPlanTemplateListFilters = {
  experience_level?: "beginner" | "intermediate" | "advanced";
  max_sessions_per_week?: number;
  max_weeks?: number;
  min_sessions_per_week?: number;
  min_weeks?: number;
  search?: string;
  sort_by?:
    | "newest"
    | "oldest"
    | "duration_desc"
    | "duration_asc"
    | "sessions_desc"
    | "sessions_asc";
  sport?: string;
};

export interface ActiveTrainingPlanLookup {
  nextEventAt: string;
  scheduleBatchId: string | null;
  trainingPlan: TrainingPlanRow;
  trainingPlanId: string;
  userTrainingPlanId: string | null;
}

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
  countOwnedTrainingPlans(profileId: string): Promise<number>;
  createTrainingPlan(input: CreateTrainingPlanRecordInput): Promise<TrainingPlanRow>;
  getAccessibleTrainingPlan(input: {
    id: string;
    profileId: string;
  }): Promise<TrainingPlanRow | null>;
  getActivePlanFromFutureEvents(profileId: string): Promise<ActiveTrainingPlanLookup | null>;
  getOwnedTrainingPlan(input: { id: string; profileId: string }): Promise<TrainingPlanRow | null>;
  getPublicTemplateTrainingPlan(id: string): Promise<TrainingPlanRow | null>;
  hasTrainingPlanLike(input: { planId: string; profileId: string }): Promise<boolean>;
  listPublicTemplateTrainingPlans(
    filters?: TrainingPlanTemplateListFilters,
  ): Promise<TrainingPlanRow[]>;
  listTrainingPlanLikedIds(input: { planIds: string[]; profileId: string }): Promise<string[]>;
  listTrainingPlans(input: {
    ownerScope: TrainingPlanOwnerScope;
    profileId: string;
    visibility?: "private" | "public";
  }): Promise<TrainingPlanRow[]>;
  updateTrainingPlan(input: UpdateTrainingPlanRecordInput): Promise<TrainingPlanRow>;
  getPriorInferredStateSnapshot(profileId: string): Promise<InferredStateSnapshot | null>;
  persistInferredStateSnapshot(input: {
    profileId: string;
    inferredStateSnapshot: InferredStateSnapshot;
    trainingPlanId?: string;
  }): Promise<void>;
}
