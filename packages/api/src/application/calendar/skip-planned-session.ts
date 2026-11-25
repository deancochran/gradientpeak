import { plannedSessions } from "@repo/db";
import { and, eq } from "drizzle-orm";
import { plannedSessionMutationSchema } from "../../contracts/planned-sessions";
import type { getRequiredDb } from "../../db";
import { createDrizzlePlannedSessionRepository } from "../../infrastructure/repositories";
import { getCurrentAthletePlanningDate } from "../training-plan/appliedScheduleUseCases";
import {
  PlannedSessionFutureDateError,
  PlannedSessionNotFoundError,
  requireUpdatedPlannedSession,
} from "./planned-session-errors";

type DbClient = ReturnType<typeof getRequiredDb>;

export function assertPlannedSessionDateCanBeSkipped(input: {
  planningDate: string;
  currentPlanningDate: string;
}) {
  if (input.planningDate > input.currentPlanningDate) throw new PlannedSessionFutureDateError();
}

export async function skipPlannedSession(input: {
  db: DbClient;
  profileId: string;
  sessionId: string;
  expectedRevision: number;
  operationId: string;
  skippedAt: string;
  now?: Date;
}) {
  const { db, now, ...mutationInput } = input;
  return db.transaction(async (tx) => {
    // Serialize the date decision with the expected-revision mutation.
    await tx
      .select({ id: plannedSessions.id })
      .from(plannedSessions)
      .where(
        and(
          eq(plannedSessions.id, input.sessionId),
          eq(plannedSessions.profile_id, input.profileId),
        ),
      )
      .limit(1)
      .for("update");
    const repository = createDrizzlePlannedSessionRepository(tx);
    const session = await repository.getOwned({
      profileId: input.profileId,
      sessionId: input.sessionId,
    });
    if (!session) throw new PlannedSessionNotFoundError("Planned session not found");

    if (
      session.lifecycle.status === "completed" &&
      session.lifecycle.completion.state === "skipped" &&
      session.lifecycle.completion.operationId === input.operationId
    ) {
      return session;
    }

    if (session.lifecycle.status === "scheduled") {
      const currentPlanningDate = await getCurrentAthletePlanningDate({
        db: tx,
        profileId: input.profileId,
        ...(now === undefined ? {} : { now }),
      });
      assertPlannedSessionDateCanBeSkipped({
        planningDate: session.planningDate,
        currentPlanningDate,
      });
    }

    return requireUpdatedPlannedSession(
      await repository.mutateOwned(
        plannedSessionMutationSchema.parse({ action: "skip", ...mutationInput }),
      ),
    );
  });
}
