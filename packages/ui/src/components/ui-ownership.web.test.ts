import path from "node:path";

import { describe, expect, it } from "vitest";

import { inventoryProductionTypeScriptFiles } from "../test/filesystem-inventory";

const repoRoot = path.resolve(process.cwd(), "../..");

describe("UI ownership guardrails", () => {
  it("keeps mobile shared components limited to approved app-shell files", () => {
    const sharedDir = path.join(repoRoot, "apps/mobile/components/shared");
    const actualFiles = inventoryProductionTypeScriptFiles(sharedDir);

    expect(actualFiles).toEqual([
      "ActivityCard.tsx",
      "ActivityPlanAttributionRow.tsx",
      "ActivityPlanCard.tsx",
      "ActivityPlanSummary.tsx",
      "AppBottomSheet.tsx",
      "AppFormModal.tsx",
      "AppHeader.tsx",
      "AppSelectionModal.tsx",
      "ClearFieldAction.tsx",
      "CompactInsightCard.tsx",
      "DetailChartModal.tsx",
      "EntityOwnerRow.tsx",
      "HeaderAction.tsx",
      "HeaderButtons.tsx",
      "IndexFilterSheet.tsx",
      "IndexSearchBar.tsx",
      "LayoutPrimitives.tsx",
      "ResourceCardPrimitives.tsx",
      "ResourceList.tsx",
      "RouteCard.tsx",
      "ScreenState.tsx",
      "SearchField.tsx",
      "SearchableBottomSheetList.tsx",
      "SportLoadBreakdown.tsx",
      "StaticRouteMapPreview.tsx",
      "TrainingPlanCard.tsx",
      "TrainingPlanPeriodizationPreview.tsx",
      "detail/DetailDeleteConfirmModal.tsx",
      "detail/DetailOverflowMenu.tsx",
      "detail/DetailScaffold.tsx",
      "detail/DetailState.tsx",
      "detail/index.ts",
      "index.ts",
      "resource-picker/ResourcePickerModal.tsx",
      "resource-picker/ResourcePickerResultRow.tsx",
      "resource-picker/index.ts",
      "resource-picker/resourcePickerTypes.ts",
    ]);
  });

  it("keeps top-level web components limited to app-specific surfaces", () => {
    const webComponentsDir = path.join(repoRoot, "apps/web/src/components");
    const actualFiles = inventoryProductionTypeScriptFiles(webComponentsDir);

    expect(actualFiles).toEqual([
      "activity-category-presentation.tsx",
      "activity-plan/activity-plan-category-badges.tsx",
      "activity-plan/activity-plan-comments.tsx",
      "activity-plan/activity-plan-composer.tsx",
      "activity-plan/activity-plan-structure.tsx",
      "activity/activity-comments-card.tsx",
      "activity/activity-stream-details.tsx",
      "activity/session-rpe-card.tsx",
      "auth-card-shell.tsx",
      "charts/simple-trend-chart.tsx",
      "coaching/coach-access-denied.tsx",
      "coaching/coach-shell.tsx",
      "discover/discovery-explorer.tsx",
      "feed/activity-feed.tsx",
      "forgot-password-form.tsx",
      "groups/group-event-form.tsx",
      "groups/group-form.tsx",
      "groups/group-ui.tsx",
      "login-form.tsx",
      "planning/agenda-create-form.tsx",
      "planning/goal-intelligence-card.tsx",
      "planning/training-load-path.tsx",
      "protected/activity-effort-form.tsx",
      "protected/activity-import-form.tsx",
      "protected/activity-route-primitives.tsx",
      "protected/activity-stream-analysis-card.tsx",
      "protected/calendar-event-form.tsx",
      "protected/css-test-form.tsx",
      "protected/entity-comments-card.tsx",
      "protected/follow-action-form.tsx",
      "protected/message-action-form.tsx",
      "protected/messages-button.tsx",
      "protected/notifications-button.tsx",
      "protected/plan-goal-form.tsx",
      "protected/profile-metric-form.tsx",
      "protected/protected-header.tsx",
      "protected/relationship-list.tsx",
      "protected/route-upload-form.tsx",
      "protected/search-launcher.tsx",
      "protected/user-nav.tsx",
      "providers/app-providers.tsx",
      "providers/auth-provider.tsx",
      "providers/theme-provider.tsx",
      "recording/route-preview-map.tsx",
      "route-flash-toast.tsx",
      "routes/route-event-attachment.tsx",
      "routes/route-library-controls.tsx",
      "sign-up-form.tsx",
      "training-plan/training-plan-detail.tsx",
      "training-plan/training-plan-editor.tsx",
      "training-plan/training-plan-library.tsx",
      "training-plan/training-plan-model.ts",
      "training-plan/training-plan-workout-reorder.tsx",
      "training-plan/training-preferences-editor.tsx",
      "training-plan/training-preferences-form.ts",
      "trends/trends-dashboard.tsx",
      "update-password-form.tsx",
    ]);
  });

  it("keeps nested mobile activity shared components limited to feature-owned files", () => {
    const activitySharedDir = path.join(repoRoot, "apps/mobile/components/activity/shared");
    const actualFiles = inventoryProductionTypeScriptFiles(activitySharedDir);

    expect(actualFiles).toEqual(["ActivityHeader.tsx", "ZoneDistributionCard.tsx"]);
  });
});
