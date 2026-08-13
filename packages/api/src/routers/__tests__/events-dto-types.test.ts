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
type DetailPlan = NonNullable<EventOutputs["getById"]["activityPlanSummary"]>;
type TodayPlan = NonNullable<CalendarOutputs["day"]["projection"]["items"][number]["plan"]>;
type ListPlan = NonNullable<CalendarOutputs["range"]["items"][number]["plan"]>;
type PlannedDaySummary = CalendarOutputs["day"]["plannedLoadSummary"];
type _detailActivityCategoryIsCanonical = Assert<
  Equal<DetailPlan["activityCategory"], CanonicalActivityCategory>
>;
type _todayActivityCategoryIsCanonical = Assert<
  Equal<TodayPlan["activityCategory"], CanonicalActivityCategory>
>;
type _listActivityCategoryIsCanonical = Assert<
  Equal<ListPlan["activityCategory"], CanonicalActivityCategory>
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
describe("Event DTO public type contract", () => {
  it("keeps canonical plan activity category in AppRouter outputs", () => {
    expect(true).toBe(true);
  });
});
