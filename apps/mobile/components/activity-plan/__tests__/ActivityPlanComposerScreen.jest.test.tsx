import { render } from "@testing-library/react-native";

const formHookMock = jest.fn();

jest.mock("@gorhom/bottom-sheet", () => ({
  __esModule: true,
  default: () => null,
  BottomSheetBackdrop: () => null,
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => "1"), setItem: jest.fn() },
}));
jest.mock("expo-crypto", () => ({ randomUUID: () => "00000000-0000-4000-8000-000000000099" }));
jest.mock("expo-router", () => ({
  useNavigation: () => ({ addListener: jest.fn(() => jest.fn()), setOptions: jest.fn() }),
  useRouter: () => ({ back: jest.fn() }),
}));
jest.mock("react-native-draggable-flatlist", () => ({
  NestableScrollContainer: "NestableScrollContainer",
}));
jest.mock("@/components/activity-plan/ActivityPlanBasicsSection", () => ({
  ActivityPlanBasicsSection: () => "EditableBasics",
}));
jest.mock("@/components/activity-plan/structure/StructureBuilderCard", () => ({
  StructureBuilderCard: () => "EditableStructure",
}));
jest.mock("@/components/activity-plan/structure/StructureIntervalSheet", () => ({
  StructureIntervalSheet: () => null,
}));
jest.mock("@/components/activity-plan/useActivityPlanBasicsForm", () => ({
  useActivityPlanBasicsForm: () => ({}),
}));
jest.mock("@/components/activity-plan/useActivityPlanComposerProcess", () => ({
  useActivityPlanComposerProcess: jest.fn(),
}));
jest.mock("@/components/activity-plan/activity/StepEditorDialog", () => ({
  StepEditorDialog: () => null,
}));
jest.mock("@/components/shared/AppBottomSheet", () => ({
  APP_BOTTOM_SHEET_PRESENTATIONS: {
    inspector: { initialSnapIndex: 0, snapPoints: ["82%", "96%"] },
  },
  AppBottomSheet: "AppBottomSheet",
  AppBottomSheetContent: "AppBottomSheetContent",
}));
jest.mock("@/lib/api", () => ({
  api: {
    athleteIntelligence: {
      getReadModel: { useQuery: () => ({ data: undefined }) },
    },
  },
}));
jest.mock("@/lib/hooks/forms/useActivityPlanForm", () => ({
  useActivityPlanForm: () => formHookMock(),
}));
jest.mock("@/lib/stores/activityPlanCreation", () => ({
  useActivityPlanCreationStore: () => ({
    addInterval: jest.fn(),
    addSegment: jest.fn(),
    addStepToInterval: jest.fn(),
    copyInterval: jest.fn(),
    removeInterval: jest.fn(),
    removeSegment: jest.fn(),
    removeStepFromInterval: jest.fn(),
    reorderSegments: jest.fn(),
    setStructure: jest.fn(),
    updateInterval: jest.fn(),
    updateSegment: jest.fn(),
    updateStepInInterval: jest.fn(),
  }),
}));

import { ActivityPlanComposerScreen } from "../ActivityPlanComposerScreen";

function blockedForm() {
  return {
    form: {
      name: "",
      description: "",
      notes: "",
      activityCategory: "run",
      structure: { version: 3, segments: [] },
    },
    setName: jest.fn(),
    setDescription: jest.fn(),
    setActivityCategory: jest.fn(),
    submit: jest.fn(),
    validation: { errors: {} },
    canSubmit: false,
    isSubmitting: false,
    isLoading: false,
    isEditBlocked: true,
    editStatus: "unavailable",
  };
}

describe("ActivityPlanComposerScreen blocked edit routes", () => {
  it("renders an unavailable plan without mounting editable composer content", async () => {
    formHookMock.mockReturnValue(blockedForm());

    const screen = await render(<ActivityPlanComposerScreen mode="edit" planId="unknown-plan" />);

    expect(screen.getByText("Plan unavailable")).toBeTruthy();
    expect(screen.queryByText("EditableBasics")).toBeNull();
    expect(screen.queryByText("EditableStructure")).toBeNull();
  });
});
