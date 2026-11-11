import { describe, expect, it } from "vitest";
import {
  createDiscoverableGroupsInput,
  createGroupEventsAfterInput,
  createUpcomingGroupEventsInput,
  getGroupRouteWindowStart,
  getInfiniteQueryPageCount,
  isGroupLibraryTab,
} from "./groups-query-inputs";

describe("group route query inputs", () => {
  it("selects only supported library tabs", () => {
    expect(isGroupLibraryTab("discover")).toBe(true);
    expect(isGroupLibraryTab("unknown")).toBe(false);
  });

  it("keeps loader and component inputs structurally identical", () => {
    expect(createDiscoverableGroupsInput("local club")).toEqual({
      limit: 30,
      search: "local club",
    });
    expect(createUpcomingGroupEventsInput("2026-11-03T00:00:00.000Z")).toEqual({
      limit: 30,
      startsAfter: "2026-11-03T00:00:00.000Z",
    });
    expect(createGroupEventsAfterInput("group-1", "2026-11-03T00:00:00.000Z")).toEqual({
      groupId: "group-1",
      limit: 20,
      startsAfter: "2026-11-03T00:00:00.000Z",
    });
  });

  it("refetches every cached infinite page instead of truncating the list", () => {
    expect(getInfiniteQueryPageCount(undefined)).toBe(1);
    expect(getInfiniteQueryPageCount({ pages: [{}, {}, {}] })).toBe(3);
  });

  it("reuses one event-window key for a preload and navigation in the same minute", () => {
    const preloadSnapshot = getGroupRouteWindowStart(Date.parse("2026-11-03T15:30:01.001Z"));
    const navigationSnapshot = getGroupRouteWindowStart(Date.parse("2026-11-03T15:30:59.999Z"));

    expect(preloadSnapshot).toBe("2026-11-03T15:30:00.000Z");
    expect(createUpcomingGroupEventsInput(navigationSnapshot)).toEqual(
      createUpcomingGroupEventsInput(preloadSnapshot),
    );
  });

  it("intentionally rolls the event-window key at the next minute boundary", () => {
    expect(getGroupRouteWindowStart(Date.parse("2026-11-03T15:31:00.000Z"))).toBe(
      "2026-11-03T15:31:00.000Z",
    );
  });
});
