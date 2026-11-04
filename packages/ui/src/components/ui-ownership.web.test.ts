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
      "FormScreen.tsx",
      "GoalCard.tsx",
      "HeaderAction.tsx",
      "HeaderButtons.tsx",
      "IndexFilterSheet.tsx",
      "IndexSearchBar.tsx",
      "LayoutPrimitives.tsx",
      "PlannedActivityCard.tsx",
      "PointInTimeDetailsSheet.tsx",
      "ProfilePreviewChart.tsx",
      "ResourceCardPrimitives.tsx",
      "ResourceList.tsx",
      "RouteCard.tsx",
      "ScreenState.tsx",
      "SearchField.tsx",
      "SearchableBottomSheetList.tsx",
      "StaticRouteMapPreview.tsx",
      "TrainingPlanCard.tsx",
      "TrainingPlanPeriodizationPreview.tsx",
      "TrainingPlanPlannedPreview.tsx",
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
      "activity-plan/activity-plan-card.tsx",
      "activity-plan/activity-plan-comments.tsx",
      "activity-plan/activity-plan-composer.tsx",
      "activity-plan/activity-plan-edit-session.tsx",
      "activity-plan/activity-plan-estimates.tsx",
      "activity-plan/activity-plan-pdf-actions.tsx",
      "activity-plan/activity-plan-session-flow.tsx",
      "activity-plan/activity-plan-structure-presentation.tsx",
      "activity-plan/activity-plan-structure.tsx",
      "activity-plan/activity-plan-timeline-chart.tsx",
      "activity-plan/planned-activity-card.tsx",
      "activity-plan/renderable-activity-plan-structure.ts",
      "activity/activity-comments-card.tsx",
      // Activity-specific playback and simulated-route workflows.
      "activity/activity-playback-card.tsx",
      "activity/canonical-metrics-row.tsx",
      "activity/plan-route-simulator.tsx",
      "activity/session-rpe-card.tsx",
      // Web Router adapter for backend navigation hrefs, not a shared UI primitive.
      "app-href-link.tsx",
      "auth-card-shell.tsx",
      "calendar/calendar-projection-card.tsx",
      "charts/simple-trend-chart.tsx",
      // Chatbot composition and its app-owned session persistence.
      "chatbot/chatbot-panel.tsx",
      "chatbot/use-chatbot.ts",
      // Existing prerequisite surfaces compose app-owned coaching server functions.
      "coaching/athletes/administrative-athlete-roster.tsx",
      "coaching/coach-access-denied.tsx",
      "coaching/coach-shell.tsx",
      // Web-only organization creation and API-backed administrative composition.
      "coaching/organization-create-form.tsx",
      "coaching/organization-groups/organization-group-detail.tsx",
      "coaching/organization-groups/organization-group-list.tsx",
      "coaching/organization-management-overview.tsx",
      "coaching/organization-selector.tsx",
      "coaching/staff/staff-roster.tsx",
      "discover/discovery-explorer.tsx",
      // Exact web route/query cache inputs, shared with this app's loaders.
      "discover/discovery-query-inputs.ts",
      "feed/activity-feed.tsx",
      "forgot-password-form.tsx",
      "groups/group-event-form.tsx",
      "groups/group-form.tsx",
      "groups/group-ui.tsx",
      "login-form.tsx",
      // Inbox retry/compose navigation uses the messages route search contract.
      "messages/messages-inbox-state.tsx",
      // Notification copy and state are specific to product activity views.
      "notifications/notifications-empty-state.tsx",
      "onboarding/provider-onboarding.tsx",
      "planning/agenda-create-form.tsx",
      "planning/goal-card.tsx",
      "planning/goal-intelligence-card.tsx",
      // Goal API projections and recorded-history query composition.
      "planning/goal-progress-chart.tsx",
      "planning/goal-progress-presentation.ts",
      "planning/plan-dashboard.tsx",
      "planning/recorded-goal-history.tsx",
      "planning/training-load-chart.tsx",
      "planning/training-load-path.tsx",
      "planning/use-recorded-goal-history.ts",
      "profile-preview-chart.tsx",
      "protected/activity-file-detail-cards.tsx",
      "protected/activity-import-form.tsx",
      "protected/activity-route-primitives.tsx",
      "protected/activity-stream-analysis-card.tsx",
      "protected/calendar-event-form.tsx",
      "protected/entity-comments-card.tsx",
      "protected/follow-action-form.tsx",
      "protected/message-action-form.tsx",
      "protected/messages-button.tsx",
      "protected/notifications-button.tsx",
      "protected/performance-model-summary.tsx",
      "protected/plan-goal-form.tsx",
      // Protected profile route error classification.
      "protected/profile-query-state.ts",
      "protected/protected-header.tsx",
      "protected/relationship-list.tsx",
      // Profile relationship route shell and TanStack Router navigation.
      "protected/relationship-page-shell.tsx",
      "protected/route-upload-form.tsx",
      "protected/search-launcher.tsx",
      "protected/user-nav.tsx",
      "providers/app-providers.tsx",
      "providers/auth-provider.tsx",
      "providers/recording-storage-boundary.tsx",
      "providers/theme-provider.tsx",
      // Recording feature composition, including plan-review actions, and app-owned opt-in street-map policy.
      "recording/geographic-route-map.tsx",
      "recording/recording-cockpit.tsx",
      "recording/recording-plan-review.tsx",
      "recording/route-preview-map.tsx",
      "route-flash-toast.tsx",
      "routes/route-edit-form.tsx",
      "routes/route-event-attachment.tsx",
      "routes/route-library-controls.tsx",
      // Settings-specific analytics consent, theme state, and section anchors.
      "settings/settings-preferences-cards.tsx",
      "settings/settings-section-navigation.tsx",
      "sign-up-form.tsx",
      "training-plan/training-plan-detail.tsx",
      "training-plan/training-plan-editor.tsx",
      "training-plan/training-plan-library-inputs.ts",
      "training-plan/training-plan-library.tsx",
      "training-plan/training-plan-model.ts",
      "training-plan/training-plan-planned-preview.tsx",
      "update-password-form.tsx",
    ]);
  });

  it("keeps nested mobile activity shared components limited to feature-owned files", () => {
    const activitySharedDir = path.join(repoRoot, "apps/mobile/components/activity/shared");
    const actualFiles = inventoryProductionTypeScriptFiles(activitySharedDir);

    expect(actualFiles).toEqual(["ActivityHeader.tsx", "ZoneDistributionCard.tsx"]);
  });
});
