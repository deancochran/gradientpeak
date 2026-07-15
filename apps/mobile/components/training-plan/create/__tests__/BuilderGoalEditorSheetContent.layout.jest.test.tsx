import { createHost } from "../../../../test/mock-components";
import { renderNative } from "../../../../test/render-native";

const mockGoalEditorForm = createHost("GoalEditorForm");

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  View: createHost("View"),
}));

jest.mock("@/components/goals", () => ({
  __esModule: true,
  GoalEditorForm: mockGoalEditorForm,
}));
jest.mock("@/components/plan/GoalListItem", () => ({
  __esModule: true,
  GoalListItem: createHost("GoalListItem"),
}));
jest.mock("@/components/training-plan/PlanningGoalCard", () => ({
  __esModule: true,
  PlanningGoalCard: createHost("PlanningGoalCard"),
}));

const { BuilderLocalGoalCreateContent } = require("../BuilderGoalEditorSheetContent");

describe("BuilderLocalGoalCreateContent layout", () => {
  it("requests intrinsic form sizing for BottomSheetScrollView measurement", () => {
    const rendered = renderNative(
      <BuilderLocalGoalCreateContent onSave={jest.fn()} planStartDate="2026-07-13" />,
    );

    expect(rendered.UNSAFE_getByType(mockGoalEditorForm).props.contentSizing).toBe("intrinsic");
  });
});
