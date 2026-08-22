import { defaultAthletePreferenceProfile } from "@repo/core";
import type { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

import { createRouterCaller } from "../../test/router";
import { profileSettingsRouter } from "../profile-settings";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";

describe("training-preferences.edit", () => {
  it("rejects an invalid session range before attempting to save", async () => {
    const caller = createRouterCaller(profileSettingsRouter, {
      db: {} as never,
      userId: PROFILE_ID,
    });

    await expect(
      caller.upsert({
        profile_id: PROFILE_ID,
        settings: {
          ...defaultAthletePreferenceProfile,
          dose_limits: {
            ...defaultAthletePreferenceProfile.dose_limits,
            min_sessions_per_week: 5,
            max_sessions_per_week: 2,
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    } as Partial<TRPCError>);
  });
});
