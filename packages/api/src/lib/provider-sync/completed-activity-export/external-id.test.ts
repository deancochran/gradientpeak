import { describe, expect, it } from "vitest";
import { createCompletedActivityExportExternalId } from "./external-id";

const input = {
  activityId: "11111111-1111-4111-8111-111111111111",
  artifactDigest: "a".repeat(64),
  profileId: "22222222-2222-4222-8222-222222222222",
  provider: "strava",
  secret: "test-only-export-identity-secret-32-bytes",
};

describe("completed activity export external identity", () => {
  it("is deterministic and does not expose internal identities or artifact hashes", () => {
    const externalId = createCompletedActivityExportExternalId(input);
    expect(createCompletedActivityExportExternalId(input)).toBe(externalId);
    expect(externalId).toMatch(/^gp-v1-[A-Za-z0-9_-]{43}$/);
    expect(externalId).not.toContain(input.activityId);
    expect(externalId).not.toContain(input.profileId);
    expect(externalId).not.toContain(input.artifactDigest);
  });

  it("changes across owner, provider, activity, and artifact boundaries", () => {
    const externalId = createCompletedActivityExportExternalId(input);
    expect(createCompletedActivityExportExternalId({ ...input, provider: "other" })).not.toBe(
      externalId,
    );
    expect(
      createCompletedActivityExportExternalId({
        ...input,
        profileId: "33333333-3333-4333-8333-333333333333",
      }),
    ).not.toBe(externalId);
    expect(
      createCompletedActivityExportExternalId({ ...input, artifactDigest: "b".repeat(64) }),
    ).not.toBe(externalId);
  });
});
