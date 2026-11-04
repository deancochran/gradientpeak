import { describe, expect, it, vi } from "vitest";

import { invalidateGroupEventMutationQueries } from "./invalidation";

function invalidator() {
  return { invalidate: vi.fn(async () => undefined) };
}

describe("group event invalidation", () => {
  it("refreshes both active Plan read models after event mutations and RSVPs", async () => {
    const utils = {
      calendar: invalidator(),
      trainingPlans: {
        getPlanTabProjection: invalidator(),
        getPlanningLedger: invalidator(),
      },
      groups: {
        detail: invalidator(),
        members: invalidator(),
        pendingInvitations: invalidator(),
        pendingJoinRequests: invalidator(),
        events: {
          list: invalidator(),
          detail: invalidator(),
          seriesOccurrences: invalidator(),
          myUpcomingGroupEvents: invalidator(),
        },
      },
    };

    await invalidateGroupEventMutationQueries(utils as never, {
      groupEventId: "event-1",
      groupId: "group-1",
    });

    expect(utils.trainingPlans.getPlanTabProjection.invalidate).toHaveBeenCalledTimes(1);
    expect(utils.trainingPlans.getPlanningLedger.invalidate).toHaveBeenCalledTimes(1);
  });
});
