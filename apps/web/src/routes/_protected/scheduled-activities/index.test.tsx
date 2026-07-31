import { describe, expect, it } from "vitest";

import { buildScheduledActivitiesListInput } from "./index";

describe("scheduled activity library query boundaries", () => {
  it("includes today in upcoming and ends past on the prior date", () => {
    expect(buildScheduledActivitiesListInput({ range: "upcoming" }, "2026-03-08")).toMatchObject({
      date_from: "2026-03-08",
    });
    expect(buildScheduledActivitiesListInput({ range: "past" }, "2026-03-08")).toMatchObject({
      date_to: "2026-03-07",
    });
  });

  it("uses date-key shifting across DST boundaries without elapsed-time arithmetic", () => {
    expect(buildScheduledActivitiesListInput({ range: "past" }, "2026-11-01")).toMatchObject({
      date_to: "2026-10-31",
    });
  });
});
