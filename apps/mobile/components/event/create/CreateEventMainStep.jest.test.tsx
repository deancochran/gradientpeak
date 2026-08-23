import { createHost } from "@/test/mock-components";
import { renderNative, screen } from "@/test/render-native";

jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("@/components/shared/ActivityPlanCard", () => ({
  __esModule: true,
  ActivityPlanCard: createHost("ActivityPlanCard"),
}));
jest.mock("@/components/shared/RouteCard", () => ({
  __esModule: true,
  RouteCard: createHost("RouteCard"),
}));

const { CreateEventMainStep } = require("./CreateEventMainStep");

describe("CreateEventMainStep", () => {
  it("renders only accessible unavailable-plan guidance for a read-only existing event", async () => {
    await renderNative(
      <CreateEventMainStep
        control={{}}
        draft={{
          activityPlanId: "plan-1",
          activityPlanName: "Unavailable plan",
          mode: "planned",
          notes: "",
          recurrenceEndDate: null,
          recurrenceFrequency: "none",
          routeId: null,
          routeName: null,
          scheduledDate: "2026-06-02",
          timezone: "UTC",
          title: "Unavailable plan",
        }}
        isPending={false}
        isReadOnly
        onCancel={jest.fn()}
        onChangeMode={jest.fn()}
        onOpenActivityPlan={jest.fn()}
        onOpenRepeat={jest.fn()}
        onOpenRoute={jest.fn()}
        onSubmit={jest.fn()}
        selectedActivityPlan={null}
        selectedRoute={null}
        testIDPrefix="event-detail"
      />,
    );

    expect(screen.getByText("This event is read-only on mobile")).toBeTruthy();
    expect(screen.getByText(/activity plan is unavailable/)).toBeTruthy();
    expect(screen.queryByTestId("event-detail-title-input")).toBeNull();
    expect(screen.queryByTestId("event-detail-notes-input")).toBeNull();
    expect(screen.queryByTestId("event-detail-start-date-button")).toBeNull();
    expect(screen.queryByTestId("event-detail-repeat-row")).toBeNull();
    expect(screen.queryByTestId("event-detail-save-button")).toBeNull();
    expect(screen.queryByTestId("event-detail-type-custom")).toBeNull();
    expect(screen.queryByTestId("event-detail-type-planned")).toBeNull();
    expect(screen.queryByTestId("event-detail-change-route-button")).toBeNull();
    expect(screen.queryByTestId("event-detail-remove-route-button")).toBeNull();
    expect(screen.queryByTestId("event-detail-change-activity-plan-button")).toBeNull();
    expect(screen.queryByTestId("event-detail-remove-activity-plan-button")).toBeNull();
  });
});
