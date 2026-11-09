import { dailyTrainingLoadSchema } from "@repo/core/athlete-derived-state";
import type {
  AthleteDailyPublicationState,
  AthleteDerivedStateRepositoryPort,
} from "../../repositories/athlete-derived-state-repository-port";

export async function publishAthleteDailyLoad(input: {
  repository: AthleteDerivedStateRepositoryPort;
  profileId: string;
  fromPlanningDate: string;
  expectedPublishedRevision: number;
  targetPublishedRevision: number;
  claimToken?: string;
  days: Array<Parameters<typeof dailyTrainingLoadSchema.parse>[0]>;
  state: AthleteDailyPublicationState;
}) {
  const days = input.days.map((day) => dailyTrainingLoadSchema.parse(day));
  if (
    days.some(
      (day) =>
        day.profileId !== input.profileId || day.sourceRevision !== input.targetPublishedRevision,
    )
  ) {
    throw new Error("Daily-load publication owner or revision mismatch");
  }
  return input.repository.publishDailyTrainingLoad({
    profileId: input.profileId,
    fromPlanningDate: input.fromPlanningDate,
    expectedPublishedRevision: input.expectedPublishedRevision,
    targetPublishedRevision: input.targetPublishedRevision,
    ...(input.claimToken === undefined ? {} : { claimToken: input.claimToken }),
    days,
    state: input.state,
  });
}
