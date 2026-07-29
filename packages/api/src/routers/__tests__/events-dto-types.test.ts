import type { CanonicalActivityCategory } from "@repo/core";
import type { inferRouterOutputs } from "@trpc/server";
import { describe, expect, it } from "vitest";
import type { AppRouter } from "..";

type Assert<T extends true> = T;
type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2 ? true : false;
type EventOutputs = inferRouterOutputs<AppRouter>["events"];
type NestedPlan<T> = NonNullable<T extends { activity_plan: infer Plan } ? Plan : never>;

type DetailPlan = NestedPlan<EventOutputs["getById"]>;
type TodayPlan = NestedPlan<EventOutputs["getToday"][number]>;
type ListPlan = NestedPlan<EventOutputs["list"]["items"][number]>;
type PlannedDaySummary = EventOutputs["plannedDaySummary"];
type _detailActivityCategoryIsCanonical = Assert<
  Equal<DetailPlan["activity_category"], CanonicalActivityCategory>
>;
type _todayActivityCategoryIsCanonical = Assert<
  Equal<TodayPlan["activity_category"], CanonicalActivityCategory>
>;
type _listActivityCategoryIsCanonical = Assert<
  Equal<ListPlan["activity_category"], CanonicalActivityCategory>
>;
type _plannedDaySummaryIsTyped = Assert<
  Equal<
    PlannedDaySummary["summary"],
    {
      eventCount: number;
      activity_categories: CanonicalActivityCategory[];
      totalDurationSeconds: number | null;
      totalTss: number | null;
    }
  >
>;
type _plannedDaySummarySourceIsTyped = Assert<
  Equal<
    PlannedDaySummary["source"],
    {
      complete: true;
      eventCount: number;
      unavailableEstimateCount: number;
      unavailablePlanCount: number;
      unlinkedPlanCount: number;
    }
  >
>;

describe("Event DTO public type contract", () => {
  it("keeps canonical plan activity category in AppRouter outputs", () => {
    expect(true).toBe(true);
  });
});
