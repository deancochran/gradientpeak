import { describe, expect, it } from "vitest";
import {
  createDiscoverableGroupsInput,
  createGroupEventsAfterInput,
  createUpcomingGroupEventsInput,
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
});
