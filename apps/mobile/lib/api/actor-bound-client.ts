import { createVanillaApiClient } from "@repo/api/react";
import { createMobileHeaders, fetchWithTimeout, getApiUrl } from "@/lib/api";
import { getServerConfig, subscribeServerConfig } from "@/lib/server-config";
import { useAuthStore } from "@/lib/stores/auth-store";

type Snapshot = {
  actorId: string | null;
  configVersion: number;
  sessionId: string | null;
};

export class ActorBoundRequestError extends Error {
  constructor() {
    super("The signed-in account or server configuration changed before this request completed.");
    this.name = "ActorBoundRequestError";
  }
}

export function isActorBoundRequestError(error: unknown) {
  if (error instanceof ActorBoundRequestError) return true;
  return (
    typeof error === "object" &&
    error !== null &&
    "cause" in error &&
    error.cause instanceof ActorBoundRequestError
  );
}

function snapshot(): Snapshot {
  const state = useAuthStore.getState();
  return {
    actorId: state.user?.id ?? null,
    configVersion: getServerConfig().version,
    sessionId: state.session?.sessionId ?? null,
  };
}

function sameSnapshot(left: Snapshot, right: Snapshot) {
  return (
    left.actorId === right.actorId &&
    left.sessionId === right.sessionId &&
    left.configVersion === right.configVersion
  );
}

/**
 * Creates a short-lived tRPC client that fails closed if its auth owner or
 * server configuration changes at any point in one operation. Callers must
 * dispose it in a finally block; do not construct one during React render.
 */
export function createActorBoundApiClient(expectedActorId: string) {
  const expected = snapshot();
  if (expected.actorId !== expectedActorId || !expected.sessionId) {
    throw new ActorBoundRequestError();
  }

  let invalidated = false;
  let disposed = false;
  const invalidateIfChanged = () => {
    if (!sameSnapshot(expected, snapshot())) invalidated = true;
  };
  const unsubscribeAuth = useAuthStore.subscribe(invalidateIfChanged);
  const unsubscribeConfig = subscribeServerConfig(invalidateIfChanged);
  const apiUrl = getApiUrl();

  const assertCurrent = () => {
    invalidateIfChanged();
    if (disposed || invalidated || !sameSnapshot(expected, snapshot())) {
      throw new ActorBoundRequestError();
    }
  };

  const client = createVanillaApiClient({
    fetch: async (input, init) => {
      assertCurrent();
      const response = await fetchWithTimeout(input, init);
      // Do not permit a response obtained for an old owner/config into a cache.
      assertCurrent();
      return response;
    },
    headers: async () => {
      assertCurrent();
      const headers = await createMobileHeaders();
      assertCurrent();
      return new Headers(headers);
    },
    url: apiUrl,
  });

  return {
    assertCurrent,
    client,
    dispose: () => {
      disposed = true;
      unsubscribeAuth();
      unsubscribeConfig();
    },
  };
}

/** Runs one operation with an actor-bound client and always releases its listeners. */
export async function withActorBoundApiClient<T>(
  expectedActorId: string,
  operation: (client: ReturnType<typeof createVanillaApiClient>) => Promise<T>,
) {
  const bound = createActorBoundApiClient(expectedActorId);
  try {
    const result = await operation(bound.client);
    // Decoding happens after fetch resolves; validate once more before data can
    // be handed to a caller-owned query cache.
    bound.assertCurrent();
    return result;
  } finally {
    bound.dispose();
  }
}
