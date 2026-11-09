import type { AthletePerformanceTargetFacts } from "@repo/core";
import type { DrizzleDbClient } from "@repo/db";
import type { DrizzleTransactionClient } from "../../../db";

/**
 * Planned-session delivery is frozen at scheduling time. Athlete-target changes must never
 * rewrite queued or delivered provider payloads; future sessions resolve under new evidence.
 */
export async function enqueueWahooRelativeTargetRefreshes(_input: {
  afterTargetFacts: AthletePerformanceTargetFacts;
  beforeTargetFacts: AthletePerformanceTargetFacts;
  db: DrizzleDbClient;
  now: Date;
  profileId: string;
  transaction: DrizzleTransactionClient;
}) {
  return { candidateCount: 0, queuedCount: 0 };
}
