import { describe, expect, it, vi } from "vitest";
import { linkPlannedSessionGroupEvent } from "./link-planned-session-group-event";
import { PlannedSessionAccessError } from "./planned-session-errors";

const input = {
  profileId: "11111111-1111-4111-8111-111111111111",
  sessionId: "22222222-2222-4222-8222-222222222222",
  expectedRevision: 1,
  groupEventId: "33333333-3333-4333-8333-333333333333",
};

describe("linkPlannedSessionGroupEvent", () => {
  it("denies a group event outside the profile's active memberships", async () => {
    const repository = {
      groupEventExistsForProfile: vi.fn(async () => false),
      mutateOwned: vi.fn(),
    };
    await expect(
      linkPlannedSessionGroupEvent({ repository: repository as never, ...input }),
    ).rejects.toBeInstanceOf(PlannedSessionAccessError);
    expect(repository.groupEventExistsForProfile).toHaveBeenCalledWith({
      profileId: input.profileId,
      groupEventId: input.groupEventId,
    });
    expect(repository.mutateOwned).not.toHaveBeenCalled();
  });
});
