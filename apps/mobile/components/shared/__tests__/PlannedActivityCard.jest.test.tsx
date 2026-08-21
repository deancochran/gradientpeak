import { fireEvent } from "@testing-library/react-native";
import { createHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Pressable: createHost("Pressable"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));
jest.mock("../ActivityPlanCard", () => ({
  __esModule: true,
  ActivityPlanCard: (props: Record<string, unknown>) => createHost("ActivityPlanCard")(props),
}));
jest.mock("../ActivityPlanSummary", () => ({
  __esModule: true,
  ActivityPlanMetricsRow: (props: Record<string, unknown>) =>
    createHost("ActivityPlanMetricsRow")({
      ...props,
      testID: "planned-activity-projection-metrics",
    }),
}));
jest.mock("../ResourceCardPrimitives", () => ({
  __esModule: true,
  ResourceCardHeader: (props: Record<string, unknown>) =>
    createHost("ResourceCardHeader")({ ...props, testID: "planned-activity-card-header" }),
  ResourceCardShell: createHost("ResourceCardShell"),
  ResourceMetricsRow: (props: Record<string, unknown>) =>
    createHost("ResourceMetricsRow")({ ...props, testID: "planned-activity-card-metrics" }),
}));

const PlannedActivityCard = require("../PlannedActivityCard").PlannedActivityCard;

describe("PlannedActivityCard", () => {
  const metrics = [
    {
      key: "common_load",
      label: "Load",
      status: "available",
      value: 48,
      unit: "score",
      reason: null,
    },
    {
      key: "normalized_intensity",
      label: "Intensity",
      status: "unavailable",
      value: null,
      unit: "ratio",
      reason: "quantification_unavailable",
    },
  ];

  it("keeps a dedicated planned-activity card when the rich plan preview is unavailable", () => {
    const onPress = jest.fn();
    renderNative(
      <PlannedActivityCard
        onPress={onPress}
        plannedActivity={{
          calendarDate: "2026-04-15",
          id: "planned-1",
          metrics,
          plan: null,
          status: "scheduled",
          subtitle: "Easy aerobic work",
          title: "Morning run",
        }}
        variant="compact"
      />,
    );

    expect(screen.getByTestId("planned-activity-card-header").props.title).toBe("Morning run");
    expect(screen.getByTestId("planned-activity-projection-metrics").props.projectionMetrics).toBe(
      metrics,
    );
    expect(screen.getByTestId("planned-activity-card-metrics").props.metrics).toEqual([
      { label: "Date", value: "2026-04-15" },
      { label: "Status", value: "Planned" },
    ]);
    const card = screen.getByTestId("planned-activity-card-planned-1");
    fireEvent.press(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("reuses ActivityPlanCard when the scheduled plan preview is available", () => {
    const onPress = jest.fn();
    const plan = { id: "plan-1" };
    renderNative(
      <PlannedActivityCard
        onPress={onPress}
        plannedActivity={{
          calendarDate: "2026-04-15",
          id: "planned-1",
          metrics,
          plan,
          status: "scheduled",
          subtitle: null,
          title: "Morning run",
        }}
      />,
    );

    const card = screen.getByTestId("planned-activity-card-planned-1");
    expect(card.props.plan).toEqual({ id: "plan-1", metrics });
    fireEvent.press(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
