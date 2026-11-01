import { testUtils } from "better-auth/plugins";
import { beforeEach, describe, expect, it, vi } from "vitest";

const memory = vi.hoisted(() => {
  type RecordValue = Record<string, unknown>;
  const records = new Map<string, Map<string, RecordValue>>();
  const destructiveCalls: Array<{
    model: string;
    where?: Array<{ field: string; value: unknown }>;
  }> = [];

  const table = (model: string) => {
    let values = records.get(model);
    if (!values) {
      values = new Map();
      records.set(model, values);
    }
    return values;
  };

  const matches = (value: RecordValue, where: Array<{ field: string; value: unknown }>) =>
    where.every((condition) => value[condition.field] === condition.value);

  return {
    clear() {
      records.clear();
      destructiveCalls.length = 0;
    },
    has(model: string, id: string) {
      return table(model).has(id);
    },
    destructiveCalls,
    adapter: {
      async create({ model, data }: { model: string; data: RecordValue }) {
        const value = { ...data };
        const id = String(value.id ?? value.token ?? value.identifier);
        table(model).set(id, value);
        return value;
      },
      async findOne({
        model,
        where,
        join,
      }: {
        model: string;
        where: Array<{ field: string; value: unknown }>;
        join?: { user?: boolean };
      }) {
        const value = [...table(model).values()].find((candidate) => matches(candidate, where));
        if (!value) return null;

        if (model === "session" && join?.user) {
          return { ...value, user: table("user").get(String(value.userId)) };
        }

        return { ...value };
      },
      async findMany({
        model,
        where,
      }: {
        model: string;
        where?: Array<{ field: string; value: unknown }>;
      }) {
        return [...table(model).values()]
          .filter((candidate) => !where || matches(candidate, where))
          .map((candidate) => ({ ...candidate }));
      },
      async update({
        model,
        where,
        update,
      }: {
        model: string;
        where: Array<{ field: string; value: unknown }>;
        update: RecordValue;
      }) {
        const value = [...table(model).values()].find((candidate) => matches(candidate, where));
        return value ? { ...value, ...update } : null;
      },
      async updateMany() {
        return 0;
      },
      async delete({
        model,
        where,
      }: {
        model: string;
        where: Array<{ field: string; value: unknown }>;
      }) {
        destructiveCalls.push({ model, where });
        const values = table(model);
        const entry = [...values.entries()].find(([, candidate]) => matches(candidate, where));
        if (!entry) return null;

        values.delete(entry[0]);
        return { ...entry[1] };
      },
      async deleteMany({
        model,
        where,
      }: {
        model: string;
        where?: Array<{ field: string; value: unknown }>;
      }) {
        destructiveCalls.push({ model, where });
        const values = table(model);
        const matching = [...values.entries()].filter(
          ([, candidate]) => !where || matches(candidate, where),
        );
        for (const [id] of matching) values.delete(id);
        return matching.length;
      },
      async count() {
        return 0;
      },
      async transaction<T>(run: (adapter: typeof memory.adapter) => Promise<T>) {
        return run(memory.adapter);
      },
    },
  };
});

vi.mock("@better-auth/drizzle-adapter", () => ({
  drizzleAdapter: () => () => memory.adapter,
}));

vi.mock("@repo/db/client", () => ({
  resolveDatabaseUrl: () => "postgres://unused",
}));

vi.mock("@repo/db/schema", () => ({
  relationalSchema: {},
  schema: {},
}));

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: () => ({}),
}));

vi.mock("pg", () => ({
  Pool: class Pool {},
}));

import { createGradientPeakAuth } from "./server";

interface TestContext {
  test: {
    createUser(input: { id: string; email: string }): { id: string; email: string };
    saveUser(user: { id: string; email: string }): Promise<void>;
    login(input: { userId: string }): Promise<{ headers: Headers; token: string }>;
  };
}

describe("account deletion public handlers", () => {
  beforeEach(() => {
    memory.clear();
  });

  it("returns 404 and preserves a fresh authenticated account for disabled deletion routes", async () => {
    const auth = createGradientPeakAuth({
      appUrl: "http://localhost:3000",
      databaseUrl: "postgres://unused",
      secret: "test-secret-test-secret-test-secret-test-secret",
      mobileScheme: "gradientpeak",
      plugins: [testUtils()],
    });
    const context = (await auth.$context) as unknown as TestContext;
    const user = context.test.createUser({ id: "user-1", email: "athlete@example.com" });
    await context.test.saveUser(user);
    const login = await context.test.login({ userId: user.id });
    const deletionToken = "valid-delete-token";

    await memory.adapter.create({
      model: "verification",
      data: {
        id: "verification-1",
        identifier: `delete-account-${deletionToken}`,
        value: user.id,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const postResponse = await auth.handler(
      new Request("http://localhost:3000/api/auth/delete-user", {
        method: "POST",
        headers: new Headers({
          ...Object.fromEntries(login.headers),
          "content-type": "application/json",
        }),
        body: "{}",
      }),
    );
    const callbackResponse = await auth.handler(
      new Request(`http://localhost:3000/api/auth/delete-user/callback?token=${deletionToken}`, {
        headers: login.headers,
      }),
    );

    expect(postResponse.status).toBe(404);
    expect(callbackResponse.status).toBe(404);
    expect(memory.has("user", user.id)).toBe(true);
    expect(memory.has("session", login.token)).toBe(true);
    expect(memory.has("verification", "verification-1")).toBe(true);
    expect(memory.destructiveCalls).toEqual([]);

    const session = await auth.api.getSession({ headers: login.headers });
    expect(session?.session.token).toBe(login.token);
    expect(session?.user.id).toBe(user.id);
  });
});
