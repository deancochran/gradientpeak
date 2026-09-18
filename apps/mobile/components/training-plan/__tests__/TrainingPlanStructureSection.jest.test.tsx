import { act } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";
import { createHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";
import { TrainingPlanStructureSection } from "../TrainingPlanStructureSection";

jest.mock("@repo/ui/components/card", () => ({
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
  CardHeader: createHost("CardHeader"),
  CardTitle: createHost("CardTitle"),
}));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));

describe("TrainingPlanStructureSection", () => {
  it("renders the session-view empty state", async () => {
    await renderNative(
      <TrainingPlanStructureSection
        activityPlanNameById={new Map()}
        formatCompactDayLabel={() => "Mon · Day 1"}
        groupedStructureSessions={[]}
      />,
    );
    expect(screen.getByText(/No structured sessions found/)).toBeTruthy();
  });

  it("renders linked read content without assignment controls or an editing sheet", async () => {
    const open = jest.fn();
    await renderNative(
      <TrainingPlanStructureSection
        activityPlanNameById={new Map([["activity-1", "Tempo"]])}
        formatCompactDayLabel={() => "Mon · Day 1"}
        groupedStructureSessions={[
          {
            microcycle: 1,
            days: [
              {
                dayOffset: 0,
                sessions: [
                  {
                    key: "session-1",
                    title: "Tempo",
                    activityPlanId: "activity-1",
                    dayOffset: 0,
                  },
                ],
              },
            ],
          },
        ]}
        renderSessionActivityContent={() => (
          <Pressable testID="linked-read" onPress={open}>
            <Text>Tempo</Text>
          </Pressable>
        )}
      />,
    );
    await act(() => screen.getByTestId("linked-read").props.onPress());
    expect(open).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Change")).toBeNull();
    expect(screen.queryByText("Remove")).toBeNull();
    expect(screen.queryByText("Add")).toBeNull();
    expect(screen.queryByTestId("training-plan-activity-picker-modal")).toBeNull();
  });
});
