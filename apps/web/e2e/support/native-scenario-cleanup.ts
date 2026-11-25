type NativeScenarioCleanup = {
  restoreReverse: () => void;
  stopTransport: () => Promise<void>;
};

export async function runWithNativeScenarioCleanup<Result>(
  journey: () => Promise<Result>,
  cleanup: NativeScenarioCleanup,
): Promise<Result> {
  let result: Result | undefined;
  let journeyError: unknown;
  try {
    result = await journey();
  } catch (error) {
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

  if (journeyError && cleanupErrors.length)
    throw new AggregateError(
      [journeyError, ...cleanupErrors],
      "Native scenario journey and cleanup both failed.",
    );
  if (journeyError) throw journeyError;
  if (cleanupErrors.length === 1) throw cleanupErrors[0];
  if (cleanupErrors.length > 1)
    throw new AggregateError(cleanupErrors, "Native scenario cleanup failed.");
  return result as Result;
}
