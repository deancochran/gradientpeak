import type { getRequiredDb } from "../../db";
import {
  type AthleteIntelligenceDataSource,
  createDrizzleAthleteIntelligenceDataSource,
  materializeAthleteIntelligenceModelInput,
} from "./model-reader";
import { projectAthleteIntelligence } from "./projection-orchestrator";

/**
 * Builds the canonical athlete-intelligence projection from one bounded profile snapshot.
 */
export async function evaluateAthleteIntelligence(input: {
  db: ReturnType<typeof getRequiredDb>;
  profileId: string;
  goalId: string;
  now?: Date;
  planningTimezone?: string;
  dataSource?: AthleteIntelligenceDataSource;
}) {
  const asOf = input.now ?? new Date();
  const dataSource = input.dataSource ?? createDrizzleAthleteIntelligenceDataSource(input.db);
  return projectAthleteIntelligence({
    profileId: input.profileId,
    goalId: input.goalId,
    asOf,
    planningTimezone: input.planningTimezone,
    modelReader: {
      read: ({ profileId, goalId, asOf: snapshotAt }) =>
        materializeAthleteIntelligenceModelInput({
          dataSource,
          profileId,
          goalId,
          asOf: snapshotAt,
        }),
    },
  });
}
