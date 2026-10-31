import type { ActivityPlanDraftStep } from "@repo/core";
import { Text } from "react-native";
import { useActivityPlanCreationStore } from "@/lib/stores/activityPlanCreation";
import { act, fireEvent, renderNative, screen } from "@/test/render-native";
import { ActivityPlanComposerScreen } from "../ActivityPlanComposerScreen";

jest.mock("expo-crypto", () => ({ randomUUID: () => "repeat-id" }));
jest.mock("expo-router", () => ({
  useNavigation: () => ({}),
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => ({ profile: null }) }));
jest.mock("@/lib/api", () => ({
  api: {
    athleteIntelligence: { getReadModel: { useQuery: () => ({ data: null, isLoading: false }) } },
  },
}));
jest.mock("@/components/activity-plan/useActivityPlanBasicsForm", () => ({
  useActivityPlanBasicsForm: () => ({}),
}));
jest.mock("@/components/activity-plan/useActivityPlanComposerProcess", () => ({
  useActivityPlanComposerProcess: jest.fn(),
}));
jest.mock("@/components/activity-plan/ActivityPlanBasicsSection", () => ({
  ActivityPlanBasicsSection: () => <Text>Basics</Text>,
}));
jest.mock("@/components/activity-plan/ActivityPlanContentPreview", () => ({
  ActivityPlanContentPreview: () => <Text>Timeline</Text>,
}));
jest.mock("@/components/activity-plan/ActivityPlanEstimatePresentation", () => ({
  ActivityPlanEstimatePresentation: () => null,
}));
jest.mock("@/components/activity-plan/resolveMobileActivityPlanEstimateMetrics", () => ({
  canRetainSavedMobileActivityPlanEstimateMetrics: () => false,
  resolveMobileActivityPlanEstimateMetrics: () => null,
}));
jest.mock("react-native-draggable-flatlist", () => ({
  NestableScrollContainer: ({ children }: { children: React.ReactNode }) => children,
  NestableDraggableFlatList: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/components/activity-plan/structure/StructureBuilderCard", () => ({
  StructureBuilderCard: ({
    items,
    onAddStep,
    onAddRepeat,
    onEditStep,
  }: {
    items: ActivityPlanDraftStep[];
    onAddStep: () => void;
    onAddRepeat: () => void;
    onEditStep: (step: ActivityPlanDraftStep) => void;
  }) => (
    <>
      <Text>Structure</Text>
      <Text accessibilityRole="button" onPress={() => onAddStep()}>
        Add nested step
      </Text>
      <Text accessibilityRole="button" onPress={onAddRepeat}>
        Add nested repeat
      </Text>
      {items
        .filter((item) => item.type === "step")
        .map((item) => (
          <Text key={item.id} accessibilityRole="button" onPress={() => onEditStep(item)}>
            Edit {item.id}
          </Text>
        ))}
    </>
  ),
}));
jest.mock("@/components/activity-plan/activity/StepEditorDialog", () => ({
  StepEditorDialog: ({
    step,
    isNew,
    onDiscard,
    onSave,
  }: {
    step: ActivityPlanDraftStep;
    isNew: boolean;
    onDiscard?: () => void;
    onSave: (step: ActivityPlanDraftStep) => void;
  }) => (
    <>
      <Text testID="editing-step">{step.id}</Text>
      {isNew ? (
        <Text accessibilityRole="button" onPress={onDiscard}>
          Discard provisional step
        </Text>
      ) : null}
      <Text accessibilityRole="button" onPress={() => onSave({ ...step, name: "Edited" })}>
        Save step
      </Text>
    </>
  ),
}));
jest.mock("@/lib/hooks/forms/useActivityPlanForm", () => ({
  useActivityPlanForm: () => {
    // This remains a real Zustand subscription, so toolbar/editor actions prove production wiring.
    const store = require("@/lib/stores/activityPlanCreation").useActivityPlanCreationStore();
    return {
      form: {
        name: store.name,
        description: store.description,
        activityCategory: store.activityCategory,
        structure: store.structure,
      },
      setName: store.setName,
      setDescription: store.setDescription,
      setActivityCategory: store.setActivityCategory,
      submit: jest.fn(),
      validation: { errors: {} },
      isSubmitting: false,
      isLoading: false,
      isEditBlocked: false,
      editStatus: "editable",
      hydrationVersion: 0,
      persistedMetrics: [],
      hydratedEditPlanId: undefined,
      hydratedStructure: undefined,
      reloadFromServer: jest.fn(),
      retryLoad: jest.fn(),
      submitError: null,
    };
  },
}));

describe("ActivityPlanComposerScreen V5 composition", () => {
  beforeEach(() => useActivityPlanCreationStore.getState().reset());

  it("keeps toolbar creation disabled for an empty draft and creates category-gated root structure", async () => {
    await renderNative(<ActivityPlanComposerScreen mode="create" />);
    expect(screen.getByLabelText("Add step").props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText("Add repeat").props.accessibilityState.disabled).toBe(true);
    await act(async () => useActivityPlanCreationStore.getState().setActivityCategory("run"));
    expect(screen.getByTestId("activity-plan-add-step")).toBeTruthy();
    expect(screen.getByTestId("activity-plan-add-repeat")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Add repeat"));
    expect(useActivityPlanCreationStore.getState().structure).toMatchObject({
      version: 5,
      activity_category: "run",
      items: [{ type: "repeat", id: "repeat-id", count: 2, steps: [] }],
    });
  });

  it("discards a provisional root step but preserves an existing source until its edited save", async () => {
    useActivityPlanCreationStore.getState().setActivityCategory("run");
    await renderNative(<ActivityPlanComposerScreen mode="create" />);
    await fireEvent.press(screen.getByLabelText("Add step"));
    const provisionalId = screen.getByTestId("editing-step").props.children;
    await fireEvent.press(screen.getByText("Discard provisional step"));
    expect(useActivityPlanCreationStore.getState().structure.items).toEqual([]);

    const existing: ActivityPlanDraftStep = {
      type: "step",
      id: "existing",
      name: "Original",
      duration: { type: "time", seconds: 60 },
      targets: [],
    };
    await act(async () => useActivityPlanCreationStore.getState().insertItem(existing));
    expect(provisionalId).not.toBe("existing");
    await fireEvent.press(screen.getByText("Edit existing"));
    expect(useActivityPlanCreationStore.getState().structure.items).toEqual([existing]);
    await fireEvent.press(screen.getByText("Save step"));
    expect(useActivityPlanCreationStore.getState().structure.items).toEqual([
      expect.objectContaining({ id: "existing", name: "Edited" }),
    ]);
  });
});
