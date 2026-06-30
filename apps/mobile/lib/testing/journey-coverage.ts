import type { JourneyCoverageInput, ProductJourneyId } from "@repo/core/testing/journeys";

export type MobileJourneyCoverageManifest = Record<ProductJourneyId, JourneyCoverageInput>;

export const mobileJourneyCoverageManifest = {
  "auth.sign_in": {
    evidence: [
      {
        kind: "route_test",
        path: "app/(external)/__tests__/sign-in.jest.test.tsx",
        status: "validated",
      },
      {
        kind: "runtime_flow",
        path: ".maestro/flows/main/auth_navigation.yaml",
        status: "validated",
      },
    ],
    selectors: {
      authenticatedTab: "tab-button-plan",
      emailInput: "email-input",
      passwordInput: "password-input",
      screen: "sign-in-screen",
      submitButton: "sign-in-button",
    },
    status: "validated",
  },
  "account.onboarding": {
    evidence: [
      {
        kind: "route_test",
        path: "app/(internal)/(standard)/__tests__/onboarding.jest.test.tsx",
        status: "validated",
      },
      {
        kind: "runtime_flow",
        path: ".maestro/flows/main/onboarding_happy_path.yaml",
        status: "validated",
      },
      {
        kind: "runtime_flow",
        path: ".maestro/flows/journeys/auth/onboarding_skip_path.yaml",
        status: "validated",
      },
    ],
    selectors: {
      authenticatedTab: "tab-button-plan",
      completeButton: "onboarding-complete-button",
      screen: "onboarding-screen",
    },
    status: "validated",
  },
  "training_plan.create": {
    evidence: [
      {
        kind: "domain_test",
        path: "lib/training-plan-creation/training-plan-creation.test.ts",
        status: "validated",
      },
      {
        kind: "component_test",
        path: "components/training-plan/create/__tests__/TrainingPlanBuilderScreen.jest.test.tsx",
        status: "validated",
      },
      {
        kind: "route_test",
        path: "app/(internal)/(standard)/__tests__/training-plans-list-screen.jest.test.tsx",
        status: "validated",
      },
      {
        kind: "runtime_flow",
        path: ".maestro/flows/journeys/training-plans/create_screen_open.yaml",
        status: "validated",
      },
    ],
    selectors: {
      goalsTab: "training-plan-tab-goals",
      nameInput: "training-plan-name-input",
      reviewTab: "training-plan-tab-review",
      saveButton: "training-plan-save-button",
      screen: "training-plan-composer-screen",
    },
    status: "validated",
  },
  "activity_plan.schedule_shared": {
    evidence: [
      {
        kind: "route_test",
        path: "app/(internal)/(standard)/__tests__/activity-plan-detail-scheduling.jest.test.tsx",
        status: "validated",
      },
      {
        kind: "runtime_flow",
        path: ".maestro/flows/journeys/activity-plans/shared_duplicate_schedule_remove.yaml",
        status: "validated",
      },
    ],
    selectors: {
      detailScreen: "activity-plan-detail-screen",
      scheduleButton: "activity-plan-schedule-button",
    },
    status: "validated",
  },
  "calendar.custom_event_crud": {
    evidence: [
      {
        kind: "route_test",
        path: "app/(internal)/(tabs)/__tests__/calendar-screen.jest.test.tsx",
        status: "validated",
      },
      {
        kind: "component_test",
        path: "components/calendar/__tests__/CalendarManualCreateModal.jest.test.tsx",
        status: "validated",
      },
      {
        kind: "runtime_flow",
        path: ".maestro/flows/journeys/calendar/custom_event_create_edit_delete.yaml",
        status: "validated",
      },
    ],
    selectors: {
      calendarScreen: "calendar-screen",
      createButton: "calendar-create-button",
      eventDetailScreen: "event-detail-screen",
    },
    status: "validated",
  },
  "record.quick_start": {
    evidence: [
      {
        kind: "route_test",
        path: "app/(internal)/record/__tests__/record-screen.jest.test.tsx",
        status: "validated",
      },
      {
        kind: "component_test",
        path: "components/recording/dock/__tests__/RecordControlDock.jest.test.tsx",
        status: "validated",
      },
      {
        kind: "runtime_flow",
        path: ".maestro/flows/main/record_quick_start.yaml",
        status: "validated",
      },
      {
        kind: "runtime_flow",
        path: ".maestro/flows/journeys/record/quick_start_pause_resume_finish.yaml",
        status: "scaffold",
      },
    ],
    selectors: {
      activeSession: "record-screen-ready",
      activityScreen: "record-activity-screen",
      finishButton: "record-finish-button",
      launcher: "tab-button-record",
    },
    status: "partial",
  },
  "activity.import_fit": {
    evidence: [
      {
        kind: "route_test",
        path: "app/(internal)/(standard)/__tests__/activity-import.jest.test.tsx",
        status: "validated",
      },
      {
        kind: "runtime_flow",
        path: ".maestro/flows/journeys/integrations/historical_fit_import.yaml",
        status: "scaffold",
      },
    ],
    selectors: {
      screen: "activity-import-screen",
      selectFileButton: "activity-import-select-file-button",
      status: "activity-import-status",
    },
    status: "scaffold",
  },
  "profile.settings": {
    evidence: [
      {
        kind: "route_test",
        path: "app/(internal)/(tabs)/__tests__/profile-screen.jest.test.tsx",
        status: "validated",
      },
      {
        kind: "runtime_flow",
        path: ".maestro/flows/main/profile_screen.yaml",
        status: "validated",
      },
      {
        kind: "runtime_flow",
        path: ".maestro/flows/journeys/profile/integrations_screen_open.yaml",
        status: "validated",
      },
    ],
    selectors: {
      integrationsButton: "profile-tab-integrations",
      profileScreen: "profile-tab-screen",
      settingsSection: "profile-tab-settings",
    },
    status: "validated",
  },
  "notifications.open": {
    evidence: [
      {
        kind: "route_test",
        path: "app/(internal)/(standard)/__tests__/notifications.jest.test.tsx",
        status: "validated",
      },
      {
        kind: "runtime_flow",
        path: ".maestro/flows/journeys/notifications/inbox_open.yaml",
        status: "validated",
      },
    ],
    selectors: {
      list: "notifications-list",
      screen: "notifications-screen",
    },
    status: "validated",
  },
  "messaging.open": {
    evidence: [
      {
        kind: "route_test",
        path: "app/(internal)/(standard)/__tests__/messages-list-screen.jest.test.tsx",
        status: "validated",
      },
      {
        kind: "runtime_flow",
        path: ".maestro/flows/journeys/messaging/inbox_open.yaml",
        status: "validated",
      },
    ],
    selectors: {
      list: "messages-list",
      newMessageButton: "messages-new-button",
      screen: "messages-screen",
    },
    status: "validated",
  },
} as const satisfies MobileJourneyCoverageManifest;
