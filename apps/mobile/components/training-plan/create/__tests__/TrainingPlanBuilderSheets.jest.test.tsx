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
  type TrainingPlanBuilderSheetState,
  useTrainingPlanBuilderSheetState,
} from "../TrainingPlanBuilderSheetContent";

const basePlanPreferences = {
  weekly_session_count: null,
  target_weekly_duration_minutes: null,
  maximum_session_duration_minutes: null,
  preferred_weekdays: [],
  rest_days: [],
  progression_style: null,
  recovery_priority: null,
};

function DraftHarness({ drafts }: { drafts: TrainingPlanBuilderSheetState }) {
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
        onPress={() =>
          drafts.planningPreferencesForm.setValue("weekly_session_count", 8, { shouldDirty: true })
        }
      />
      <Pressable
        testID="preferences-clear-duration"
        onPress={() =>
          drafts.planningPreferencesForm.setValue("weekly_session_count", null, {
            shouldDirty: true,
          })
        }
      />
      <Pressable
        testID="preferences-set-impossible-frequency"
        onPress={() => {
          drafts.planningPreferencesForm.setValue("weekly_session_count", 6, { shouldDirty: true });
          drafts.planningPreferencesForm.setValue("rest_days", [0, 1], { shouldDirty: true });
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

function SheetStateHarness(props: Parameters<typeof useTrainingPlanBuilderSheetState>[0]) {
  const drafts = useTrainingPlanBuilderSheetState(props);
  return <DraftHarness drafts={drafts} />;
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
    <SheetStateHarness
      activeSheet={activeSheet}
      activityPlanCategoryFilter={categoryFilter}
      activityPlanSort={sort}
      planPreferences={basePlanPreferences}
      planMetadata={{ name: "Plan", description: "", contentVisibility: "private" }}
      onApplyActivityFilters={onApplyActivityFilters}
      onApplyPlanningPreferences={onApplyPlanningPreferences}
      onApplyMetadata={onApplyMetadata}
    />,
  );

  return { onApplyActivityFilters, onApplyPlanningPreferences, onApplyMetadata };
}

describe("useTrainingPlanBuilderSheetState", () => {
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
