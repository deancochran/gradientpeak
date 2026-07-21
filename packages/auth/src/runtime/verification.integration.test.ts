import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import {
  createVerificationAdvisoryLock,
  recordVerifiedEmailToken,
  type VerificationConsumptionStore,
  type VerificationRequestLock,
  VerificationTokenReplayError,
  verificationConsumptionIdFromRequest,
  withVerificationReplayGuard,
} from "./verification";

function createAdvisoryLockHarness(options?: { lockError?: Error; unlockError?: Error }) {
  const releases: Array<boolean | undefined> = [];
  let queryCount = 0;
  const lock = createVerificationAdvisoryLock({
    async connect() {
      return {
        async query() {
          queryCount += 1;
          if (queryCount === 1 && options?.lockError) throw options.lockError;
          if (queryCount === 2 && options?.unlockError) throw options.unlockError;
        },
        release(destroy) {
          releases.push(destroy);
        },
      };
    },
  });
  return { lock, releases };
}

function createMemoryProtection(options?: { failMarkerWrites?: number }) {
  const consumed = new Map<string, Date>();
  let consumeAttempts = 0;
  let failedWritesRemaining = options?.failMarkerWrites ?? 0;
  const store: VerificationConsumptionStore = {
    async isConsumed(id) {
      return consumed.has(id);
    },
    async consume(input) {
      consumeAttempts += 1;
      if (failedWritesRemaining > 0) {
        failedWritesRemaining -= 1;
        throw new Error("simulated marker write failure");
      }
      if (consumed.has(input.id)) return false;
      consumed.set(input.id, input.expiresAt);
      return true;
    },
  };

  const tails = new Map<string, Promise<void>>();
  const withLock: VerificationRequestLock = async (id, operation) => {
    const previous = tails.get(id) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    tails.set(id, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (tails.get(id) === tail) tails.delete(id);
    }
  };

  return {
    consumed,
    get consumeAttempts() {
      return consumeAttempts;
    },
    store,
    withLock,
  };
}

async function createHarness(options?: {
  expiresIn?: number;
  failMarkerWrites?: number;
  failUserUpdate?: boolean;
}) {
  const protection = createMemoryProtection({
    ...(options?.failMarkerWrites !== undefined
      ? { failMarkerWrites: options.failMarkerWrites }
      : {}),
  });
  let verificationUrl: string | undefined;
  let afterVerificationCalls = 0;
  const instance = await getTestInstance(
    {
      emailAndPassword: {
        enabled: true,
        requireEmailVerification: true,
      },
      emailVerification: {
        expiresIn: options?.expiresIn ?? 900,
        sendVerificationEmail: async ({ url }) => {
          verificationUrl = url;
        },
        afterEmailVerification: async (_updatedUser, request) => {
          afterVerificationCalls += 1;
          await recordVerifiedEmailToken(request, protection.store);
        },
      },
      ...(options?.failUserUpdate
        ? {
            databaseHooks: {
              user: {
                update: {
                  before: async () => {
                    throw new Error("simulated user update failure");
                  },
                },
              },
            },
          }
        : {}),
    },
    { disableTestUser: true },
  );

  const email = `verification-${crypto.randomUUID()}@example.com`;
  const password = "StrongPass1";
  await instance.auth.api.signUpEmail({
    body: {
      email,
      name: "Verification Athlete",
      password,
    },
  });
  if (!verificationUrl) throw new Error("Better Auth did not emit a verification URL");
  const verificationRequestUrl = new URL(verificationUrl);

  const handler = async (request: Request) => {
    try {
      return await withVerificationReplayGuard(request, protection.store, protection.withLock, () =>
        instance.auth.handler(request),
      );
    } catch (error) {
      if (error instanceof VerificationTokenReplayError) {
        return Response.json({ code: "UNAUTHORIZED", message: error.message }, { status: 401 });
      }
      throw error;
    }
  };

  return {
    ...instance,
    ...protection,
    get afterVerificationCalls() {
      return afterVerificationCalls;
    },
    get consumeAttempts() {
      return protection.consumeAttempts;
    },
    handler,
    email,
    password,
    verificationUrl: verificationRequestUrl.toString(),
  };
}

describe("Better Auth email verification consumption lifecycle", () => {
  it("records a digest only after a valid token verifies the user", async () => {
    const harness = await createHarness();
    expect(harness.consumed.size).toBe(0);

    const response = await harness.handler(new Request(harness.verificationUrl));

    expect(response.status).toBe(302);
    expect(harness.afterVerificationCalls).toBe(1);
    expect(harness.consumed.size).toBe(1);
    expect([...harness.consumed.keys()][0]).not.toContain(
      new URL(harness.verificationUrl).searchParams.get("token"),
    );
  });

  it("does not consume invalid or expired tokens", async () => {
    const invalidHarness = await createHarness();
    const invalidUrl = new URL(invalidHarness.verificationUrl);
    invalidUrl.searchParams.set("token", "invalid-token");

    const invalidResponse = await invalidHarness.handler(new Request(invalidUrl));
    const expiredHarness = await createHarness({ expiresIn: -1 });
    const expiredResponse = await expiredHarness.handler(
      new Request(expiredHarness.verificationUrl),
    );

    expect(invalidResponse.status).toBe(302);
    expect(invalidResponse.headers.get("location")).toContain("error=");
    expect(invalidHarness.consumed.size).toBe(0);
    expect(invalidHarness.afterVerificationCalls).toBe(0);
    expect(expiredResponse.status).toBe(302);
    expect(expiredResponse.headers.get("location")).toContain("error=");
    expect(expiredHarness.consumed.size).toBe(0);
    expect(expiredHarness.afterVerificationCalls).toBe(0);
  });

  it("fails replay closed without returning the raw token", async () => {
    const harness = await createHarness();
    const token = new URL(harness.verificationUrl).searchParams.get("token");
    await harness.handler(new Request(harness.verificationUrl));

    const replay = await harness.handler(new Request(harness.verificationUrl));
    const body = await replay.text();

    expect(replay.status).toBe(401);
    expect(body).not.toContain(token);
    expect(harness.afterVerificationCalls).toBe(1);
    expect(harness.consumed.size).toBe(1);
  });

  it("fails duplicate verification token parameters closed", async () => {
    const harness = await createHarness();
    await harness.handler(new Request(harness.verificationUrl));
    const duplicateUrl = new URL(harness.verificationUrl);
    const token = duplicateUrl.searchParams.get("token");
    if (!token) throw new Error("Verification URL did not contain a token");
    duplicateUrl.searchParams.append("token", token);

    const response = await harness.handler(new Request(duplicateUrl));

    expect(response.status).toBe(401);
    expect(harness.afterVerificationCalls).toBe(1);
    expect(harness.consumed.size).toBe(1);
  });

  it("allows exactly one concurrent duplicate to report success", async () => {
    const harness = await createHarness();

    const responses = await Promise.all([
      harness.handler(new Request(harness.verificationUrl)),
      harness.handler(new Request(harness.verificationUrl)),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([302, 401]);
    expect(harness.afterVerificationCalls).toBe(1);
    expect(harness.consumed.size).toBe(1);

    // Better Auth invokes afterEmailVerification after applying emailVerified.
    // The losing duplicate is therefore an idempotent failure over verified state.
    const signIn = await harness.auth.api.signInEmail({
      body: {
        email: harness.email,
        password: harness.password,
      },
    });
    expect(signIn.user.emailVerified).toBe(true);
  });

  it("recovers a partial commit without allowing either retry to report success", async () => {
    const harness = await createHarness({ failMarkerWrites: 1 });
    const token = new URL(harness.verificationUrl).searchParams.get("token");

    const initialFailure = await harness.handler(new Request(harness.verificationUrl));
    const initialFailureBody = await initialFailure.text();
    expect(initialFailure.status).toBeGreaterThanOrEqual(400);
    expect(initialFailureBody).not.toContain(token);
    expect(harness.afterVerificationCalls).toBe(1);
    expect(harness.consumed.size).toBe(0);

    const signIn = await harness.auth.api.signInEmail({
      body: {
        email: harness.email,
        password: harness.password,
      },
    });
    expect(signIn.user.emailVerified).toBe(true);

    const recovery = await harness.handler(new Request(harness.verificationUrl));
    const replay = await harness.handler(new Request(harness.verificationUrl));
    const recoveryBody = await recovery.text();
    const replayBody = await replay.text();

    expect(recovery.status).toBe(401);
    expect(replay.status).toBe(401);
    expect(recoveryBody).not.toContain(token);
    expect(replayBody).not.toContain(token);
    expect(harness.afterVerificationCalls).toBe(1);
    expect(harness.consumeAttempts).toBe(2);
    expect(harness.consumed.size).toBe(1);
  });

  it("does not consume when Better Auth fails while applying verification", async () => {
    const harness = await createHarness({ failUserUpdate: true });

    const response = await harness.handler(new Request(harness.verificationUrl));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(harness.afterVerificationCalls).toBe(0);
    expect(harness.consumed.size).toBe(0);
  });
});

describe("verification request token extraction", () => {
  it("accepts one token only on the mounted verification URL", () => {
    const request = new Request("https://app.example/api/auth/verify-email?token=secret");
    const id = verificationConsumptionIdFromRequest(request);

    expect(id).toMatch(/^email-verification:[a-f0-9]{64}$/);
    expect(id).not.toContain("secret");
    expect(
      verificationConsumptionIdFromRequest(
        new Request("https://app.example/api/auth/sign-in?token=secret"),
      ),
    ).toBeNull();
    expect(
      verificationConsumptionIdFromRequest(
        new Request("https://app.example/api/auth/verify-email?token=one&token=two"),
      ),
    ).toBeNull();
  });
});

describe("verification advisory lock cleanup", () => {
  const id = verificationConsumptionIdFromRequest(
    new Request("https://app.example/api/auth/verify-email?token=secret"),
  );

  if (!id) throw new Error("Expected verification token identifier");

  it("destroys a connection after unlock failure without masking success", async () => {
    const harness = createAdvisoryLockHarness({ unlockError: new Error("unlock failed") });

    await expect(harness.lock(id, async () => "verified")).resolves.toBe("verified");
    expect(harness.releases).toEqual([true]);
  });

  it("preserves the primary operation error when unlock also fails", async () => {
    const primary = new Error("verification failed");
    const harness = createAdvisoryLockHarness({ unlockError: new Error("unlock failed") });

    await expect(
      harness.lock(id, async () => {
        throw primary;
      }),
    ).rejects.toBe(primary);
    expect(harness.releases).toEqual([true]);
  });

  it("returns an unlocked connection normally when lock acquisition fails", async () => {
    const lockError = new Error("lock failed");
    const harness = createAdvisoryLockHarness({ lockError });

    await expect(harness.lock(id, async () => "unused")).rejects.toBe(lockError);
    expect(harness.releases).toEqual([undefined]);
  });
});
