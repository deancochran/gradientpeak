import { describe, expect, it } from "vitest";

import { assertDisposableFixtureEnvironment } from "./chatbot-acceptance";

const database = "postgresql://fixture@127.0.0.1:54322/gradientpeak_web_acceptance_123_456";
const environment = {
  E2E_DISPOSABLE_DATABASE: "1",
  E2E_RUN_ID: "acceptance-123-450",
  DATABASE_URL: database,
  POSTGRES_URL: database,
};

describe("chatbot acceptance fixture guard", () => {
  it("requires the disposable marker and rejects configured providers", () => {
    expect(() => assertDisposableFixtureEnvironment({})).toThrow(/disposable E2E database/);
    expect(() =>
      assertDisposableFixtureEnvironment({
        E2E_DISPOSABLE_DATABASE: "1",
        OPENAI_API_KEY: "secret",
      }),
    ).toThrow(/provider credentials/);
    expect(() =>
      assertDisposableFixtureEnvironment({
        E2E_DISPOSABLE_DATABASE: "1",
        TYPESAFE_API_KEY: "secret",
      }),
    ).toThrow(/provider credentials/);
    expect(() => assertDisposableFixtureEnvironment(environment)).not.toThrow();
  });
  it.each([
    {
      DATABASE_URL: "postgresql://fixture@remote.example:54322/gradientpeak_web_acceptance_123_456",
    },
    { DATABASE_URL: "postgresql://fixture@127.0.0.1:54322/postgres" },
    { POSTGRES_URL: "postgresql://fixture@127.0.0.1:54322/postgres" },
    { E2E_RUN_ID: "acceptance-999-450" },
    { DATABASE_URL: undefined, POSTGRES_URL: undefined },
  ])("rejects a marker-bearing target that is not this runner's disposable database", (patch) => {
    expect(() => assertDisposableFixtureEnvironment({ ...environment, ...patch })).toThrow(
      /runner-owned database/,
    );
  });
});
