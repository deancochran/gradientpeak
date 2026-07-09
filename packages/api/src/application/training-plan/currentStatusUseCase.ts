import type { TrainingPlanRow } from "@repo/db";
import type { TrainingPlanRepository } from "../../repositories";

export async function getCurrentStatusTrainingPlanUseCase(input: {
  profileId: string;
  repository: TrainingPlanRepository;
}): Promise<TrainingPlanRow | null> {
  const ownedPlans = await input.repository.listTrainingPlans({
    profileId: input.profileId,
    ownerScope: "own",
  });

  return ownedPlans[0] ?? null;
}
