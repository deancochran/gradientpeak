const INTERNAL_PROVIDER_SYNC_SECRET = process.env.INTERNAL_PROVIDER_SYNC_SECRET;

export function isInternalProviderSyncAuthorized(request: Request): boolean {
  if (!INTERNAL_PROVIDER_SYNC_SECRET) {
    return false;
  }

  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const headerToken = request.headers.get("x-provider-sync-secret");

  return (
    bearerToken === INTERNAL_PROVIDER_SYNC_SECRET || headerToken === INTERNAL_PROVIDER_SYNC_SECRET
  );
}
