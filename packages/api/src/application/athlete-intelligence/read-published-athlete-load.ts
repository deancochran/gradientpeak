import { readDailyTrainingLoadRangeResultSchema } from "../../contracts/athlete-derived-state";
import type { AthleteDerivedStateRepositoryPort } from "../../repositories/athlete-derived-state-repository-port";

export class PublishedAthleteLoadUnavailableError extends Error {}

export async function readPublishedAthleteLoad(input: {
  repository: AthleteDerivedStateRepositoryPort;
  profileId: string;
  startDate: string;
  endDate: string;
}) {
  const current = await input.repository.readPublishedDailyTrainingLoadRange(input);
  if (!current) {
    throw new PublishedAthleteLoadUnavailableError("Profile athlete state is unavailable");
  }
  return readDailyTrainingLoadRangeResultSchema.parse({
    profileId: input.profileId,
    publishedRevision: current.publishedRevision,
    days: current.days,
  });
}
