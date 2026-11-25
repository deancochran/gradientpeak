import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authHandler: vi.fn(),
  logServerEvent: vi.fn(),
}));

vi.mock("@repo/auth/server", () => ({
  getGradientPeakAuth: () => ({ handler: mocks.authHandler }),
}));
vi.mock("../../../lib/auth/contract-epoch-route", () => ({
  runWithAuthorizedAuthRouteContractEpoch: (_request: Request, operation: () => unknown) =>
    operation(),
}));
vi.mock("../../../lib/server-log", () => ({
  logServerEvent: mocks.logServerEvent,
}));

type AccountState = "absent" | "unverified" | "verified";

async function mountedPost(path: string, state: AccountState, responseBody: unknown) {
  mocks.authHandler.mockResolvedValueOnce(Response.json(responseBody));
  const { Route } = await import("./$");
  const handler = (
    Route.options as unknown as {
      server?: { handlers?: { POST?: (input: { request: Request }) => Promise<Response> } };
    }
  ).server?.handlers?.POST;
  if (!handler) throw new Error("Expected mounted Better Auth POST handler");

  const request = new Request(`https://app.example.com/api/auth${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://app.example.com",
      "x-test-account-state": state,
    },
    body: JSON.stringify({ email: `${state}@example.test` }),
  });
  const response = await handler({ request } as never);

  expect(mocks.authHandler).toHaveBeenLastCalledWith(request);
  const forwardedRequest = mocks.authHandler.mock.calls.at(-1)?.[0] as Request;
  expect(forwardedRequest.headers.get("origin")).toBe("https://app.example.com");
  return response;
}

describe("mounted Better Auth route enumeration protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    "absent",
    "unverified",
    "verified",
  ] as const)("passes a %s-email sign-up unchanged to Better Auth's generic response", async (state) => {
    const genericResponse = {
      token: null,
      user: { email: `${state}@example.test`, emailVerified: false },
    };
    const response = await mountedPost("/sign-up/email", state, genericResponse);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(genericResponse);
  });

  it.each([
    "absent",
    "unverified",
    "verified",
  ] as const)("passes a %s-email verification resend unchanged to Better Auth's generic response", async (state) => {
    const response = await mountedPost("/send-verification-email", state, { status: true });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: true });
  });
});
