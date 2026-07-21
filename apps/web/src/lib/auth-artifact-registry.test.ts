import { describe, expect, it } from "vitest";

import {
  AUTH_ACTOR_CLEANUP_ORDER,
  AUTH_ARTIFACT_CLEANUP_SQL,
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

  it("uses parameterized exact identities and never wildcard deletion", () => {
    for (const sql of Object.values(AUTH_ARTIFACT_CLEANUP_SQL)) {
      expect(sql).toContain("any($1::text[])");
      expect(sql.toLowerCase()).not.toContain(" like ");
      expect(sql).not.toContain("example.test");
    }
  });

  it("deletes every full-onboarding artifact before the actor profile", () => {
    expect(AUTH_ACTOR_CLEANUP_ORDER).toEqual([
      "notifications",
      "follows",
      "profileTrainingSettings",
      "profileGoals",
      "profileMetrics",
      "activityEfforts",
      "profiles",
      "users",
      "verificationRows",
    ]);
  });

  it("rejects identities and digest markers outside the auth lane contract", () => {
    const registry = new AuthArtifactRegistry();
    expect(() => registry.registerActorEmail("person@example.com")).toThrow(/example\.test/);
    expect(() =>
      registry.registerVerificationConsumptionId("email-verification:not-a-digest"),
    ).toThrow(/Invalid verification-consumption/);
  });
});
