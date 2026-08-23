import { createCalendarProjectionItem } from "../../../test/calendar-projection-fixture";
import { createHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";
import { CalendarScheduleObjectCard } from "../CalendarTimelineRows";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
}));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("@/lib/hooks/usePreferredUnitSystem", () => ({
  usePreferredUnitSystem: () => "metric",
}));

describe("CalendarScheduleObjectCard", () => {
  it("renders expired planned sessions as unverified with accessible completion copy", async () => {
    await renderNative(
      <CalendarScheduleObjectCard
        object={createCalendarProjectionItem({
          id: "event-1",
          kind: "planned_activity",
          title: "Recovery ride",
          subtitle: "No completion recorded",
          status: "expired",
          timing: {
            startsAt: "2026-03-01T09:00:00.000Z",
            endsAt: "2026-03-01T10:00:00.000Z",
            allDay: false,
            timezone: "UTC",
          },
          event: {
            type: "planned",
            trainingPlanId: null,
          },
        })}
      />,
    );

    expect(screen.getByText("Unverified")).toBeTruthy();
    expect(screen.getByText("No completion recorded")).toBeTruthy();
    expect(screen.getByLabelText(/Unverified, Recovery ride, No completion recorded/)).toBeTruthy();
  });

  it("renders a cancelled linked session as cancelled rather than completed", async () => {
    await renderNative(
      <CalendarScheduleObjectCard
        object={createCalendarProjectionItem({
          id: "event-cancelled",
          kind: "planned_activity",
          title: "Cancelled ride",
          status: "cancelled",
          timing: {
            startsAt: "2026-03-01T09:00:00.000Z",
            endsAt: "2026-03-01T10:00:00.000Z",
            allDay: false,
            timezone: "UTC",
          },
          event: {
            type: "planned",
            trainingPlanId: null,
          },
        })}
      />,
    );

    expect(screen.getByText("Cancelled")).toBeTruthy();
    expect(screen.queryByText("Completed")).toBeNull();
    expect(screen.getByLabelText(/Cancelled, Cancelled ride/)).toBeTruthy();
  });

  it("uses the recorded completed activity name", async () => {
    await renderNative(
      <CalendarScheduleObjectCard
        object={createCalendarProjectionItem({
          id: "activity-1",
          kind: "completed_activity",
          title: "Auto-generated morning ride",
          timing: {
            startsAt: "2026-03-01T09:00:00.000Z",
            endsAt: null,
            allDay: false,
            timezone: "UTC",
          },
        })}
      />,
    );

    expect(screen.getByText("Auto-generated morning ride")).toBeTruthy();
    expect(screen.getByLabelText(/^Done, Auto-generated morning ride/)).toBeTruthy();
  });

  it("emphasizes useful metrics without unavailable placeholders", async () => {
    await renderNative(
      <CalendarScheduleObjectCard
        object={createCalendarProjectionItem({
          id: "activity-partial",
          kind: "completed_activity",
          title: "Partially quantified run",
          metrics: [
            {
              key: "common_load",
              label: "Load",
              status: "partial",
              value: 42,
              unit: "score",
              reason: "quantification_partial",
            },
            {
              key: "normalized_intensity",
              label: "Intensity",
              status: "unavailable",
              value: null,
              unit: "ratio",
              reason: "quantification_unavailable",
            },
          ],
          partial: true,
        })}
      />,
    );

    expect(screen.getByText(/Load 42 · Incomplete/)).toBeTruthy();
    expect(screen.queryByText(/Intensity unavailable/)).toBeNull();
    expect(screen.queryByText(/Load 0|Intensity 0\.00/)).toBeNull();
  });

  it("renders a cross-date group event in its event timezone", async () => {
    await renderNative(
      <CalendarScheduleObjectCard
        object={createCalendarProjectionItem({
          id: "tokyo-event",
          kind: "group_event",
          title: "Tokyo start",
          calendarDate: "2026-05-01",
          timing: {
            startsAt: "2026-04-30T15:30:00.000Z",
            endsAt: null,
            allDay: false,
            timezone: "Asia/Tokyo",
          },
          groupEvent: {
            group: { id: "group-1", name: "Tokyo runners" },
            viewerRsvpStatus: null,
          },
        })}
      />,
    );

    expect(screen.getByText("Tokyo start")).toBeTruthy();
    expect(screen.getByText("12:30 AM")).toBeTruthy();
  });
});
