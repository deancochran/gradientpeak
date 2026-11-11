export async function runAllCleanup(cleanups: Array<() => Promise<void> | void>) {
  const results = await Promise.allSettled(cleanups.map(async (cleanup) => cleanup()));
  return results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
}

export function throwCleanupFailures(
  cleanupFailures: unknown[],
  runFailure: unknown,
  runFailed: boolean,
) {
  if (cleanupFailures.length === 0) return;
  if (runFailed) {
    throw new AggregateError(
      [runFailure, ...cleanupFailures],
      "Acceptance run and cleanup both failed",
    );
  }
  throw new AggregateError(cleanupFailures, "Acceptance cleanup failed");
}

export function throwRunAndLeaseCleanupFailures({
  cleanupFailed,
  cleanupFailure,
  runFailed,
  runFailure,
}: {
  cleanupFailed: boolean;
  cleanupFailure: unknown;
  runFailed: boolean;
  runFailure: unknown;
}) {
  if (runFailed && cleanupFailed)
    throw new AggregateError(
      [runFailure, cleanupFailure],
      "Acceptance run and lease cleanup both failed",
    );
  if (runFailed) throw runFailure;
  if (cleanupFailed) throw cleanupFailure;
}
