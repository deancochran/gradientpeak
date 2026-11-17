import { describe, expect, it } from "vitest";
import { parseManualProfileActivityAnalysisArgs } from "../../../scripts/reprocess-profile-activity-analysis";

const profileId = "11111111-1111-4111-8111-111111111111";
const otherProfileId = "22222222-2222-4222-8222-222222222222";

describe("manual profile activity analysis CLI", () => {
  it("defaults to dry-run for one explicitly named profile", () => {
    expect(parseManualProfileActivityAnalysisArgs(["--profile-id", profileId])).toEqual({
      profileId,
      apply: false,
    });
  });

  it("requires an exact matching confirmation before apply", () => {
    expect(() =>
      parseManualProfileActivityAnalysisArgs(["--profile-id", profileId, "--apply"]),
    ).toThrow("exactly match");
    expect(() =>
      parseManualProfileActivityAnalysisArgs([
        "--profile-id",
        profileId,
        "--apply",
        "--confirm-profile-id",
        otherProfileId,
      ]),
    ).toThrow("exactly match");
    expect(
      parseManualProfileActivityAnalysisArgs([
        "--profile-id",
        profileId,
        "--apply",
        "--confirm-profile-id",
        profileId,
      ]),
    ).toMatchObject({ apply: true, profileId, confirmProfileId: profileId });
  });

  it("accepts an inclusive from and exclusive to scope and rejects an empty range", () => {
    expect(
      parseManualProfileActivityAnalysisArgs([
        "--profile-id",
        profileId,
        "--from",
        "2026-01-01T00:00:00.000Z",
        "--to",
        "2026-02-01T00:00:00.000Z",
      ]),
    ).toMatchObject({
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-02-01T00:00:00.000Z"),
    });
    expect(() =>
      parseManualProfileActivityAnalysisArgs([
        "--profile-id",
        profileId,
        "--from",
        "2026-02-01T00:00:00.000Z",
        "--to",
        "2026-02-01T00:00:00.000Z",
      ]),
    ).toThrow("before");
  });

  it("requires profile-id and rejects dry-run confirmation or conflicting modes", () => {
    expect(() => parseManualProfileActivityAnalysisArgs([])).toThrow("--profile-id is required");
    expect(() =>
      parseManualProfileActivityAnalysisArgs([
        "--profile-id",
        profileId,
        "--confirm-profile-id",
        profileId,
      ]),
    ).toThrow("only valid with --apply");
    expect(() =>
      parseManualProfileActivityAnalysisArgs([
        "--profile-id",
        profileId,
        "--apply",
        "--dry-run",
        "--confirm-profile-id",
        profileId,
      ]),
    ).toThrow("cannot be combined");
  });
});
