import { formatDateOnlyInTimeZone, ianaTimezoneSchema } from "@repo/core";
import {
  ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
  type AthleteRecalculationReason,
  type AthleteRecalculationRequest,
  athleteRecalculationIdempotencyKey,
  athleteRecalculationRequestSchema,
} from "@repo/core/athlete-derived-state";
import type { DrizzleQueryExecutor } from "../../db";
import { createDrizzleAthleteDerivedStateRepository } from "../../infrastructure/repositories";
import type { AthleteDerivedStateRepositoryPort } from "../../repositories/athlete-derived-state-repository-port";

export class AthleteRecalculationRepairUnavailableError extends Error {}

export function buildAthleteRecalculationRequest(input: {
  profileId: string;
  earliestAffectedAt: string;
  earliestAffectedPlanningDate: string;
  sourceRevision: number;
  reasons: AthleteRecalculationReason[];
  requestedAt: string;
}): AthleteRecalculationRequest {
  return athleteRecalculationRequestSchema.parse({
    contractVersion: ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
    profileId: input.profileId,
    idempotencyKey: athleteRecalculationIdempotencyKey(input.profileId),
    earliestAffectedAt: input.earliestAffectedAt,
    earliestAffectedPlanningDate: input.earliestAffectedPlanningDate,
    sourceRevision: input.sourceRevision,
    reasons: [...new Set(input.reasons)].sort((left, right) => {
      const order: AthleteRecalculationReason[] = [
        "activity_created",
        "activity_changed",
        "activity_deleted",
        "analysis_replaced",
        "threshold_changed",
        "import_completed",
        "algorithm_changed",
        "timezone_changed",
        "explicit_repair",
      ];
      return order.indexOf(left) - order.indexOf(right);
    }),
    requestedAt: input.requestedAt,
  });
}

export async function requestAthleteRecalculation(input: {
  repository: AthleteDerivedStateRepositoryPort;
  profileId: string;
  request: AthleteRecalculationRequest;
}) {
  const request = athleteRecalculationRequestSchema.parse(input.request);
  if (request.profileId !== input.profileId) {
    throw new Error("Recalculation request owner mismatch");
  }
  return input.repository.coalesceRecalculationRequest({
    profileId: input.profileId,
    request,
  });
}

export async function requestExplicitAthleteRecalculationRepair(input: {
  db: DrizzleQueryExecutor;
  profileId: string;
  requestedAt?: Date;
  repositoryFactory?: (db: DrizzleQueryExecutor) => AthleteDerivedStateRepositoryPort;
}) {
  const run = async (tx: DrizzleQueryExecutor) => {
    const repository =
      input.repositoryFactory?.(tx) ?? createDrizzleAthleteDerivedStateRepository(tx);
    const state = await repository.lockPublicationState({ profileId: input.profileId });
    if (!state) {
      throw new AthleteRecalculationRepairUnavailableError("Athlete state is unavailable");
    }
    const requestedAt = input.requestedAt ?? new Date();
    const earliestAffectedAt =
      state.coverageStartAt ?? state.lastActivityAt ?? requestedAt.toISOString();
    const planningTimezone = ianaTimezoneSchema.safeParse(state.planningTimezone).data ?? "UTC";
    if (
      !Number.isSafeInteger(state.sourceRevision) ||
      state.sourceRevision >= Number.MAX_SAFE_INTEGER
    ) {
      throw new AthleteRecalculationRepairUnavailableError("Athlete state revision is exhausted");
    }
    const request = buildAthleteRecalculationRequest({
      profileId: input.profileId,
      earliestAffectedAt,
      earliestAffectedPlanningDate: formatDateOnlyInTimeZone(
        new Date(earliestAffectedAt),
        planningTimezone,
      ),
      sourceRevision: state.sourceRevision + 1,
      reasons: ["explicit_repair"],
      requestedAt: requestedAt.toISOString(),
    });
    await requestAthleteRecalculation({ repository, profileId: input.profileId, request });
    return { status: "accepted" as const, profileId: input.profileId };
  };

  return "$client" in input.db ? input.db.transaction(run) : run(input.db);
}
