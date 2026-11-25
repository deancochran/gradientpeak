type NativeScenarioCleanup = {
  restoreReverse: () => void;
  stopTransport: () => Promise<void>;
};

export function requireNativeReverseRestoration(result: { error?: Error; status: number | null }) {
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`Runner-owned API reverse restoration exited with status ${result.status}.`);
}

export async function runWithNativeScenarioCleanup<Result>(
  journey: () => Promise<Result>,
  cleanup: NativeScenarioCleanup,
): Promise<Result> {
  let result: Result | undefined;
  let journeyError: unknown;
  let journeyFailed = false;
  try {
    result = await journey();
  } catch (error) {
    journeyFailed = true;
    journeyError = error;
  }

  const cleanupErrors: unknown[] = [];
  try {
    cleanup.restoreReverse();
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    await cleanup.stopTransport();
  } catch (error) {
    cleanupErrors.push(error);
  }

  if (journeyFailed && cleanupErrors.length)
    throw new AggregateError(
      [journeyError, ...cleanupErrors],
      "Native scenario journey and cleanup both failed.",
    );
  if (journeyFailed) throw journeyError;
  if (cleanupErrors.length === 1) throw cleanupErrors[0];
  if (cleanupErrors.length > 1)
    throw new AggregateError(cleanupErrors, "Native scenario cleanup failed.");
  return result as Result;
}
