import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";
import { ResourcePickerResultRow } from "../ResourcePickerResultRow";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Pressable: createHost("Pressable"),
  View: createHost("View"),
}));

jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("@/components/shared/ActivityPlanCard", () => ({
  __esModule: true,
  ActivityPlanCard: (props: Record<string, unknown>) =>
    jest.requireActual("react").createElement("ActivityPlanCard", {
      ...props,
      testID: "resource-picker-activity-plan-card",
    }),
}));
jest.mock("@/components/shared/RouteCard", () => ({
  __esModule: true,
  RouteCard: (props: Record<string, unknown>) =>
    jest.requireActual("react").createElement("RouteCard", {
      ...props,
      testID: "resource-picker-route-card",
    }),
}));
jest.mock("@/lib/activityPlanMetrics", () => ({
  __esModule: true,
  getAuthoritativeActivityPlanMetrics: jest.fn(() => ({})),
}));
jest.mock("@/lib/constants/activities", () => ({
  __esModule: true,
  getActivityCategoryConfig: jest.fn(() => ({
    bgColor: "bg-muted",
    color: "text-foreground",
    icon: "Icon",
    name: "Other",
  })),
}));
jest.mock("@/lib/estimatedMetrics", () => ({
  __esModule: true,
  formatEstimatedDurationSeconds: jest.fn(),
  formatEstimatedTss: jest.fn(),
}));

describe("ResourcePickerResultRow", () => {
  it("renders an activity plan through the dense canonical card while preserving selection", () => {
    const onPress = jest.fn();

    renderNative(
      <ResourcePickerResultRow
        isSelected
        item={{
          activityPlanCardData: {
            activityType: "outdoor_run",
            id: "plan-1",
            name: "Tempo Builder",
          },
          id: "plan-1",
          name: "Tempo Builder",
        }}
        onPress={onPress}
        scope="activityPlans"
      />,
    );

    expect(screen.getByTestId("resource-picker-activity-plan-card").props.variant).toBe("list");
    expect(screen.getByTestId("resource-picker-result-selected-plan-1")).toBeTruthy();
    fireEvent.press(screen.getByTestId("resource-picker-result-plan-1"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("renders routes through the list card without map, social, or attribution affordances", () => {
    renderNative(
      <ResourcePickerResultRow
        isSelected={false}
        item={{
          id: "route-1",
          name: "River Loop",
          routeCardData: { id: "route-1", name: "River Loop", total_distance: 5000 },
        }}
        onPress={jest.fn()}
        scope="routes"
      />,
    );

    const routeCard = screen.getByTestId("resource-picker-route-card");
    expect(routeCard.props.variant).toBe("list");
    expect(routeCard.props.showAttribution).toBe(false);
    expect(routeCard.props.showLike).toBe(false);
  });

  it("keeps legacy items selectable and disabled when canonical card data is unavailable", () => {
    renderNative(
      <ResourcePickerResultRow
        disabled
        isSelected={false}
        item={{ id: "legacy-route", name: "Imported route" }}
        onPress={jest.fn()}
        scope="routes"
      />,
    );

    const result = screen.getByTestId("resource-picker-result-legacy-route");
    expect(result.props.disabled).toBe(true);
    expect(screen.queryByTestId("resource-picker-route-card")).toBeNull();
  });
});
