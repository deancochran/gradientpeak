import { fireEvent, render } from "@testing-library/react-native";
import { createElement, type ReactNode } from "react";
import { Alert, Text } from "react-native";

const formHookMock = jest.fn();
const basicsPropsMock = jest.fn();
const nestableScrollContainerMock = jest.fn(
  ({ children, ...props }: Record<string, unknown> & { children?: ReactNode }) =>
    createElement("NestableScrollContainer", props, children),
);
const mockActivityStore = {
  addInterval: jest.fn(),
  addSegment: jest.fn(),
  addStepToInterval: jest.fn(),
  copyInterval: jest.fn(),
  copyStepInInterval: jest.fn(),
  removeInterval: jest.fn(),
  removeSegment: jest.fn(),
  removeStepFromInterval: jest.fn(),
  reorderSegments: jest.fn(),
  setStructure: jest.fn(),
  updateInterval: jest.fn(),
  updateSegment: jest.fn(),
  updateStepInInterval: jest.fn(),
};

jest.mock("@gorhom/bottom-sheet", () => ({
  __esModule: true,
  default: () => null,
  BottomSheetBackdrop: () => null,
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => "1"), setItem: jest.fn() },
}));
jest.mock("expo-crypto", () => ({
  randomUUID: () => "00000000-0000-4000-8000-000000000099",
}));
jest.mock("expo-router", () => ({
  useNavigation: () => ({
    addListener: jest.fn(() => jest.fn()),
    setOptions: jest.fn(),
  }),
  useRouter: () => ({ back: jest.fn() }),
}));
jest.mock("react-native-draggable-flatlist", () => ({
  NestableScrollContainer: (props: Record<string, unknown> & { children?: ReactNode }) =>
    nestableScrollContainerMock(props),
}));
jest.mock("@/components/activity-plan/ActivityPlanBasicsSection", () => ({
  ActivityPlanBasicsSection: (props: unknown) => {
    basicsPropsMock(props);
    return null;
  },
}));
jest.mock("@/components/activity-plan/structure/StructureBuilderCard", () => ({
  StructureBuilderCard: ({
    onDeleteInterval,
  }: {
    onDeleteInterval: (intervalId: string) => void;
  }) =>
    createElement(
      "Pressable",
      { onPress: () => onDeleteInterval("00000000-0000-4000-8000-000000000002") },
      createElement(Text, null, "Delete interval"),
    ),
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
  useActivityPlanCreationStore: () => mockActivityStore,
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
  beforeEach(() => {
    basicsPropsMock.mockClear();
    Object.values(mockActivityStore).forEach((fn) => {
      fn.mockClear();
    });
  });
  it("passes pending ownership to metadata controls and announces saving", async () => {
    formHookMock.mockReturnValue({ ...blockedForm(), isEditBlocked: false, isSubmitting: true });
    const view = await render(<ActivityPlanComposerScreen mode="create" />);
    expect(basicsPropsMock).toHaveBeenLastCalledWith(expect.objectContaining({ disabled: true }));
    expect(view.getByText("Saving activity plan...")).toBeTruthy();
  });

  it("retries the read without invoking the destructive conflict reload action", async () => {
    const retryLoad = jest.fn(async () => undefined);
    const reloadFromServer = jest.fn(async () => true);
    formHookMock.mockReturnValue({
      ...blockedForm(),
      editStatus: "error",
      retryLoad,
      reloadFromServer,
    });
    const view = await render(<ActivityPlanComposerScreen mode="edit" planId="plan-1" />);
    await fireEvent.press(view.getByText("Retry"));
    expect(retryLoad).toHaveBeenCalledTimes(1);
    expect(reloadFromServer).not.toHaveBeenCalled();
  });
  it("renders an unavailable plan without mounting editable composer content", async () => {
    formHookMock.mockReturnValue(blockedForm());

    const screen = await render(<ActivityPlanComposerScreen mode="edit" planId="unknown-plan" />);

    expect(screen.getByText("Plan unavailable")).toBeTruthy();
  });

  it("keeps the sole activity section while still allowing legacy rest removal", async () => {
    formHookMock.mockReturnValue({
      form: {
        name: "Legacy plan",
        description: "",
        notes: "",
        activityCategory: "run",
        structure: {
          version: 3,
          activity_category: "run",
          segments: [
            {
              id: "00000000-0000-4000-8000-000000000001",
              role: "activity",
              name: "Run",
              intervals: [
                {
                  id: "00000000-0000-4000-8000-000000000002",
                  name: "Main",
                  repetitions: 1,
                  steps: [
                    {
                      id: "00000000-0000-4000-8000-000000000003",
                      name: "Run",
                      duration: { type: "time", seconds: 60 },
                      targets: [{ type: "RPE", intensity: 5 }],
                    },
                  ],
                },
              ],
            },
            {
              id: "00000000-0000-4000-8000-000000000004",
              role: "rest",
              name: "Rest",
              duration: { type: "time", seconds: 60 },
            },
          ],
        },
      },
      setName: jest.fn(),
      setDescription: jest.fn(),
      setActivityCategory: jest.fn(),
      setNotes: jest.fn(),
      submit: jest.fn(),
      validation: { errors: {} },
      canSubmit: true,
      isSubmitting: false,
      isLoading: false,
      isEditBlocked: false,
      editStatus: "editable",
      hydrationVersion: 0,
      reloadFromServer: jest.fn(async () => true),
    });

    const screen = await render(<ActivityPlanComposerScreen mode="edit" planId="plan-1" />);
    await fireEvent.press(screen.getByText("Section details"));

    expect(screen.getAllByText("Remove section")).toHaveLength(1);
  });

  it("keeps the draft intact when interval deletion is cancelled", async () => {
    formHookMock.mockReturnValue({
      ...blockedForm(),
      canSubmit: true,
      editStatus: "editable",
      form: {
        ...blockedForm().form,
        structure: {
          version: 3,
          activity_category: "run",
          segments: [
            {
              id: "00000000-0000-4000-8000-000000000001",
              role: "activity",
              name: "Run",
              intervals: [
                {
                  id: "00000000-0000-4000-8000-000000000002",
                  name: "Main",
                  repetitions: 1,
                  steps: [],
                },
              ],
            },
          ],
        },
      },
      hydrationVersion: 0,
      isEditBlocked: false,
      reloadFromServer: jest.fn(async () => true),
    });
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);

    const screen = await render(<ActivityPlanComposerScreen mode="create" />);
    await fireEvent.press(screen.getByText("Delete interval"));

    const [, , actions] = alertSpy.mock.calls[0] ?? [];
    actions?.find((action) => action.style === "cancel")?.onPress?.();
    expect(mockActivityStore.removeInterval).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("uses direct ScrollView content styles for the composer gutters", async () => {
    formHookMock.mockReturnValue({
      ...blockedForm(),
      canSubmit: true,
      editStatus: "editable",
      hydrationVersion: 0,
      isEditBlocked: false,
      reloadFromServer: jest.fn(async () => true),
      form: {
        ...blockedForm().form,
        structure: {
          version: 3,
          activity_category: "run",
          segments: [
            {
              id: "00000000-0000-4000-8000-000000000001",
              role: "activity",
              name: "Run",
              intervals: [],
            },
          ],
        },
      },
    });

    await render(<ActivityPlanComposerScreen mode="create" />);
    const scroll = nestableScrollContainerMock.mock.calls.at(-1)?.[0];

    expect(scroll?.className).toBe("flex-1");
    expect(scroll?.contentContainerClassName).toBeUndefined();
    expect(scroll?.contentContainerStyle).toEqual({
      paddingBottom: 24,
      paddingHorizontal: 24,
      paddingTop: 16,
    });
  });
});
