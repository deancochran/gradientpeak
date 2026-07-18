function readSampleRate(value, fallback = 0) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

function shouldEnableReplay(env) {
  if (env.EXPO_PUBLIC_ENABLE_SENTRY_REPLAY !== "1") {
    return false;
  }

  return (
    readSampleRate(env.EXPO_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE, 0) > 0 ||
    readSampleRate(env.EXPO_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE, 0) > 0
  );
}

function createMobileSentryOptions(env, environment) {
  const replayEnabled = shouldEnableReplay(env);
  const tracesSampleRate = readSampleRate(env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE, 0);

  return {
    dsn: env.EXPO_PUBLIC_SENTRY_DSN,
    enableAutoPerformanceTracing: tracesSampleRate > 0,
    enableLogs: false,
    environment,
    replaysOnErrorSampleRate: replayEnabled
      ? readSampleRate(env.EXPO_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE, 0)
      : 0,
    replaysSessionSampleRate: replayEnabled
      ? readSampleRate(env.EXPO_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE, 0)
      : 0,
    sendDefaultPii: false,
    tracesSampleRate,
  };
}

module.exports = {
  createMobileSentryOptions,
  readSampleRate,
  shouldEnableReplay,
};
