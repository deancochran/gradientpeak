export function getProviderSyncRequestTimeoutMs(env = process.env) {
  const parsed = Number.parseInt(env.WAHOO_PROVIDER_SYNC_REQUEST_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 9000) : 8000;
}
