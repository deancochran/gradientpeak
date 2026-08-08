import type {
  ActivityPrescriptionQuantificationBundle,
  CanonicalActivityCategory,
  CommonLoadAggregate,
} from "@repo/core";
import type { inferRouterOutputs } from "@trpc/server";
import { describe, expect, it } from "vitest";
import type { AppRouter } from "..";

type Assert<T extends true> = T;
type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2 ? true : false;
type EventOutputs = inferRouterOutputs<AppRouter>["events"];
type CalendarOutputs = inferRouterOutputs<AppRouter>["calendar"];
type NestedPlan<T> = NonNullable<T extends { activity_plan: infer Plan } ? Plan : never>;

type DetailPlan = NestedPlan<EventOutputs["getById"]>;
type TodayPlan = NestedPlan<CalendarOutputs["day"]["items"][number]>;
type ListPlan = NestedPlan<CalendarOutputs["range"]["items"][number]>;
type PlannedDaySummary = CalendarOutputs["day"]["plannedLoadSummary"];
type RangePlannedDaySummary = CalendarOutputs["range"]["plannedLoadSummaries"]["items"][number];
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
    Omit<PlannedDaySummary, "date" | "timezone">["summary"],
    {
      eventCount: number;
      activity_categories: CanonicalActivityCategory[];
      totalDurationSeconds: number | null;
      prescriptionQuantification: ActivityPrescriptionQuantificationBundle;
      commonLoad: CommonLoadAggregate;
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
type _rangePlannedDaySummaryMatchesDay = Assert<Equal<RangePlannedDaySummary, PlannedDaySummary>>;

describe("Event DTO public type contract", () => {
  it("keeps canonical plan activity category in AppRouter outputs", () => {
    expect(true).toBe(true);
  });
});
