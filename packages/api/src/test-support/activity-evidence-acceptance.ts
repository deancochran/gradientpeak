import { reconcileGeneratedActivityEvidence as reconcileEvidence } from "../application/activities/reconcile-activity-evidence";
import {
  type ActivitySubmission,
  activityArtifactId as buildActivityArtifactId,
  submitActivity as submitAcceptedActivity,
} from "../application/activities/submit-activity";
import { analyzeParsedActivityFile as analyzeFile } from "../application/activity-file-ingestion/analyze-parsed-activity-file";
import { AthleteStateWorkerService } from "../application/athlete-intelligence/athlete-state-worker";
import { readGoalProgress as readGoalProgressForFixture } from "../application/athlete-intelligence/read-goal-progress";
import { readThresholdOverview as readThresholdOverviewForFixture } from "../application/athlete-intelligence/read-threshold-overview";
import type { DrizzleQueryExecutor } from "../db";
import { markAthleteStateDirty } from "../repositories/athlete-state-repository";
import { readyActivityIngestion as seedReadyActivityIngestion } from "./ready-activity-ingestion";

export type { ActivitySubmission };

export function activityArtifactId(...args: Parameters<typeof buildActivityArtifactId>) {
  assertDisposableActivityEvidenceFixture();
  return buildActivityArtifactId(...args);
}

export function assertDisposableActivityEvidenceFixture() {
  if (process.env.E2E_DISPOSABLE_DATABASE !== "1") {
    throw new Error("Activity evidence acceptance requires a managed disposable fixture.");
  }
}

/** Test-only adapter: retain production analysis and reconciliation semantics. */
export function analyzeParsedActivityFile(...args: Parameters<typeof analyzeFile>) {
  assertDisposableActivityEvidenceFixture();
  return analyzeFile(...args);
}

export function reconcileGeneratedActivityEvidence(...args: Parameters<typeof reconcileEvidence>) {
  assertDisposableActivityEvidenceFixture();
  return reconcileEvidence(...args);
}

/** Seeds the durable ingestion operation used by a disposable canonical activity fixture. */
export function readyActivityIngestion(...args: Parameters<typeof seedReadyActivityIngestion>) {
  assertDisposableActivityEvidenceFixture();
  return seedReadyActivityIngestion(...args);
}

/** Writes accepted activity evidence through the production submission path. */
export function submitActivity(...args: Parameters<typeof submitAcceptedActivity>) {
  assertDisposableActivityEvidenceFixture();
  return submitAcceptedActivity(...args);
}

/**
 * Marks a profile dirty through the production repository before fixture workers
 * drain the real queue.
 */
export async function markDisposableAthleteStateDirty(input: {
  db: DrizzleQueryExecutor;
  effectiveAt: Date;
  now: Date;
  profileId: string;
}) {
  assertDisposableActivityEvidenceFixture();
  if (!("$client" in input.db)) {
    throw new Error("Activity evidence acceptance requires a root disposable database client.");
  }
  await input.db.transaction((transaction) =>
    markAthleteStateDirty(transaction, {
      profileId: input.profileId,
      effectiveAt: input.effectiveAt,
      now: input.now,
    }),
  );
}

/** Drains only the real athlete-state jobs needed by a managed disposable fixture. */
export async function processAthleteStateJobs(input: {
  db: DrizzleQueryExecutor;
  limit: number;
  now: Date;
}) {
  assertDisposableActivityEvidenceFixture();
  if (!("$client" in input.db)) {
    throw new Error("Activity evidence acceptance requires a root disposable database client.");
  }
  return new AthleteStateWorkerService({ db: input.db }).processDueJobs({
    limit: input.limit,
    now: input.now,
  });
}

export function readGoalProgress(...args: Parameters<typeof readGoalProgressForFixture>) {
  assertDisposableActivityEvidenceFixture();
  return readGoalProgressForFixture(...args);
}

export function readThresholdOverview(...args: Parameters<typeof readThresholdOverviewForFixture>) {
  assertDisposableActivityEvidenceFixture();
  return readThresholdOverviewForFixture(...args);
}
