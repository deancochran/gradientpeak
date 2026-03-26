import { describe, expect, it } from "vitest";

import { normalizeCoachRoster, normalizeCoachRosterEntry } from "../index";

describe("coaching adapters", () => {
  it("normalizes roster rows with nested profile relations", () => {
    const entry = normalizeCoachRosterEntry({
      athlete_id: "11111111-1111-4111-8111-111111111111",
      profiles: {
        avatar_url: null,
        full_name: "Alex Runner",
        username: "alex",
      },
    });

    expect(entry).toEqual({
      athlete_id: "11111111-1111-4111-8111-111111111111",
      profile: {
        avatar_url: null,
        full_name: "Alex Runner",
        id: undefined,
        username: "alex",
      },
    });
  });

  it("filters invalid roster rows", () => {
    expect(
      normalizeCoachRoster([
        { athlete_id: "11111111-1111-4111-8111-111111111111", profile: null },
        { athlete_id: "not-a-uuid" },
      ]),
    ).toHaveLength(1);
  });
});
