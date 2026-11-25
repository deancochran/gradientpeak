const DEFAULT_INTERVAL_MS = 5000;
const DEFAULT_STARTUP_RETRY_MS = 2000;
const MAX_INTERVAL_MS = 60_000;

function boundedDelay(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, MAX_INTERVAL_MS) : fallback;
}

export function getProviderDrainConfig(env = process.env) {
  return {
    intervalMs: boundedDelay(env.WAHOO_PROVIDER_SYNC_DRAIN_INTERVAL_MS, DEFAULT_INTERVAL_MS),
    startupRetryMs: boundedDelay(
      env.WAHOO_PROVIDER_SYNC_STARTUP_RETRY_MS,
      DEFAULT_STARTUP_RETRY_MS,
    ),
    requestTimeoutMs: boundedDelay(env.WAHOO_PROVIDER_SYNC_REQUEST_TIMEOUT_MS, 8000),
    secret: env.INTERNAL_PROVIDER_SYNC_SECRET,
    drains: [
      {
        provider: "wahoo",
        url:
          env.WAHOO_PROVIDER_SYNC_DRAIN_URL ??
          "http://127.0.0.1:3000/api/internal/provider-sync/wahoo/drain",
      },
      {
        provider: "garmin",
        url:
          env.GARMIN_PROVIDER_SYNC_DRAIN_URL ??
          "http://127.0.0.1:3000/api/internal/provider-sync/garmin/training-drain",
      },
    ],
  };
}

function hasProcessedJobs(payload) {
  return Object.values(payload ?? {}).some(
    (value) => typeof value === "object" && value !== null && value.processed > 0,
  );
}

/** Runs each registered internal provider endpoint once without logging response bodies. */
export async function drainProviderSyncOnce({ config, fetchImpl = fetch, log = console, signal }) {
  const outcomes = [];
  for (const drain of config.drains) {
    if (signal?.aborted) break;
    try {
      const response = await fetchImpl(drain.url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.secret}`,
          "content-type": "application/json",
        },
        body: "{}",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(config.requestTimeoutMs)])
          : AbortSignal.timeout(config.requestTimeoutMs),
      });
      if (!response.ok) {
        log.error(`[provider-drain] ${drain.provider} returned HTTP ${response.status}`);
        outcomes.push({ provider: drain.provider, reachable: true, ok: false });
        continue;
      }

      const text = await response.text();
      const payload = text ? JSON.parse(text) : null;
      if (hasProcessedJobs(payload)) {
        log.log(
          JSON.stringify({
            drainedAt: new Date().toISOString(),
            provider: drain.provider,
            payload,
          }),
        );
      }
      outcomes.push({ provider: drain.provider, reachable: true, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`[provider-drain] ${drain.provider} request failed: ${message}`);
      outcomes.push({ provider: drain.provider, reachable: false, ok: false });
    }
  }
  return outcomes;
}

export async function runProviderDrainLoop({
  config = getProviderDrainConfig(),
  fetchImpl = fetch,
  log = console,
  once = process.argv.includes("--once"),
  sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
  maxIterations = Number.POSITIVE_INFINITY,
  signal,
} = {}) {
  if (!config.secret) {
    log.error("INTERNAL_PROVIDER_SYNC_SECRET is required to drain provider sync jobs.");
    return 1;
  }

  let hasConnected = false;
  let iterations = 0;
  while (iterations < maxIterations && !signal?.aborted) {
    const outcomes = await drainProviderSyncOnce({ config, fetchImpl, log, signal });
    hasConnected ||= outcomes.some((outcome) => outcome.reachable);
    iterations += 1;
    if (signal?.aborted || once || iterations >= maxIterations) break;
    await sleep(hasConnected ? config.intervalMs : config.startupRetryMs, signal);
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const shutdown = new AbortController();
  process.once("SIGINT", () => shutdown.abort());
  process.once("SIGTERM", () => shutdown.abort());
  process.exitCode = await runProviderDrainLoop({ signal: shutdown.signal });
}
