import { randomUUID } from "node:crypto";
import {
  type ManualTrainingDiaryObservation,
  manualTrainingDiaryObservationSchema,
} from "@repo/core/calendar";
import {
  activities,
  activitySessionRpeEvidence,
  manualTrainingDiaryOperations,
  plannedSessions,
} from "@repo/db";
import { and, eq, sql } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { createDrizzlePlannedSessionRepository } from "../../infrastructure/repositories";
import {
  findManualDiaryOperation,
  findOwnedManualDiaryActivity,
  findSessionRpeOperation,
} from "../../repositories/manual-training-diary-repository";
import { getCurrentAthletePlanningDate } from "../training-plan/appliedScheduleUseCases";

type DbClient = ReturnType<typeof getRequiredDb>;

export class ManualDiaryConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualDiaryConflictError";
  }
}

export function manualDiaryRequestFingerprint(
  value: ManualTrainingDiaryObservation,
  plannedSession:
    | { expectedRevision: number; outcome: "full" | "partial"; sessionId: string }
    | undefined,
) {
  return JSON.stringify({
    observation: {
      operationId: value.operationId,
      diaryDate: value.diaryDate,
      diaryTimezone: value.diaryTimezone,
      name: value.name,
      activityCategory: value.activityCategory,
      notes: value.notes ?? null,
      startedAt: value.startedAt ?? null,
      finishedAt: value.finishedAt ?? null,
      elapsedMs: value.elapsedMs ?? null,
      distanceMeters: value.distanceMeters ?? null,
      rpe: value.rpe ?? null,
      rpeOperationId: value.rpeOperationId ?? null,
    },
    plannedSession: plannedSession ?? null,
  });
}

export function assertManualDiaryDateIsCurrentOrPast(input: {
  currentPlanningDate: string;
  diaryDate: string;
  plannedSessionDate?: string;
}) {
  if (input.diaryDate > input.currentPlanningDate) {
    throw new ManualDiaryConflictError("Manual diary entries cannot be recorded for a future date");
  }
  if (input.plannedSessionDate && input.plannedSessionDate > input.currentPlanningDate) {
    throw new ManualDiaryConflictError(
      "Future planned sessions cannot be completed from the diary",
    );
  }
}

function assertPlannedSessionCanBeCompleted(input: {
  activityCategory: ManualTrainingDiaryObservation["activityCategory"];
  expectedRevision: number;
  session: Awaited<
    ReturnType<ReturnType<typeof createDrizzlePlannedSessionRepository>["getOwned"]>
  >;
}) {
  const session = input.session;
  if (!session) throw new ManualDiaryConflictError("Planned session is unavailable");
  if (
    session.sessionRevision !== input.expectedRevision ||
    session.lifecycle.status !== "scheduled"
  ) {
    throw new ManualDiaryConflictError(
      "Planned session changed before manual completion could be linked",
    );
  }
  if (
    session.prescription.resolutionManifest.resolved_structure.activity_category !==
    input.activityCategory
  ) {
    throw new ManualDiaryConflictError(
      "Manual diary activity category must match the planned session",
    );
  }
}

export async function createManualDiaryEntry(input: {
  db: DbClient;
  profileId: string;
  observation: ManualTrainingDiaryObservation;
  plannedSession?: { expectedRevision: number; outcome: "full" | "partial"; sessionId: string };
  now?: Date;
}) {
  const observation = manualTrainingDiaryObservationSchema.parse(input.observation);
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("Manual diary clock is invalid");
  const currentPlanningDate = await getCurrentAthletePlanningDate({
    db: input.db,
    profileId: input.profileId,
    now,
  });
  const requestFingerprint = manualDiaryRequestFingerprint(observation, input.plannedSession);
  return input.db.transaction(async (tx) => {
    // Serialize same-operation retries before creating the canonical activity.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${input.profileId}:${observation.operationId}:manual-diary`}, 0))`,
    );
    if (observation.rpeOperationId) {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`${input.profileId}:${observation.rpeOperationId}:session-rpe`}, 0))`,
      );
    }
    const replay = await findManualDiaryOperation(tx, {
      profileId: input.profileId,
      operationId: observation.operationId,
    });
    if (replay) {
      if (replay.request_fingerprint !== requestFingerprint) {
        throw new ManualDiaryConflictError(
          "Manual diary operation was already used with different data",
        );
      }
      const activity = await findOwnedManualDiaryActivity(tx, {
        activityId: replay.activity_id,
        profileId: input.profileId,
      });
      if (!activity) throw new Error("Manual diary replay activity is missing");
      return { activity, outcome: "unchanged" as const };
    }

    let plannedSessionRepository: ReturnType<typeof createDrizzlePlannedSessionRepository> | null =
      null;
    if (input.plannedSession) {
      await tx
        .select({ id: plannedSessions.id })
        .from(plannedSessions)
        .where(
          and(
            eq(plannedSessions.id, input.plannedSession.sessionId),
            eq(plannedSessions.profile_id, input.profileId),
          ),
        )
        .limit(1)
        .for("update");
      plannedSessionRepository = createDrizzlePlannedSessionRepository(tx);
      const session = await plannedSessionRepository.getOwned({
        profileId: input.profileId,
        sessionId: input.plannedSession.sessionId,
      });
      assertPlannedSessionCanBeCompleted({
        activityCategory: observation.activityCategory,
        expectedRevision: input.plannedSession.expectedRevision,
        session,
      });
      if (!session) throw new ManualDiaryConflictError("Planned session is unavailable");
      assertManualDiaryDateIsCurrentOrPast({
        currentPlanningDate,
        diaryDate: observation.diaryDate,
        plannedSessionDate: session.planningDate,
      });
    } else {
      assertManualDiaryDateIsCurrentOrPast({
        currentPlanningDate,
        diaryDate: observation.diaryDate,
      });
    }

    if (observation.rpeOperationId) {
      const existingRpeOperation = await findSessionRpeOperation(tx, {
        profileId: input.profileId,
        operationId: observation.rpeOperationId,
      });
      if (existingRpeOperation) {
        throw new ManualDiaryConflictError(
          "Session-RPE operation is already associated with an activity",
        );
      }
    }

    const activityId = randomUUID();
    const [activity] = await tx
      .insert(activities)
      .values({
        id: activityId,
        profile_id: input.profileId,
        name: observation.name,
        notes: observation.notes ?? null,
        entry_provenance: "manual",
        diary_date: observation.diaryDate,
        diary_timezone: observation.diaryTimezone,
        manual_activity_category: observation.activityCategory,
        started_at: observation.startedAt ? new Date(observation.startedAt) : null,
        finished_at: observation.finishedAt ? new Date(observation.finishedAt) : null,
        elapsed_ms: observation.elapsedMs ?? null,
        distance_meters: observation.distanceMeters ?? null,
        parser_version: "manual-diary-v1",
        decoded_contract_version: "manual-diary-v1",
        materializer_version: "manual-diary-v1",
        laps: [],
      })
      .returning();
    if (!activity) throw new Error("Manual diary activity was not persisted");

    if (input.plannedSession) {
      const mutation = await (
        plannedSessionRepository ?? createDrizzlePlannedSessionRepository(tx)
      ).mutateOwned({
        action: "link_completion",
        profileId: input.profileId,
        sessionId: input.plannedSession.sessionId,
        expectedRevision: input.plannedSession.expectedRevision,
        activityId,
        outcome: input.plannedSession.outcome,
        linkedAt: now.toISOString(),
      });
      if (mutation.status !== "updated") {
        throw new ManualDiaryConflictError(
          "Planned session changed before manual completion could be linked",
        );
      }
    }

    if (observation.rpe !== undefined && observation.rpeOperationId) {
      const recordedAt = now;
      await tx.insert(activitySessionRpeEvidence).values({
        profile_id: input.profileId,
        activity_id: activityId,
        recorded_at: recordedAt,
        corrected_at: null,
        rpe: observation.rpe,
        scale: "borg_cr10",
        scale_version: "1",
        source: "manual",
        operation_id: observation.rpeOperationId,
        correction_of_id: null,
        provenance: {
          observation_type: "completed_session_rpe",
          entered_by: "athlete",
          operation_id: observation.rpeOperationId,
        },
      });
    }
    await tx.insert(manualTrainingDiaryOperations).values({
      id: randomUUID(),
      profile_id: input.profileId,
      operation_id: observation.operationId,
      request_fingerprint: requestFingerprint,
      activity_id: activityId,
      planned_session_id: input.plannedSession?.sessionId ?? null,
    });
    return { activity, outcome: "created" as const };
  });
}
