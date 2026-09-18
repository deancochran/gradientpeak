import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withLocalE2EDatabase: vi.fn(),
}));

vi.mock("../../e2e/support/database", () => mocks);

import {
  AuthArtifactRegistry,
  registerAuthActor,
  runWithAuthArtifactRegistry,
} from "../../e2e/lane-support/auth/artifact-registry";

describe("auth lane artifact registry", () => {
  it("deduplicates, sorts, and drains only exact registered artifacts", () => {
    const registry = new AuthArtifactRegistry();
    registry.registerActorEmail("Zulu-1@example.test");
    registry.registerActorEmail("alpha-1@example.test");
    registry.registerActorEmail("ALPHA-1@example.test");
    registry.registerVerificationConsumptionId(`email-verification:${"b".repeat(64)}`);
    registry.registerVerificationConsumptionId(`email-verification:${"a".repeat(64)}`);

    expect(registry.drain()).toEqual({
      actorEmails: ["alpha-1@example.test", "zulu-1@example.test"],
      verificationConsumptionIds: [
        `email-verification:${"a".repeat(64)}`,
        `email-verification:${"b".repeat(64)}`,
      ],
    });
    expect(registry.drain()).toEqual({ actorEmails: [], verificationConsumptionIds: [] });
  });

  it("keeps concurrent registry scopes isolated", async () => {
    const first = new AuthArtifactRegistry();
    const second = new AuthArtifactRegistry();

    await Promise.all([
      runWithAuthArtifactRegistry(first, async () => registerAuthActor("first-1@example.test")),
      runWithAuthArtifactRegistry(second, async () => registerAuthActor("second-1@example.test")),
    ]);

    expect(first.drain().actorEmails).toEqual(["first-1@example.test"]);
    expect(second.drain().actorEmails).toEqual(["second-1@example.test"]);
  });

  it("normalizes registered actor identities before cleanup snapshots are produced", () => {
    const registry = new AuthArtifactRegistry();
    registry.registerActorEmail("Mixed-Case@example.test");

    expect(registry.drain().actorEmails).toEqual(["mixed-case@example.test"]);
  });

  it("rejects identities and digest markers outside the auth lane contract", () => {
    const registry = new AuthArtifactRegistry();
    expect(() => registry.registerActorEmail("person@example.com")).toThrow(/example\.test/);
    expect(() =>
      registry.registerVerificationConsumptionId("email-verification:not-a-digest"),
    ).toThrow(/Invalid verification-consumption/);
    expect(mocks.withLocalE2EDatabase).not.toHaveBeenCalled();
  });
});
