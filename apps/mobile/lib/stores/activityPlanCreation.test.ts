import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-crypto", () => ({ randomUUID: () => "00000000-0000-4000-8000-000000000099" }));

import { useActivityPlanCreationStore } from "./activityPlanCreation";

const activity = (id: string, activity_category: "run" | "bike" = "run") => ({
  id,
  role: "activity" as const,
  name: activity_category,
  activity_category,
  intervals: [],
});
const rest = {
  id: "rest",
  role: "rest" as const,
  name: "Rest",
  duration: { type: "time" as const, seconds: 60 },
};

describe("activityPlanCreation segment boundary", () => {
  beforeEach(() => {
    useActivityPlanCreationStore.setState({
      activityCategory: "run",
      structure: { version: 3, segments: [activity("run-1")] },
    });
  });

  it("rejects direct mixed-activity_category additions without changing structure", () => {
    const store = useActivityPlanCreationStore.getState();
    store.addSegment(activity("bike-1", "bike"));
    expect(useActivityPlanCreationStore.getState().structure.segments).toEqual([activity("run-1")]);
  });

  it("accepts same-activity_category activities and rest segments", () => {
    const store = useActivityPlanCreationStore.getState();
    store.addSegment(rest);
    store.addSegment(activity("run-2"));
    expect(
      useActivityPlanCreationStore.getState().structure.segments.map((segment) => segment.id),
    ).toEqual(["run-1", "rest", "run-2"]);
  });

  it("rejects invalid replacements and reorder inputs while preserving valid same-activity_category reorder", () => {
    const store = useActivityPlanCreationStore.getState();
    store.setSegments([activity("run-1"), rest]);
    store.reorderSegments([rest, activity("run-1")]);
    expect(
      useActivityPlanCreationStore.getState().structure.segments.map((segment) => segment.id),
    ).toEqual(["rest", "run-1"]);
    store.reorderSegments([activity("bike-1", "bike"), rest]);
    expect(
      useActivityPlanCreationStore.getState().structure.segments.map((segment) => segment.id),
    ).toEqual(["rest", "run-1"]);
  });
});
