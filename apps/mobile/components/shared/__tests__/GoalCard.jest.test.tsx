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
jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));
jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("../ResourceCardPrimitives", () => ({
  __esModule: true,
  ResourceCardHeader: ({ description, title }: { description?: string; title?: string }) =>
    createHost("ResourceCardHeader")({
      children: [title, description],
      testID: "goal-card-header",
    }),
  ResourceCardShell: createHost("ResourceCardShell"),
  ResourceMetricsRow: ({ metrics }: { metrics: { label: string; value: string }[] }) =>
    createHost("ResourceMetricsRow")({
      children: metrics.flatMap((metric) => [metric.label, metric.value]),
      testID: "goal-card-metrics",
    }),
}));

const GoalCard = require("../GoalCard").GoalCard;

describe("GoalCard", () => {
  it("renders canonical goal identity and opens the goal", () => {
    const onPress = jest.fn();
    renderNative(
      <GoalCard
        goal={{
          id: "goal-1",
          objectiveSummary: "Finish under four hours",
          targetDate: "2026-10-18",
          title: "Autumn marathon",
          typeLabel: "Race",
        }}
        onPress={onPress}
      />,
    );

    expect(screen.getByTestId("goal-card-header").props.children).toEqual([
      "Autumn marathon",
      "Finish under four hours",
    ]);
    expect(screen.getByTestId("goal-card-metrics").props.children).toEqual([
      "Goal type",
      "Race",
      "Target date",
      "Oct 18, 2026",
    ]);
    const card = screen.getByTestId("goal-card-goal-1");
    expect(card.props.accessibilityLabel).toBe("Open goal Autumn marathon");
    fireEvent.press(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
