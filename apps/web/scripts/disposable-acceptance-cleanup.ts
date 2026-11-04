export async function runAllCleanup(cleanups: Array<() => Promise<void> | void>) {
  const results = await Promise.allSettled(cleanups.map(async (cleanup) => cleanup()));
  return results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
}

export function throwCleanupFailures(cleanupFailures: unknown[], runFailure: unknown) {
  if (cleanupFailures.length === 0) return;
  if (runFailure !== undefined) {
    throw new AggregateError(
      [runFailure, ...cleanupFailures],
      "Acceptance run and cleanup both failed",
    );
  }
  throw new AggregateError(cleanupFailures, "Acceptance cleanup failed");
}
