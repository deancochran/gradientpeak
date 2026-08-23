import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";
import type {
  ActivityCategoryFilter,
  ActivityPlanSort,
} from "../BuilderActivityAssignmentSheetContent";
import type { BuilderSheet } from "../BuilderSheetTypes";

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("../BuilderActivityAssignmentSheetContent", () => ({
  __esModule: true,
  BuilderActivityAssignmentSheetContent: () => null,
  BuilderActivityAssignmentSheetHeader: () => null,
}));

jest.mock("../BuilderAssumptionsPreferencesForms", () => ({
  __esModule: true,
  BuilderAthleteContextForm: () => null,
  BuilderPlanPreferencesContextForm: () => null,
}));

jest.mock("../BuilderGoalEditorSheetContent", () => ({
  __esModule: true,
  BuilderGoalEditorContent: () => null,
  BuilderLocalGoalCreateContent: () => null,
}));

jest.mock("../BuilderSessionEditorSheetContent", () => ({
  __esModule: true,
  BuilderSessionEditorContent: () => null,
}));

import {
  TrainingPlanBuilderSheetDraftsProvider,
  useTrainingPlanBuilderSheetDrafts,
} from "../TrainingPlanBuilderSheetContent";

const basePlanPreferences = {
  durationWeeks: null,
  weeklySessionCount: null,
  targetWeeklyHours: null,
  restDaysPerWeek: null,
  maxSingleSessionDurationMinutes: null,
  progressionPace: null,
  recoveryPriority: null,
  weekPatternPreference: null,
  strengthIntegrationPriority: null,
  doubleDayTolerance: null,
  longSessionFatigueTolerance: null,
  taperStylePreference: null,
};

const planningConstraintFields = [
  {
    key: "durationWeeks" as const,
    label: "Duration",
    inputKind: "number" as const,
    defaultUnit: "weeks",
    helperText: "How many weeks this plan-local override should cover.",
    min: 1,
    max: 104,
    step: 1,
    value: {
      value: null,
      source: "unknown" as const,
      unit: "weeks",
      overridden: false,
    },
    visible: false,
    required: false,
    reason: null,
    canRemove: false,
  },
];

function DraftHarness() {
  const drafts = useTrainingPlanBuilderSheetDrafts();
  const preferenceDraft = drafts.planningPreferencesForm.watch();
  const [metadataApplyResult, setMetadataApplyResult] = useState<string | null>(null);

  return (
    <View>
      <Text testID="activity-filter-draft">
        {`${drafts.draftActivityPlanCategoryFilter ?? "all"}|${drafts.draftActivityPlanSort}`}
      </Text>
      <Pressable
        testID="activity-filter-set-run-name"
        onPress={() => {
          drafts.setDraftActivityPlanCategoryFilter("run");
          drafts.setDraftActivityPlanSort("name");
        }}
      />
      <Pressable testID="activity-filter-reset" onPress={drafts.resetActivityFiltersDraft} />
      <Pressable
        testID="activity-filter-cancel"
        onPress={() => drafts.cancelDraftForSheet("activityFilters")}
      />
      <Pressable testID="activity-filter-apply" onPress={drafts.applyActivityFiltersDraft} />

      <Text testID="preferences-draft">{JSON.stringify(preferenceDraft)}</Text>
      <Pressable
        testID="preferences-set-duration"
        onPress={() => drafts.updatePlanningConstraintDraft("durationWeeks", 8)}
      />
      <Pressable
        testID="preferences-clear-duration"
        onPress={() => drafts.updatePlanningConstraintDraft("durationWeeks", null)}
      />
      <Pressable
        testID="preferences-set-impossible-frequency"
        onPress={() => {
          drafts.updatePlanningConstraintDraft("weeklySessionCount", 6);
          drafts.updatePlanningConstraintDraft("restDaysPerWeek", 2);
        }}
      />
      <Text testID="preferences-can-save">{drafts.canSavePlanningPreferences ? "yes" : "no"}</Text>
      <Text testID="preferences-can-revert">
        {drafts.canResetPlanningPreferences ? "yes" : "no"}
      </Text>
      <Pressable
        testID="preferences-cancel"
        onPress={() => drafts.cancelDraftForSheet("preferences")}
      />
      <Pressable testID="preferences-apply" onPress={drafts.applyPlanningPreferencesDraft} />

      <Text testID="metadata-can-save">{drafts.canSaveMetadata ? "yes" : "no"}</Text>
      <Text testID="metadata-draft">{JSON.stringify(drafts.metadataForm.watch())}</Text>
      <Pressable
        testID="metadata-set-name"
        onPress={() =>
          drafts.metadataForm.setValue("name", "  Updated plan  ", { shouldValidate: true })
        }
      />
      <Pressable
        testID="metadata-set-invalid-name"
        onPress={() => drafts.metadataForm.setValue("name", " ", { shouldValidate: true })}
      />
      <Pressable
        testID="metadata-set-public"
        onPress={() => drafts.setDraftContentVisibility("public")}
      />
      <Pressable testID="metadata-cancel" onPress={() => drafts.cancelDraftForSheet("metadata")} />
      <Text testID="metadata-apply-result">{metadataApplyResult ?? "pending"}</Text>
      <Pressable
        testID="metadata-apply"
        onPress={() => setMetadataApplyResult(String(drafts.applyMetadataDraft()))}
      />
    </View>
  );
}

async function renderDraftHarness({
  activeSheet = "activityFilters",
  categoryFilter = "bike",
  sort = "oldest",
  onApplyActivityFilters = jest.fn(),
  onApplyPlanningPreferences = jest.fn(),
  onApplyMetadata = jest.fn(),
}: {
  activeSheet?: BuilderSheet | null;
  categoryFilter?: ActivityCategoryFilter;
  sort?: ActivityPlanSort;
  onApplyActivityFilters?: jest.Mock;
  onApplyPlanningPreferences?: jest.Mock;
  onApplyMetadata?: jest.Mock;
} = {}) {
  await renderNative(
    <TrainingPlanBuilderSheetDraftsProvider
      activeSheet={activeSheet}
      activityPlanCategoryFilter={categoryFilter}
      activityPlanSort={sort}
      planningConstraintFields={planningConstraintFields}
      planPreferences={basePlanPreferences}
      planMetadata={{ name: "Plan", description: "", contentVisibility: "private" }}
      onApplyActivityFilters={onApplyActivityFilters}
      onApplyPlanningPreferences={onApplyPlanningPreferences}
      onApplyMetadata={onApplyMetadata}
    >
      <DraftHarness />
    </TrainingPlanBuilderSheetDraftsProvider>,
  );

  return { onApplyActivityFilters, onApplyPlanningPreferences, onApplyMetadata };
}

describe("TrainingPlanBuilderSheetDraftsProvider", () => {
  it("resets, applies, and cancels activity filter drafts without committing stale values", async () => {
    const { onApplyActivityFilters } = await renderDraftHarness();

    expect(screen.getByTestId("activity-filter-draft").props.children).toBe("bike|oldest");

    await fireEvent.press(screen.getByTestId("activity-filter-set-run-name"));
    await waitFor(() => {
      expect(screen.getByTestId("activity-filter-draft").props.children).toBe("run|name");
    });

    await fireEvent.press(screen.getByTestId("activity-filter-reset"));
    await waitFor(() => {
      expect(screen.getByTestId("activity-filter-draft").props.children).toBe("all|newest");
    });
    await fireEvent.press(screen.getByTestId("activity-filter-apply"));
    expect(onApplyActivityFilters).toHaveBeenLastCalledWith({
      categoryFilter: null,
      sort: "newest",
    });

    await fireEvent.press(screen.getByTestId("activity-filter-set-run-name"));
    await fireEvent.press(screen.getByTestId("activity-filter-cancel"));
    await waitFor(() => {
      expect(screen.getByTestId("activity-filter-draft").props.children).toBe("bike|oldest");
    });
    await fireEvent.press(screen.getByTestId("activity-filter-apply"));
    expect(onApplyActivityFilters).toHaveBeenLastCalledWith({
      categoryFilter: "bike",
      sort: "oldest",
    });
  });

  it("cancels planning preference drafts before apply and only commits explicit applies", async () => {
    const { onApplyPlanningPreferences } = await renderDraftHarness({ activeSheet: "preferences" });

    expect(screen.getByTestId("preferences-can-revert").props.children).toBe("no");
    await fireEvent.press(screen.getByTestId("preferences-set-duration"));
    await waitFor(() => {
      expect(screen.getByTestId("preferences-draft").props.children).toContain("8");
      expect(screen.getByTestId("preferences-can-revert").props.children).toBe("yes");
    });

    await fireEvent.press(screen.getByTestId("preferences-clear-duration"));
    await waitFor(() => {
      expect(screen.getByTestId("preferences-can-revert").props.children).toBe("no");
    });

    await fireEvent.press(screen.getByTestId("preferences-set-duration"));
    await fireEvent.press(screen.getByTestId("preferences-cancel"));
    await waitFor(() => {
      expect(screen.getByTestId("preferences-can-revert").props.children).toBe("no");
    });
    await fireEvent.press(screen.getByTestId("preferences-apply"));
    expect(onApplyPlanningPreferences).toHaveBeenLastCalledWith(basePlanPreferences);

    await fireEvent.press(screen.getByTestId("preferences-set-duration"));
    await fireEvent.press(screen.getByTestId("preferences-apply"));
    expect(onApplyPlanningPreferences).toHaveBeenLastCalledWith({
      ...basePlanPreferences,
      durationWeeks: 8,
    });
  });

  it("blocks impossible planning preference drafts from applying", async () => {
    const { onApplyPlanningPreferences } = await renderDraftHarness({ activeSheet: "preferences" });

    expect(screen.getByTestId("preferences-can-save").props.children).toBe("yes");
    await fireEvent.press(screen.getByTestId("preferences-set-impossible-frequency"));

    await waitFor(() => {
      expect(screen.getByTestId("preferences-can-save").props.children).toBe("no");
    });

    await fireEvent.press(screen.getByTestId("preferences-apply"));
    expect(onApplyPlanningPreferences).not.toHaveBeenCalled();
  });

  it("keeps metadata local until save and restores it on cancel", async () => {
    const { onApplyMetadata } = await renderDraftHarness({ activeSheet: "metadata" });

    await fireEvent.press(screen.getByTestId("metadata-set-name"));
    await fireEvent.press(screen.getByTestId("metadata-set-public"));
    expect(onApplyMetadata).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId("metadata-cancel"));
    await waitFor(() => {
      expect(screen.getByTestId("metadata-draft").props.children).toContain('"Plan"');
    });

    await fireEvent.press(screen.getByTestId("metadata-set-name"));
    await fireEvent.press(screen.getByTestId("metadata-set-public"));
    await fireEvent.press(screen.getByTestId("metadata-apply"));
    expect(onApplyMetadata).toHaveBeenCalledWith({
      name: "Updated plan",
      description: "",
      contentVisibility: "public",
    });
  });

  it("marks invalid metadata drafts unsaveable", async () => {
    await renderDraftHarness({ activeSheet: "metadata" });
    await fireEvent.press(screen.getByTestId("metadata-set-invalid-name"));
    await waitFor(() => {
      expect(screen.getByTestId("metadata-can-save").props.children).toBe("no");
    });
    await fireEvent.press(screen.getByTestId("metadata-apply"));
    await waitFor(() => {
      expect(screen.getByTestId("metadata-apply-result").props.children).toBe("false");
    });
  });
});
