import { createCalendarProjectionItem } from "../../test/calendar-projection-fixture";
import { createHost } from "../../test/mock-components";
import { renderNative, screen } from "../../test/render-native";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));

const CalendarMonthPage = require("./CalendarMonthPage").CalendarMonthPage;

describe("CalendarMonthPage", () => {
  it("renders the date and exposes the completed-load story to assistive technology", () => {
    const completed = createCalendarProjectionItem({
      id: "completed-1",
      kind: "completed_activity",
      title: "Morning run",
      calendarDate: "2026-08-19",
      status: "completed",
      metrics: [
        {
          key: "common_load",
          label: "Load",
          status: "partial",
          value: 44,
          unit: "score",
          reason: "partial_recording",
        },
        {
          key: "normalized_intensity",
          label: "Intensity",
          status: "available",
          value: 1.02,
          unit: "ratio",
          reason: null,
        },
      ],
      partial: true,
    });

    renderNative(
      <CalendarMonthPage
        activeMonthKey="2026-08-01"
        itemsByDate={new Map([["2026-08-19", [completed]]])}
        onOpenSelectedDay={jest.fn()}
        onSelectDate={jest.fn()}
        selectedDateKey="2026-08-19"
        todayKey="2026-08-19"
      />,
    );

    const cell = screen.getByTestId("calendar-day-select-2026-08-19");
    expect(cell.props.accessibilityState).toEqual({ selected: true });
    expect(cell.props.accessibilityLabel).toMatch(
      /Open agenda for 2026-08-19.*completed without a plan link.*Completed load moderate.*Intensity high.*Adherence unplanned/i,
    );
    expect(
      screen.getByTestId("calendar-day-signal-completed", { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(
      screen.getByTestId("calendar-day-number-19", { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  it("uses only planned, completed, combined, and goal marks while leaving rest days bare", () => {
    const planned = createCalendarProjectionItem({
      id: "planned",
      kind: "planned_activity",
      title: "Planned run",
      calendarDate: "2026-08-17",
      status: "scheduled",
    });
    const completed = createCalendarProjectionItem({
      id: "completed",
      kind: "completed_activity",
      title: "Completed run",
      calendarDate: "2026-08-18",
      status: "completed",
    });
    const unaccountedPlan = createCalendarProjectionItem({
      id: "unaccounted-plan",
      kind: "planned_activity",
      title: "Different planned run",
      calendarDate: "2026-08-18",
      status: "scheduled",
    });
    const goal = createCalendarProjectionItem({
      id: "goal",
      kind: "goal",
      title: "Race day",
      calendarDate: "2026-08-19",
      status: "active",
    });

    renderNative(
      <CalendarMonthPage
        activeMonthKey="2026-08-01"
        itemsByDate={
          new Map([
            ["2026-08-17", [planned]],
            ["2026-08-18", [completed, unaccountedPlan]],
            ["2026-08-19", [goal, completed]],
          ])
        }
        onOpenSelectedDay={jest.fn()}
        onSelectDate={jest.fn()}
        selectedDateKey="2026-08-20"
        todayKey="2026-08-20"
      />,
    );

    expect(
      screen.getByTestId("calendar-day-signal-planned", { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(
      screen.getByTestId("calendar-day-signal-completed-with-unaccounted-plan", {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    expect(
      screen.getByTestId("calendar-day-signal-completed-half", {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    expect(
      screen.getByTestId("calendar-day-signal-planned-half", { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(
      screen.getByTestId("calendar-day-signal-goal", { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(
      screen.getByTestId("calendar-day-number-20", { includeHiddenElements: true }),
    ).toBeTruthy();
  });
});
