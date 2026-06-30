import React from "react";
import { Pressable, Text, View } from "react-native";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";
import type {
  ActivityCategoryFilter,
  ActivityPlanSort,
} from "../BuilderActivityAssignmentSheetContent";
import type { BuilderSheet } from "../BuilderSheetTypes";

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

jest.mock("../BuilderSchedulePreviewSheetContent", () => ({
  __esModule: true,
  BuilderSchedulePreviewContent: () => null,
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
};

const planningConstraintFields = [
  {
    key: "durationWeeks" as const,
    label: "Duration",
    inputKind: "number" as const,
    defaultUnit: "weeks",
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
        testID="preferences-cancel"
        onPress={() => drafts.cancelDraftForSheet("preferences")}
      />
      <Pressable testID="preferences-apply" onPress={drafts.applyPlanningPreferencesDraft} />

      <Text testID="profile-goal-can-save">{drafts.canSaveProfileGoal ? "yes" : "no"}</Text>
      <Pressable
        testID="profile-goal-set-title"
        onPress={() => drafts.profileGoalForm.setValue("title", "Raise FTP")}
      />
      <Pressable
        testID="profile-goal-cancel"
        onPress={() => drafts.cancelDraftForSheet("profileGoalCreate")}
      />
      <Pressable
        testID="profile-goal-save"
        onPress={() => drafts.saveProfileGoalDraft(jest.fn())}
      />
    </View>
  );
}

function renderDraftHarness({
  activeSheet = "activityFilters",
  categoryFilter = "bike",
  sort = "oldest",
  onApplyActivityFilters = jest.fn(),
  onApplyPlanningPreferences = jest.fn(),
}: {
  activeSheet?: BuilderSheet | null;
  categoryFilter?: ActivityCategoryFilter;
  sort?: ActivityPlanSort;
  onApplyActivityFilters?: jest.Mock;
  onApplyPlanningPreferences?: jest.Mock;
} = {}) {
  renderNative(
    <TrainingPlanBuilderSheetDraftsProvider
      activeSheet={activeSheet}
      activityPlanCategoryFilter={categoryFilter}
      activityPlanSort={sort}
      planningConstraintFields={planningConstraintFields}
      planPreferences={basePlanPreferences}
      onApplyActivityFilters={onApplyActivityFilters}
      onApplyPlanningPreferences={onApplyPlanningPreferences}
    >
      <DraftHarness />
    </TrainingPlanBuilderSheetDraftsProvider>,
  );

  return { onApplyActivityFilters, onApplyPlanningPreferences };
}

describe("TrainingPlanBuilderSheetDraftsProvider", () => {
  it("resets, applies, and cancels activity filter drafts without committing stale values", async () => {
    const { onApplyActivityFilters } = renderDraftHarness();

    expect(screen.getByTestId("activity-filter-draft").props.children).toBe("bike|oldest");

    fireEvent.press(screen.getByTestId("activity-filter-set-run-name"));
    await waitFor(() => {
      expect(screen.getByTestId("activity-filter-draft").props.children).toBe("run|name");
    });

    fireEvent.press(screen.getByTestId("activity-filter-reset"));
    await waitFor(() => {
      expect(screen.getByTestId("activity-filter-draft").props.children).toBe("all|newest");
    });
    fireEvent.press(screen.getByTestId("activity-filter-apply"));
    expect(onApplyActivityFilters).toHaveBeenLastCalledWith({
      categoryFilter: null,
      sort: "newest",
    });

    fireEvent.press(screen.getByTestId("activity-filter-set-run-name"));
    fireEvent.press(screen.getByTestId("activity-filter-cancel"));
    await waitFor(() => {
      expect(screen.getByTestId("activity-filter-draft").props.children).toBe("bike|oldest");
    });
    fireEvent.press(screen.getByTestId("activity-filter-apply"));
    expect(onApplyActivityFilters).toHaveBeenLastCalledWith({
      categoryFilter: "bike",
      sort: "oldest",
    });
  });

  it("cancels planning preference drafts before apply and only commits explicit applies", async () => {
    const { onApplyPlanningPreferences } = renderDraftHarness({ activeSheet: "preferences" });

    fireEvent.press(screen.getByTestId("preferences-set-duration"));
    await waitFor(() => {
      expect(screen.getByTestId("preferences-draft").props.children).toContain("8");
    });

    fireEvent.press(screen.getByTestId("preferences-cancel"));
    fireEvent.press(screen.getByTestId("preferences-apply"));
    expect(onApplyPlanningPreferences).toHaveBeenLastCalledWith(basePlanPreferences);

    fireEvent.press(screen.getByTestId("preferences-set-duration"));
    fireEvent.press(screen.getByTestId("preferences-apply"));
    expect(onApplyPlanningPreferences).toHaveBeenLastCalledWith({
      ...basePlanPreferences,
      durationWeeks: 8,
    });
  });

  it("clears profile goal drafts on cancel and after save", async () => {
    renderDraftHarness({ activeSheet: "profileGoalCreate" });

    fireEvent.press(screen.getByTestId("profile-goal-set-title"));
    await waitFor(() => {
      expect(screen.getByTestId("profile-goal-can-save").props.children).toBe("yes");
    });

    fireEvent.press(screen.getByTestId("profile-goal-cancel"));
    await waitFor(() => {
      expect(screen.getByTestId("profile-goal-can-save").props.children).toBe("no");
    });

    fireEvent.press(screen.getByTestId("profile-goal-set-title"));
    await waitFor(() => {
      expect(screen.getByTestId("profile-goal-can-save").props.children).toBe("yes");
    });
    fireEvent.press(screen.getByTestId("profile-goal-save"));
    await waitFor(() => {
      expect(screen.getByTestId("profile-goal-can-save").props.children).toBe("no");
    });
  });
});
