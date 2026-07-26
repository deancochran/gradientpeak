import type { CalendarEvent } from "@/lib/calendar/normalizeEvents";
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
  it("renders expired planned sessions as unverified with accessible completion copy", () => {
    renderNative(
      <CalendarScheduleObjectCard
        object={{
          id: "event-1",
          type: "event",
          event: {
            id: "event-1",
            event_type: "planned",
            status: "expired",
            title: "Recovery ride",
            starts_at: "2026-03-01T09:00:00.000Z",
            ends_at: "2026-03-01T10:00:00.000Z",
          } as CalendarEvent,
        }}
      />,
    );

    expect(screen.getByText("Unverified")).toBeTruthy();
    expect(screen.getByText("No completion recorded")).toBeTruthy();
    expect(screen.getByLabelText(/Unverified, Recovery ride, No completion recorded/)).toBeTruthy();
  });

  it("renders a cancelled linked session as cancelled rather than completed", () => {
    renderNative(
      <CalendarScheduleObjectCard
        object={{
          id: "event-cancelled",
          type: "event",
          event: {
            id: "event-cancelled",
            event_type: "planned",
            status: "cancelled",
            linked_activity_id: "activity-cancelled",
            title: "Cancelled ride",
            starts_at: "2026-03-01T09:00:00.000Z",
            ends_at: "2026-03-01T10:00:00.000Z",
          } as CalendarEvent,
        }}
      />,
    );

    expect(screen.getByText("Cancelled")).toBeTruthy();
    expect(screen.queryByText("Completed")).toBeNull();
    expect(screen.getByLabelText(/Cancelled, Cancelled ride/)).toBeTruthy();
  });
});
