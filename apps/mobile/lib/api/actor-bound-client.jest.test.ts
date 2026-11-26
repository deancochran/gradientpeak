import type { createVanillaApiClient } from "@repo/api/react";

type ActorClient = ReturnType<typeof createVanillaApiClient>;
const operations = [
  {
    name: "read",
    run: (client: ActorClient) => client.coachingPublication.permissionOptions.query(),
  },
  {
    name: "grant",
    run: (client: ActorClient) =>
      client.coachingPublication.grant.mutate({
        organizationId: "11111111-1111-4111-8111-111111111111",
        coachMembershipId: "22222222-2222-4222-8222-222222222222",
      }),
  },
];

const getCookie = jest.fn();
const fetchMock = jest.fn();
const originalFetch = global.fetch;
let authState = {
  session: { sessionId: "session-a", bearerToken: "bearer-a" },
  user: { id: "athlete-a" },
};
let config = { apiUrl: "https://api.example.test", version: 1 };
const authListeners = new Set<() => void>();
const configListeners = new Set<() => void>();

function emitAuth() {
  for (const listener of authListeners) listener();
}
function emitConfig() {
  for (const listener of configListeners) listener();
}
function switchToB() {
  authState = {
    session: { sessionId: "session-b", bearerToken: "bearer-b" },
    user: { id: "athlete-b" },
  };
  emitAuth();
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

jest.mock("@/lib/auth/client", () => ({ authClient: { getCookie } }));
jest.mock("@/lib/stores/auth-store", () => ({
  useAuthStore: {
    getState: () => authState,
    subscribe: (listener: () => void) => {
      authListeners.add(listener);
      return () => authListeners.delete(listener);
    },
  },
}));
jest.mock("@/lib/server-config", () => ({
  getServerConfig: () => config,
  subscribeServerConfig: (listener: () => void) => {
    configListeners.add(listener);
    return () => configListeners.delete(listener);
  },
}));
jest.mock("@/lib/logging/mobile-action-log", () => ({
  getMobileDeviceKind: () => "phone",
  logMobileAction: jest.fn(),
}));
jest.mock("@/lib/services/sentry", () => ({ captureException: jest.fn() }));

const {
  createActorBoundApiClient,
  isActorBoundRequestError,
  withActorBoundApiClient,
} = require("./actor-bound-client");

const response = () =>
  new Response(JSON.stringify([{ result: { data: { json: { options: [] } } } }]), {
    headers: { "content-type": "application/json" },
    status: 200,
  });

describe("actor-bound typed tRPC transport", () => {
  beforeEach(() => {
    authState = {
      session: { sessionId: "session-a", bearerToken: "bearer-a" },
      user: { id: "athlete-a" },
    };
    config = { apiUrl: "https://api.example.test", version: 1 };
    getCookie.mockReset().mockResolvedValue("cookie-a");
    fetchMock.mockReset().mockResolvedValue(response());
    global.fetch = fetchMock;
  });

  afterEach(() => {
    expect(authListeners.size).toBe(0);
    expect(configListeners.size).toBe(0);
    global.fetch = originalFetch;
  });

  it("uses the real batch transport with immutable standard mobile headers and timeout fetch", async () => {
    await withActorBoundApiClient("athlete-a", (client: ActorClient) =>
      client.coachingPublication.permissionOptions.query(),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/trpc/coachingPublication.permissionOptions");
    expect(init.credentials).toBe("omit");
    const headers = new Headers(init.headers);
    expect(headers.get("cookie")).toBe("cookie-a");
    expect(headers.get("authorization")).toBe("Bearer bearer-a");
    expect(headers.get("x-mobile-device-kind")).toBe("phone");
  });

  it.each(
    operations,
  )("does not dispatch a $name when ownership changes during cookie acquisition", async ({
    run,
  }) => {
    const cookie = deferred<string>();
    const cookieStarted = deferred<void>();
    getCookie.mockImplementationOnce(() => {
      cookieStarted.resolve();
      return cookie.promise;
    });
    const request = withActorBoundApiClient("athlete-a", run);
    const outcome = request.catch((error: unknown) => error);
    await cookieStarted.promise;
    expect(getCookie).toHaveBeenCalledTimes(1);
    authState = {
      session: { sessionId: "session-b", bearerToken: "bearer-b" },
      user: { id: "athlete-b" },
    };
    emitAuth();
    cookie.resolve("cookie-a");

    expect(isActorBoundRequestError(await outcome)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(operations)("fences $name after headers resolve but before the actual fetch", async ({
    run,
  }) => {
    // tRPC converts resolved Headers immediately before fetch. Intercept only
    // that real conversion, leaving the ownership and transport checks real.
    const fromEntries = Object.fromEntries;
    let crossedBoundary = false;
    const conversion = jest.spyOn(Object, "fromEntries").mockImplementation((entries) => {
      if (entries instanceof Headers && entries.get("cookie") === "cookie-a") {
        expect(getCookie).toHaveBeenCalledTimes(1);
        crossedBoundary = true;
        switchToB();
      }
      return fromEntries(entries);
    });
    try {
      const error = await withActorBoundApiClient("athlete-a", run).catch(
        (caught: unknown) => caught,
      );
      expect(crossedBoundary).toBe(true);
      expect(isActorBoundRequestError(error)).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      conversion.mockRestore();
    }
  });

  it("rejects an old session during headers and allows a fresh operation in the new session", async () => {
    const cookie = deferred<string>();
    const started = deferred<void>();
    getCookie.mockImplementationOnce(() => {
      started.resolve();
      return cookie.promise;
    });
    const oldRequest = withActorBoundApiClient("athlete-a", (client: ActorClient) =>
      client.coachingPublication.permissionOptions.query(),
    ).catch((error: unknown) => error);
    await started.promise;
    authState = {
      user: { id: "athlete-a" },
      session: { sessionId: "session-a-new", bearerToken: "bearer-a-new" },
    };
    emitAuth();
    cookie.resolve("cookie-a");
    expect(isActorBoundRequestError(await oldRequest)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    getCookie.mockResolvedValueOnce("cookie-a-new");
    await expect(
      withActorBoundApiClient("athlete-a", (client: ActorClient) =>
        client.coachingPublication.permissionOptions.query(),
      ),
    ).resolves.toEqual({ options: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.get("cookie")).toBe("cookie-a-new");
    expect(headers.get("authorization")).toBe("Bearer bearer-a-new");
  });

  it.each(operations)("rejects $name data when the owner changes during response decoding", async ({
    run,
  }) => {
    const decoding = deferred<void>();
    const body = deferred<unknown>();
    const httpResponse = response();
    jest.spyOn(httpResponse, "json").mockImplementation(() => {
      decoding.resolve();
      return body.promise;
    });
    fetchMock.mockResolvedValueOnce(httpResponse);
    const outcome = withActorBoundApiClient("athlete-a", run).catch((error: unknown) => error);
    await decoding.promise;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("authorization")).toBe(
      "Bearer bearer-a",
    );
    switchToB();
    body.resolve([{ result: { data: { json: { options: [] } } } }]);
    expect(isActorBoundRequestError(await outcome)).toBe(true);
  });

  it("will not dispatch a disposed operation", async () => {
    const bound = createActorBoundApiClient("athlete-a");
    bound.dispose();
    const error = await bound.client.coachingPublication.grant
      .mutate({
        organizationId: "11111111-1111-4111-8111-111111111111",
        coachMembershipId: "22222222-2222-4222-8222-222222222222",
      })
      .catch((caught: unknown) => caught);
    expect(isActorBoundRequestError(error)).toBe(true);
    expect(getCookie).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an A→B→A ABA change after fetch rather than returning old data", async () => {
    const pending = deferred<Response>();
    const fetchStarted = deferred<void>();
    fetchMock.mockImplementationOnce(() => {
      fetchStarted.resolve();
      return pending.promise;
    });
    const request = withActorBoundApiClient("athlete-a", (client: ActorClient) =>
      client.coachingPublication.permissionOptions.query(),
    );
    const outcome = request.catch((error: unknown) => error);
    await fetchStarted.promise;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    authState = {
      session: { sessionId: "session-b", bearerToken: "bearer-b" },
      user: { id: "athlete-b" },
    };
    emitAuth();
    authState = {
      session: { sessionId: "session-a", bearerToken: "bearer-a" },
      user: { id: "athlete-a" },
    };
    emitAuth();
    pending.resolve(response());

    expect(isActorBoundRequestError(await outcome)).toBe(true);
  });

  it("rejects a changed config version and releases subscriptions after completion", async () => {
    const bound = createActorBoundApiClient("athlete-a");
    config = { apiUrl: "https://api.example.test", version: 2 };
    emitConfig();
    expect(
      isActorBoundRequestError(
        await bound.client.coachingPublication.permissionOptions
          .query()
          .catch((error: unknown) => error),
      ),
    ).toBe(true);
    bound.dispose();
    expect(authListeners.size).toBe(0);
    expect(configListeners.size).toBe(0);
  });
});
