import { describe, expect, it } from "vitest";
import { canViewActivityVisibility } from "./activity-reads";

describe("activity visibility access matrix", () => {
  const ownerId = "owner";
  const viewerId = "viewer";

  it.each([
    { visibility: "private" as const, isAcceptedFollower: false, expected: false },
    { visibility: "private" as const, isAcceptedFollower: true, expected: false },
    { visibility: "followers" as const, isAcceptedFollower: false, expected: false },
    { visibility: "followers" as const, isAcceptedFollower: true, expected: true },
    { visibility: "public" as const, isAcceptedFollower: false, expected: true },
    { visibility: "public" as const, isAcceptedFollower: true, expected: true },
  ])("resolves non-owner $visibility / follower=$isAcceptedFollower", (testCase) => {
    expect(canViewActivityVisibility({ ownerId, viewerId, ...testCase })).toBe(testCase.expected);
  });

  it.each([
    "private",
    "followers",
    "public",
  ] as const)("always permits the owner for %s activities", (visibility) => {
    expect(
      canViewActivityVisibility({
        ownerId,
        viewerId: ownerId,
        visibility,
        isAcceptedFollower: false,
      }),
    ).toBe(true);
  });
});
