/**
 * Garmin's create endpoints have no documented idempotency key or activityPlan-list
 * lookup.  This small worker core deliberately makes an uncertain POST terminal:
 * an operator must reconcile it before another create can be attempted.
 */
export const GARMIN_TRAINING_SYNC_WINDOW_DAYS = 14;

export type GarminTrainingRecoveryPhase =
  | "workout_create"
  | "schedule_create"
  | "workout_update"
  | "schedule_update"
  | "schedule_delete"
  | "workout_delete";

export type GarminTrainingSyncState =
  | { kind: "none" }
  | { kind: "activityPlan"; workoutId: number; ownerId: number; appliedProjectionHash?: string }
  | {
      kind: "scheduled";
      workoutId: number;
      ownerId: number;
      scheduleId: number;
      date: string;
      appliedProjectionHash?: string;
    }
  | {
      kind: "recovery_required";
      phase: GarminTrainingRecoveryPhase;
    };

export type GarminTrainingSyncJob = {
  id: string;
  integrationGeneration: number;
  integrationId: string;
  plannedSessionId: string;
  profileId: string;
  operation: "publish" | "cancel";
  planningDate: string;
  attempt?: number;
  maxAttempts?: number;
  desiredProjectionHash?: string;
};

export interface GarminTrainingSyncStore {
  /** This is backed by provider_sync_jobs + integration_resource_links in production. */
  load(job: GarminTrainingSyncJob): Promise<GarminTrainingSyncState>;
  isActiveAndGranted(job: GarminTrainingSyncJob): Promise<boolean>;
  /** Persist before the external POST, making an interrupted create non-retryable. */
  requireRecovery(
    job: GarminTrainingSyncJob,
    phase: GarminTrainingRecoveryPhase,
    evidence?: Record<string, number | string | null>,
  ): Promise<void>;
  /** Persist a returned create response even if authorization was revoked in flight. */
  recordActivityPlanOutcome(
    job: GarminTrainingSyncJob,
    link: { ownerId: number; workoutId: number },
  ): Promise<void>;
  /** Same receipt-only rule for the dependent schedule create. */
  recordScheduleOutcome(
    job: GarminTrainingSyncJob,
    link: { scheduleId: number; workoutId: number; ownerId: number; date: string },
  ): Promise<void>;
  saveActivityPlan(
    job: GarminTrainingSyncJob,
    link: { ownerId: number; workoutId: number; appliedProjectionHash?: string },
  ): Promise<void>;
  saveSchedule(
    job: GarminTrainingSyncJob,
    link: {
      date: string;
      ownerId: number;
      scheduleId: number;
      workoutId: number;
      appliedProjectionHash?: string;
    },
  ): Promise<void>;
  clear(job: GarminTrainingSyncJob): Promise<void>;
  complete(job: GarminTrainingSyncJob): Promise<void>;
  fail(
    job: GarminTrainingSyncJob,
    reason: "missing_permission" | "stale_generation" | "recovery_required" | "provider_failure",
  ): Promise<void>;
}

export interface GarminTrainingRemote {
  createActivityPlan(): Promise<{ ownerId: number; workoutId: number }>;
  updateActivityPlan(input: { ownerId: number; workoutId: number }): Promise<void>;
  createSchedule(input: { date: string; workoutId: number }): Promise<{ scheduleId: number }>;
  updateSchedule(input: { date: string; scheduleId: number; workoutId: number }): Promise<void>;
  deleteSchedule(scheduleId: number): Promise<void>;
  deleteActivityPlan(input: { ownerId: number; workoutId: number }): Promise<void>;
}

/** Executes exactly one planned-session lane; admission and payload projection are durable-job concerns. */
export async function executeGarminTrainingSyncJob(input: {
  job: GarminTrainingSyncJob;
  remote: GarminTrainingRemote;
  store: GarminTrainingSyncStore;
}): Promise<"completed" | "failed" | "recovery_required"> {
  const { job, remote, store } = input;
  if (!(await store.isActiveAndGranted(job))) {
    await store.fail(job, "missing_permission");
    return "failed";
  }
  let state = await store.load(job);
  if (state.kind === "recovery_required") {
    await store.fail(job, "recovery_required");
    return "recovery_required";
  }
  if (job.operation === "cancel") {
    try {
      if (state.kind === "scheduled") {
        await store.requireRecovery(job, "schedule_delete", {
          scheduleId: state.scheduleId,
          workoutId: state.workoutId,
          ownerId: state.ownerId,
          desiredDate: state.date,
          payloadHash: job.desiredProjectionHash ?? null,
        });
        await remote.deleteSchedule(state.scheduleId);
        // Do not issue the dependent activityPlan delete until the successful schedule
        // delete is durable. A later unknown activityPlan delete therefore cannot make
        // us repeat the schedule operation.
        await store.saveActivityPlan(job, {
          workoutId: state.workoutId,
          ownerId: state.ownerId,
          ...(state.appliedProjectionHash
            ? { appliedProjectionHash: state.appliedProjectionHash }
            : {}),
        });
        state = {
          kind: "activityPlan",
          workoutId: state.workoutId,
          ownerId: state.ownerId,
          ...(state.appliedProjectionHash
            ? { appliedProjectionHash: state.appliedProjectionHash }
            : {}),
        };
      }
      if (state.kind === "activityPlan") {
        await store.requireRecovery(job, "workout_delete", {
          workoutId: state.workoutId,
          ownerId: state.ownerId,
          desiredDate: job.planningDate,
          payloadHash: job.desiredProjectionHash ?? null,
        });
        await remote.deleteActivityPlan(state);
      }
      // A cancellation is fenced once more after provider I/O.
      if (!(await store.isActiveAndGranted(job))) {
        await store.fail(job, "stale_generation");
        return "failed";
      }
      await store.clear(job);
      await store.complete(job);
      return "completed";
    } catch {
      // Every cancel effect is preceded by a durable receipt. Without provider
      // semantics proving this failure happened before the write, retain that
      // receipt as manual recovery rather than replaying either delete.
      await store.fail(job, "recovery_required");
      return "recovery_required";
    }
  }
  try {
    if (state.kind === "none") {
      await store.requireRecovery(job, "workout_create");
      const activityPlan = await remote.createActivityPlan();
      // A disconnect can race this response. Retain the identity before the second
      // authorization check, but do not authorize any follow-up provider effect.
      await store.recordActivityPlanOutcome(job, activityPlan);
      if (!(await store.isActiveAndGranted(job))) {
        await store.fail(job, "stale_generation");
        return "failed";
      }
      await store.saveActivityPlan(job, {
        ...activityPlan,
        ...(job.desiredProjectionHash !== undefined
          ? { appliedProjectionHash: job.desiredProjectionHash }
          : {}),
      });
      state = {
        kind: "activityPlan",
        ...activityPlan,
        ...(job.desiredProjectionHash !== undefined
          ? { appliedProjectionHash: job.desiredProjectionHash }
          : {}),
      };
    }
    if (
      (state.kind === "activityPlan" || state.kind === "scheduled") &&
      job.desiredProjectionHash !== undefined &&
      state.appliedProjectionHash !== job.desiredProjectionHash
    ) {
      // PUT has the same unknown-outcome risk as POST.  Persist a terminal receipt
      // first so a later admission cannot turn an uncertain update into a create.
      await store.requireRecovery(job, "workout_update", {
        workoutId: state.workoutId,
        ownerId: state.ownerId,
        ...(state.kind === "scheduled" ? { scheduleId: state.scheduleId } : {}),
        desiredDate: job.planningDate,
        payloadHash: job.desiredProjectionHash ?? null,
      });
      await remote.updateActivityPlan(state);
      if (!(await store.isActiveAndGranted(job))) {
        await store.fail(job, "stale_generation");
        return "failed";
      }
      if (state.kind === "scheduled") {
        await store.saveSchedule(job, {
          ...state,
          appliedProjectionHash: job.desiredProjectionHash,
        });
        state = { ...state, appliedProjectionHash: job.desiredProjectionHash };
      } else {
        await store.saveActivityPlan(job, {
          ...state,
          appliedProjectionHash: job.desiredProjectionHash,
        });
        state = { ...state, appliedProjectionHash: job.desiredProjectionHash };
      }
    }
    if (state.kind === "activityPlan") {
      await store.requireRecovery(job, "schedule_create");
      const schedule = await remote.createSchedule({
        date: job.planningDate,
        workoutId: state.workoutId,
      });
      await store.recordScheduleOutcome(job, {
        ...schedule,
        date: job.planningDate,
        workoutId: state.workoutId,
        ownerId: state.ownerId,
      });
      if (!(await store.isActiveAndGranted(job))) {
        await store.fail(job, "stale_generation");
        return "failed";
      }
      await store.saveSchedule(job, { ...schedule, date: job.planningDate, ...state });
    } else if (state.kind === "scheduled" && state.date !== job.planningDate) {
      await store.requireRecovery(job, "schedule_update", {
        scheduleId: state.scheduleId,
        workoutId: state.workoutId,
        ownerId: state.ownerId,
        desiredDate: job.planningDate,
        payloadHash: job.desiredProjectionHash ?? null,
      });
      await remote.updateSchedule({
        date: job.planningDate,
        scheduleId: state.scheduleId,
        workoutId: state.workoutId,
      });
      await store.saveSchedule(job, { ...state, date: job.planningDate });
    }
    await store.complete(job);
    return "completed";
  } catch {
    // The store marker is intentionally retained; it prevents an unknown POST duplicate.
    await store.fail(job, "recovery_required");
    return "recovery_required";
  }
}
