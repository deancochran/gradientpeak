import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { act, fireEvent, renderNative, screen } from "../../../../test/render-native";
import { TrainingPlanBuilderSheets } from "../TrainingPlanBuilderSheets";
import type { TrainingPlanBuilderController } from "../useTrainingPlanBuilderController";

// Gorhom rehosts React elements beneath the app-level portal host. An inline
// modal mock incorrectly preserves context from the sheet's calling subtree.
const mockPortalContext = createContext<(node: ReactNode) => void>(() => undefined);
function PortalHost({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ReactNode>(null);
  return (
    <mockPortalContext.Provider value={setContent}>
      {children}
      {content}
    </mockPortalContext.Provider>
  );
}

jest.mock("@/components/shared/AppBottomSheet", () => ({
  APP_BOTTOM_SHEET_PRESENTATIONS: {
    filter: { snapPoints: ["78%"] },
    inspector: { snapPoints: ["82%"] },
    browser: { snapPoints: ["88%"] },
  },
  AppBottomSheet: ({
    children,
    footer,
    headerAction,
    onClose,
    onBack,
  }: {
    children: ReactNode;
    footer: ReactNode;
    headerAction: ReactNode;
    onClose: () => void;
    onBack?: () => void;
  }) => {
    const publish = useContext(mockPortalContext);
    useEffect(() => {
      publish(
        <View>
          {headerAction}
          {children}
          {footer}
          <Pressable testID="portal-close" onPress={onClose} />
          <Pressable testID="portal-back" onPress={onBack} />
        </View>,
      );
      return () => publish(null);
    }, [children, footer, headerAction, onClose, onBack, publish]);
    return null;
  },
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/components/shared/ActivityPlanCard", () => ({ ActivityPlanCard: () => null }));
jest.mock("../BuilderActivityAssignmentSheetContent", () => ({
  ...jest.requireActual("../BuilderActivityAssignmentSheetContent"),
  BuilderActivityAssignmentSheetContent: () => null,
  BuilderActivityAssignmentSheetHeader: () => null,
}));
jest.mock("../BuilderGoalEditorSheetContent", () => ({
  BuilderGoalEditorContent: () => null,
  BuilderLocalGoalCreateContent: () => null,
}));
jest.mock("../BuilderSessionEditorSheetContent", () => ({
  BuilderSessionEditorContent: () => null,
}));

const preferences = {
  weekly_session_count: null,
  target_weekly_duration_minutes: null,
  maximum_session_duration_minutes: null,
  preferred_weekdays: [],
  rest_days: [],
  progression_style: null,
  recovery_priority: null,
};

function createController() {
  return {
    builder: {
      state: { details: { name: "Original plan", description: "", contentVisibility: "private" } },
      derived: {
        viewModel: { sheets: { planPreferences: preferences } },
        savePlan: { isLocked: false },
      },
      actions: { updateDetails: jest.fn(), updatePlanningPreferences: jest.fn() },
    },
    activityPicker: { categoryFilter: null, sort: "newest", applyFiltersDraft: jest.fn() },
    selection: { session: null, sessionId: null },
    sheetStack: {
      activeSheet: "metadata",
      canGoBack: false,
      closeSheet: jest.fn(),
      goBackSheet: jest.fn(),
      pushSheet: jest.fn(),
    },
    actions: { cancelPendingSessionDraft: jest.fn() },
    numericDrafts: { setError: jest.fn() },
  } as unknown as TrainingPlanBuilderController;
}

it("renders metadata at a portal host without a sheet drafts provider and applies edits", async () => {
  const controller = createController();
  await renderNative(
    <PortalHost>
      <TrainingPlanBuilderSheets controller={controller} />
    </PortalHost>,
  );
  await fireEvent.changeText(screen.getByTestId("builder-plan-name-input"), "Updated plan");
  expect(controller.builder.actions.updateDetails).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId("training-plan-builder-sheet-save"));
  expect(controller.builder.actions.updateDetails).toHaveBeenCalledWith({
    name: "Updated plan",
    description: "",
    contentVisibility: "private",
  });
  expect(controller.sheetStack.closeSheet).toHaveBeenCalledTimes(1);
});

it("discards metadata on close and reopens with the current plan values", async () => {
  const controller = createController();
  const tree = () => (
    <PortalHost>
      <TrainingPlanBuilderSheets controller={controller} />
    </PortalHost>
  );
  const view = await renderNative(tree());
  await fireEvent.changeText(screen.getByTestId("builder-plan-name-input"), "Discard me");
  await fireEvent.press(screen.getByTestId("portal-close"));
  expect(controller.builder.actions.updateDetails).not.toHaveBeenCalled();
  controller.sheetStack.activeSheet = null;
  await view.rerender(tree());
  expect(screen.queryByTestId("builder-plan-name-input")).toBeNull();
  expect(controller.numericDrafts.setError).toHaveBeenCalledWith("sheet:metadata", null);
  controller.sheetStack.activeSheet = "metadata";
  await view.rerender(tree());
  expect(screen.getByTestId("builder-plan-name-input").props.value).toBe("Original plan");
});

it("ignores unavailable picker values, reverts valid drafts, and clears errors on owner close", async () => {
  const controller = createController();
  controller.sheetStack.activeSheet = "preferences";
  const tree = () => (
    <PortalHost>
      <TrainingPlanBuilderSheets controller={controller} />
    </PortalHost>
  );
  const view = await renderNative(tree());
  await fireEvent.press(screen.getByLabelText("Sessions per week"));
  await fireEvent(screen.getByLabelText("Sessions per week Value"), "valueChange", 0);
  await fireEvent.press(screen.getByLabelText("Done Sessions per week"));
  await view.rerender(tree());
  expect(screen.getByLabelText("Sessions per week").props.accessibilityValue).toEqual({
    text: "Not set",
  });
  // Zero is not an offered option. Only a deliberate valid selection changes the draft.
  await fireEvent.press(screen.getByLabelText("Sessions per week"));
  await fireEvent(screen.getByLabelText("Sessions per week Value"), "valueChange", 4);
  await fireEvent.press(screen.getByLabelText("Done Sessions per week"));
  expect(screen.getByLabelText("Sessions per week").props.accessibilityValue).toEqual({
    text: "4",
  });
  expect(controller.builder.actions.updatePlanningPreferences).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText("Revert changes"));
  expect(screen.getByLabelText("Sessions per week").props.accessibilityValue).toEqual({
    text: "Not set",
  });
  await fireEvent.press(screen.getByLabelText("Sessions per week"));
  await fireEvent(screen.getByLabelText("Sessions per week Value"), "valueChange", 3);
  await fireEvent.press(screen.getByLabelText("Done Sessions per week"));
  // Programmatic close also discards the state, without relying on onClose.
  controller.sheetStack.activeSheet = null;
  await view.rerender(tree());
  expect(controller.numericDrafts.setError).toHaveBeenLastCalledWith(expect.any(String), null);
  expect(controller.numericDrafts.setError).toHaveBeenCalledWith(
    "preferences:weekly_session_count",
    null,
  );
  expect(controller.numericDrafts.setError).toHaveBeenCalledWith("sheet:preferences", null);
  controller.sheetStack.activeSheet = "preferences";
  await view.rerender(tree());
  expect(screen.getByLabelText("Sessions per week").props.accessibilityValue).toEqual({
    text: "Not set",
  });
  await fireEvent.press(screen.getByLabelText("Sessions per week"));
  await fireEvent(screen.getByLabelText("Sessions per week Value"), "valueChange", 4);
  await fireEvent.press(screen.getByLabelText("Done Sessions per week"));
  await fireEvent.press(screen.getByTestId("training-plan-builder-sheet-save"));
  expect(controller.builder.actions.updatePlanningPreferences).toHaveBeenCalledWith({
    ...preferences,
    weekly_session_count: 4,
  });
});

it("rejects queued Apply from a closed sheet", async () => {
  const controller = createController();
  const tree = () => (
    <PortalHost>
      <TrainingPlanBuilderSheets controller={controller} />
    </PortalHost>
  );
  const view = await renderNative(tree());
  await fireEvent.changeText(screen.getByTestId("builder-plan-name-input"), "Expired edit");
  const queuedApply = screen.getByTestId("training-plan-builder-sheet-save").props.onPress;
  controller.sheetStack.activeSheet = null;
  await view.rerender(tree());
  await act(() => queuedApply());
  expect(controller.builder.actions.updateDetails).not.toHaveBeenCalled();
});

it("renders the filter footer through the portal and cancels nested changes before applying", async () => {
  const controller = createController();
  controller.sheetStack.activeSheet = "activityFilters";
  controller.sheetStack.canGoBack = true;
  controller.activityPicker.categoryFilter = "bike";
  const tree = () => (
    <PortalHost>
      <TrainingPlanBuilderSheets controller={controller} />
    </PortalHost>
  );
  const view = await renderNative(tree());
  await fireEvent.press(screen.getByText("Clear filters"));
  expect(controller.activityPicker.applyFiltersDraft).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId("portal-back"));
  expect(controller.sheetStack.goBackSheet).toHaveBeenCalledTimes(1);
  controller.sheetStack.activeSheet = "activityAssignment";
  await view.rerender(tree());
  controller.sheetStack.activeSheet = "activityFilters";
  await view.rerender(tree());
  await fireEvent.press(screen.getByTestId("training-plan-builder-sheet-save"));
  expect(controller.activityPicker.applyFiltersDraft).toHaveBeenCalledWith({
    categoryFilter: "bike",
    sort: "newest",
  });
});
