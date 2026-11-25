import { reconcileGeneratedActivityEvidence as reconcileEvidence } from "../application/activities/reconcile-activity-evidence";
import { analyzeParsedActivityFile as analyzeFile } from "../application/activity-file-ingestion/analyze-parsed-activity-file";

function assertDisposableFixture() {
  if (process.env.E2E_DISPOSABLE_DATABASE !== "1") {
    throw new Error("Activity evidence acceptance requires a managed disposable fixture.");
  }
}

/** Test-only adapter: retain production analysis and reconciliation semantics. */
export function analyzeParsedActivityFile(...args: Parameters<typeof analyzeFile>) {
  assertDisposableFixture();
  return analyzeFile(...args);
}

export function reconcileGeneratedActivityEvidence(...args: Parameters<typeof reconcileEvidence>) {
  assertDisposableFixture();
  return reconcileEvidence(...args);
}
