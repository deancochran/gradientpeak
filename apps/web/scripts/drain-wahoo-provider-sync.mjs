const drainUrl =
  process.env.WAHOO_PROVIDER_SYNC_DRAIN_URL ??
  "http://127.0.0.1:3000/api/internal/provider-sync/wahoo/drain";
const intervalMs = Number(process.env.WAHOO_PROVIDER_SYNC_DRAIN_INTERVAL_MS ?? "60000");
const startupRetryMs = Number(process.env.WAHOO_PROVIDER_SYNC_STARTUP_RETRY_MS ?? "2000");
const requestTimeoutMs = getProviderSyncRequestTimeoutMs();
const once = process.argv.includes("--once");
const secret = process.env.INTERNAL_PROVIDER_SYNC_SECRET;

if (!secret) {
  console.error("INTERNAL_PROVIDER_SYNC_SECRET is required to drain Wahoo provider sync jobs.");
  process.exit(1);
}

async function drain() {
  const response = await fetch(drainUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: "{}",
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Drain failed with ${response.status}: ${text}`);
  }

  const payload = text ? JSON.parse(text) : null;
  console.log(JSON.stringify({ drainedAt: new Date().toISOString(), payload }));
}

async function run() {
  let hasConnected = false;

  while (true) {
    try {
      await drain();
      hasConnected = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(hasConnected ? message : `Waiting for dev server at ${drainUrl}: ${message}`);
      if (once) process.exitCode = 1;
    }

    if (once) break;
    await new Promise((resolve) => setTimeout(resolve, hasConnected ? intervalMs : startupRetryMs));
  }
}

await run();

import { getProviderSyncRequestTimeoutMs } from "./provider-sync-config.mjs";
