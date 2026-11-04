import { describe, expect, it, vi } from "vitest";
import { invalidateProfileIdentityQueries } from "./profile-identity-cache";
import type { ApiReactUtils } from "./react";

describe("invalidateProfileIdentityQueries", () => {
  it("invalidates every query family that can render profile identity", async () => {
    const invalidations = Array.from({ length: 12 }, () => vi.fn().mockResolvedValue(undefined));
    const utils = {
      profiles: { invalidate: invalidations[0] },
      activities: { invalidate: invalidations[1] },
      activityPlans: { invalidate: invalidations[2] },
      calendar: { invalidate: invalidations[3] },
      events: { invalidate: invalidations[4] },
      feed: { invalidate: invalidations[5] },
      groups: { invalidate: invalidations[6] },
      messaging: { invalidate: invalidations[7] },
      notifications: { invalidate: invalidations[8] },
      routes: { invalidate: invalidations[9] },
      social: { invalidate: invalidations[10] },
      trainingPlans: { invalidate: invalidations[11] },
    } as unknown as ApiReactUtils;

    await invalidateProfileIdentityQueries(utils);

    for (const invalidate of invalidations) {
      expect(invalidate).toHaveBeenCalledOnce();
    }
  });
});
