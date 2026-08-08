import type { AthletePerformanceTargetFacts } from "@repo/core";
import { activityPlanStructureSchema } from "@repo/core";
import type { DrizzleDbClient } from "@repo/db";
import type { DrizzleTransactionClient } from "../../../db";
import { hasWahooPlannedActivityScopes } from "../../integrations/wahoo/planned-activity-scopes";
import { resolveWahooSyncMetrics } from "../../integrations/wahoo/sync-service";
import { getWahooPlannedActivitySyncPolicy } from "./wahoo-planned-activity-policy";
import {
  buildWahooPlannedActivityPublishJob,
  projectWahooPlannedActivity,
} from "./wahoo-planned-activity-projection";

const TARGET_REFRESH_PAGE_SIZE = 100;

function wahooTargetAnchorValues(targets: AthletePerformanceTargetFacts) {
  const bike = resolveWahooSyncMetrics(targets, "bike");
  const run = resolveWahooSyncMetrics(targets, "run");
  return [bike.ftp, bike.maxHr, bike.thresholdHr, run.maxHr, run.thresholdHr] as const;
}

function wahooTargetAnchorsEqual(
  before: AthletePerformanceTargetFacts,
  after: AthletePerformanceTargetFacts,
) {
  const beforeValues = wahooTargetAnchorValues(before);
  const afterValues = wahooTargetAnchorValues(after);
  return beforeValues.every((value, index) => Object.is(value, afterValues[index]));
}

/**
 * Refreshes only provider-visible desired state. An unavailable new projection is deliberately
 * left alone so an existing future planned activity is never terminalized without a publish
 * replacement.
 */
export async function enqueueWahooRelativeTargetRefreshes(input: {
  afterTargetFacts: AthletePerformanceTargetFacts;
  beforeTargetFacts: AthletePerformanceTargetFacts;
  db: DrizzleDbClient;
  now: Date;
  profileId: string;
  transaction: DrizzleTransactionClient;
}) {
  if (wahooTargetAnchorsEqual(input.beforeTargetFacts, input.afterTargetFacts)) {
    return { candidateCount: 0, queuedCount: 0 };
  }

  const policy = getWahooPlannedActivitySyncPolicy();
  if (policy.availabilityWindowDays === null) {
    return { candidateCount: 0, queuedCount: 0 };
  }
  const startsAtLte = new Date(input.now);
  startsAtLte.setUTCDate(startsAtLte.getUTCDate() + policy.availabilityWindowDays);

  const [{ createWahooSyncRepository }, { createWahooRepository }] = await Promise.all([
    import("../../../infrastructure/repositories/drizzle-wahoo-sync-repository"),
    import("../../../infrastructure/repositories/drizzle-wahoo-repository"),
  ]);
  const providerSyncRepository = createWahooSyncRepository({ db: input.db });
  const wahooRepository = createWahooRepository({ db: input.transaction });
  const integration = await wahooRepository.findWahooIntegrationByProfileId(input.profileId);
  if (!integration || !hasWahooPlannedActivityScopes(integration.scope)) {
    return { candidateCount: 0, queuedCount: 0 };
  }
  let after: { eventId: string; startsAt: string } | undefined;
  let candidateCount = 0;
  let queuedCount = 0;

  while (true) {
    const events = await wahooRepository.listUpcomingWahooSyncedPlannedEvents({
      ...(after ? { after } : {}),
      limit: TARGET_REFRESH_PAGE_SIZE,
      profileId: input.profileId,
      startsAtGte: input.now.toISOString(),
      startsAtLte: startsAtLte.toISOString(),
    });
    if (events.length === 0) break;
    candidateCount += events.length;

    for (const event of events) {
      const structure = activityPlanStructureSchema.safeParse(event.activityPlan.structure);
      if (!structure.success) continue;
      const projectionInput = {
        activityPlan: { ...event.activityPlan, structure: structure.data },
        eventId: event.eventId,
        startsAt: event.startsAt,
        timezone: event.timezone,
      };
      const beforeProjection = projectWahooPlannedActivity({
        ...projectionInput,
        performanceTargets: input.beforeTargetFacts,
      });
      const afterProjection = projectWahooPlannedActivity({
        ...projectionInput,
        performanceTargets: input.afterTargetFacts,
      });
      if (afterProjection.disposition !== "publishable") continue;
      if (
        beforeProjection.disposition === "publishable" &&
        beforeProjection.payloadHash === afterProjection.payloadHash
      ) {
        continue;
      }

      const result = await providerSyncRepository.enqueueJobInTransaction(
        input.transaction,
        buildWahooPlannedActivityPublishJob({
          integration,
          now: input.now.toISOString(),
          performanceModelAsOf: input.afterTargetFacts.asOf,
          profileId: input.profileId,
          projection: afterProjection,
        }),
      );
      if (result.status === "queued") queuedCount += 1;
    }

    const last = events.at(-1);
    if (!last || events.length < TARGET_REFRESH_PAGE_SIZE) break;
    after = { eventId: last.eventId, startsAt: last.startsAt };
  }

  return { candidateCount, queuedCount };
}
