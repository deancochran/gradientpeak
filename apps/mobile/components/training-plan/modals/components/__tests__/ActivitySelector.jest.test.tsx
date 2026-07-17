import { createHost } from "../../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../../test/render-native";
import { type ActivityOption, ActivitySelector } from "../ActivitySelector";

const activityPlanCardMock = jest.fn(({ onPress, testID }) => {
  const React = require("react");

  return React.createElement("Pressable", { onPress, testID });
});
const emptyStateMock = jest.fn((_props: { title: string }) => null);

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  View: createHost("View"),
}));

jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("lucide-react-native", () => ({
  __esModule: true,
  CircleCheck: createHost("CircleCheck"),
}));

jest.mock("@/components/shared/SearchField", () => ({
  __esModule: true,
  SearchField: createHost("SearchField"),
}));

jest.mock("@/components/shared/ActivityPlanCard", () => ({
  __esModule: true,
  ActivityPlanCard: (props: { onPress: () => void; testID: string }) => activityPlanCardMock(props),
}));

jest.mock("@/components/shared/ScreenState", () => ({
  __esModule: true,
  EmptyState: (props: { title: string }) => emptyStateMock(props),
}));

const activities: ActivityOption[] = [
  {
    id: "tempo",
    name: "Tempo Builder",
    categories: ["run"],
    primary_category: "run",
    description: "Progressive tempo intervals.",
  },
  {
    id: "strength",
    name: "Strength Foundation",
    categories: ["strength"],
    primary_category: "strength",
  },
];

describe("ActivitySelector", () => {
  beforeEach(() => {
    activityPlanCardMock.mockClear();
    emptyStateMock.mockClear();
  });

  it("renders compact canonical cards and selects the tapped activity", () => {
    const onSelect = jest.fn();

    renderNative(
      <ActivitySelector activities={activities} onSelect={onSelect} selectedActivityId="tempo" />,
    );

    expect(activityPlanCardMock).toHaveBeenCalledWith(
      expect.objectContaining({ activityPlan: activities[0], variant: "compact" }),
    );
    expect(screen.getByTestId("activity-selector-option-tempo").props.accessibilityState).toEqual({
      disabled: false,
      selected: true,
    });

    fireEvent.press(screen.getByTestId("activity-selector-activity-plan-strength"));

    expect(onSelect).toHaveBeenCalledWith(activities[1]);
  });

  it("preserves search filtering and the shared empty state", () => {
    renderNative(
      <ActivitySelector activities={activities} onSelect={jest.fn()} selectedActivityId={null} />,
    );

    fireEvent(screen.getByLabelText("Search activities"), "changeText", "swim");

    expect(emptyStateMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "No activities match your search" }),
    );
  });

  it("prevents activity card interaction while disabled", () => {
    const onSelect = jest.fn();

    renderNative(
      <ActivitySelector
        activities={activities}
        disabled
        onSelect={onSelect}
        selectedActivityId={null}
      />,
    );

    expect(screen.getByTestId("activity-selector-option-tempo").props.pointerEvents).toBe("none");
  });
});
