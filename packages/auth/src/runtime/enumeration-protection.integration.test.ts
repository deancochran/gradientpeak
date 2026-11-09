import { getTestInstance } from "better-auth/test";
import { beforeAll, describe, expect, it } from "vitest";

async function createEnumerationTestInstance() {
  return getTestInstance(
    {
      emailAndPassword: {
        enabled: true,
        requireEmailVerification: true,
      },
      emailVerification: {
        sendVerificationEmail: async () => {},
      },
    },
    { disableTestUser: true },
  );
}

type TestAuthInstance = Awaited<ReturnType<typeof createEnumerationTestInstance>>;

let instance: TestAuthInstance;

async function postAuth(path: string, body: Record<string, unknown>) {
  return instance.auth.handler(
    new Request(`http://localhost:3000/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify(body),
    }),
  );
}

async function seedUser(email: string, emailVerified: boolean) {
  const response = await postAuth("/sign-up/email", {
    email,
    name: "Enumeration Test",
    password: "StrongPass1",
  });
  expect(response.status).toBe(200);

  if (emailVerified) {
    const updated = await instance.db.update({
      model: "user",
      where: [{ field: "email", value: email }],
      update: { emailVerified: true },
    });
    expect(updated).not.toBeNull();
  }
}

beforeAll(async () => {
  instance = await createEnumerationTestInstance();
});

describe("Better Auth public email enumeration protection", () => {
  it.each([
    { state: "absent", seed: false, verified: false },
    { state: "unverified", seed: true, verified: false },
    { state: "verified", seed: true, verified: true },
  ])("returns the generic sign-up response for a $state email", async ({
    state,
    seed,
    verified,
  }) => {
    const email = `sign-up-${state}@example.test`;
    if (seed) await seedUser(email, verified);

    const response = await postAuth("/sign-up/email", {
      email,
      name: "Enumeration Test",
      password: "StrongPass1",
    });
    const body = (await response.json()) as {
      token?: unknown;
      user?: { email?: unknown; emailVerified?: unknown; name?: unknown };
      message?: unknown;
    };

    expect(response.status).toBe(200);
    expect(body).not.toHaveProperty("message");
    expect(body.token).toBeNull();
    expect(body.user).toMatchObject({
      email,
      emailVerified: false,
      name: "Enumeration Test",
    });
  });

  it.each([
    { state: "absent", seed: false, verified: false },
    { state: "unverified", seed: true, verified: false },
    { state: "verified", seed: true, verified: true },
  ])("returns the same public verification-resend response for a $state email", async ({
    state,
    seed,
    verified,
  }) => {
    const email = `verification-${state}@example.test`;
    if (seed) await seedUser(email, verified);

    const response = await postAuth("/send-verification-email", { email });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: true });
  });
});
