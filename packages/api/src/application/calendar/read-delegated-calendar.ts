import type { DrizzleDbClient } from "@repo/db/client";
import type {
  DelegatedCalendarRangeRequest,
  DelegatedCalendarRangeResponse,
} from "../../contracts/delegated-calendar";
import { delegatedCalendarProjectionSchema } from "../../contracts/delegated-calendar";
import type { DrizzleTransactionClient } from "../../db";
import {
  createDelegatedCalendarRepository,
  type DelegatedCalendarRepository,
} from "../../repositories/delegated-calendar-repository";
import { withAuthorizedAthleteRead } from "../organizations/authorize-athlete-read";

export class DelegatedCalendarAccessDeniedError extends Error {
  constructor() {
    super("Calendar access is unavailable");
    this.name = "DelegatedCalendarAccessDeniedError";
  }
}

type DelegatedCalendarAuthorizer = typeof withAuthorizedAthleteRead;

/**
 * Runs current assignment, calendar consent, and the allowlisted planned-session
 * projection in one repeatable-read transaction for the selected organization.
 */
export async function readDelegatedCalendar(input: {
  actorProfileId: string;
  authorizer?: DelegatedCalendarAuthorizer;
  db: DrizzleDbClient;
  repositoryForTransaction?: (transaction: DrizzleTransactionClient) => DelegatedCalendarRepository;
  request: DelegatedCalendarRangeRequest;
}): Promise<DelegatedCalendarRangeResponse> {
  const authorizer = input.authorizer ?? withAuthorizedAthleteRead;
  const repositoryForTransaction =
    input.repositoryForTransaction ?? createDelegatedCalendarRepository;
  const authorized = await authorizer({
    actorProfileId: input.actorProfileId,
    athleteProfileId: input.request.athleteProfileId,
    db: input.db,
    organizationId: input.request.organizationId,
    scope: "calendar",
    read: async (transaction) =>
      repositoryForTransaction(transaction).listScopedRange(input.request),
  });
  if (!("value" in authorized)) throw new DelegatedCalendarAccessDeniedError();

  const projection = delegatedCalendarProjectionSchema.parse({
    events: authorized.value.items.map((item) => ({
      activityCategory: item.activityCategory,
      activityPlanId: item.activityPlanId,
      eventId: item.eventId,
      planningDate: item.planningDate,
      status: item.status,
    })),
  });
  const last = authorized.value.items.at(-1);
  return {
    nextCursor:
      authorized.value.truncated && last
        ? { eventId: last.eventId, planningDate: last.planningDate }
        : null,
    projection,
    source: "planned_sessions",
    truncated: authorized.value.truncated,
  };
}
