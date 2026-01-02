import { Stack } from "expo-router";

/**
 * Standard Internal Pages Layout - Flat Stack Architecture
 *
 * This layout handles all non-tab, non-record internal pages.
 * All pages are at the root level for simplicity and consistency.
 *
 * These pages display as modal-style cards with:
 * - Header with page title
 * - Back button in top-left corner
 * - No tab bar footer
 * - Proper stack navigation
 *
 * Pages organized by feature area:
 *
 * ACTIVITIES:
 * - activities-list - Completed activity history
 * - activity-detail - Individual activity details
 *
 * ROUTES:
 * - routes-list - Browse saved routes
 * - route-detail - Individual route details
 * - route-upload - Upload new route
 *
 * ACTIVITY PLANS:
 * - activity-plan-detail - View/edit activity plan details
 * - create-activity-plan - Main activity plan builder
 * - create-activity-plan-structure - Plan structure editor
 * - create-activity-plan-repeat - Plan repeat configuration
 * - plan-library - Browse and manage activity plans
 *
 * SCHEDULED ACTIVITIES:
 * - schedule-activity - Schedule activity to calendar
 * - scheduled-activities-list - View all scheduled activities
 * - scheduled-activity-detail - Individual scheduled activity details
 *
 * TRAINING PLANS:
 * - training-plan - Training plan overview
 * - training-plan-create - Create new training plan
 * - training-plan-settings - Training plan settings
 *
 * SETTINGS:
 * - settings - App settings
 * - integrations - Connected services
 * - notifications - Notification preferences
 * - permissions - App permissions
 * - profile-edit - Edit user profile
 *
 * OTHER:
 * (none currently)
 */
export default function StandardLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: "Back",
        animation: "slide_from_right",
        gestureEnabled: true,
        gestureDirection: "horizontal",
        presentation: "card",
      }}
    >
      {/* ACTIVITIES */}
      <Stack.Screen
        name="activities-list"
        options={{
          title: "Activities",
        }}
      />
      <Stack.Screen
        name="activity-detail"
        options={{
          title: "Activity Details",
        }}
      />

      {/* ROUTES */}
      <Stack.Screen
        name="routes-list"
        options={{
          title: "Routes",
        }}
      />
      <Stack.Screen
        name="route-detail"
        options={{
          title: "Route Details",
        }}
      />
      <Stack.Screen
        name="route-upload"
        options={{
          title: "Upload Route",
          presentation: "modal",
        }}
      />

      {/* ACTIVITY PLANS */}
      <Stack.Screen
        name="activity-plan-detail"
        options={{
          title: "Activity Plan",
        }}
      />
      <Stack.Screen
        name="create-activity-plan"
        options={{
          title: "Create Activity Plan",
        }}
      />
      <Stack.Screen
        name="create-activity-plan-structure"
        options={{
          title: "Plan Structure",
        }}
      />
      <Stack.Screen
        name="create-activity-plan-repeat"
        options={{
          title: "Repeat Settings",
        }}
      />
      <Stack.Screen
        name="plan-library"
        options={{
          title: "Plan Library",
        }}
      />

      {/* SCHEDULED ACTIVITIES */}
      <Stack.Screen
        name="scheduled-activities-list"
        options={{
          title: "Scheduled Activities",
        }}
      />
      <Stack.Screen
        name="scheduled-activity-detail"
        options={{
          title: "Activity Details",
        }}
      />

      {/* TRAINING PLANS */}
      <Stack.Screen
        name="training-plan"
        options={{
          title: "Training Plan",
        }}
      />
      <Stack.Screen
        name="training-plan-create"
        options={{
          title: "Create Training Plan",
        }}
      />
      <Stack.Screen
        name="training-plan-method-selector"
        options={{
          title: "Create Training Plan",
        }}
      />
      <Stack.Screen
        name="training-plan-wizard"
        options={{
          title: "Training Plan Wizard",
        }}
      />
      <Stack.Screen
        name="training-plan-review"
        options={{
          title: "Review Plan",
        }}
      />
      <Stack.Screen
        name="training-plan-settings"
        options={{
          title: "Training Plan Settings",
        }}
      />

      {/* SETTINGS */}
      <Stack.Screen
        name="settings"
        options={{
          title: "Settings",
        }}
      />
      <Stack.Screen
        name="integrations"
        options={{
          title: "Integrations",
          headerShown: false, // Has custom header
        }}
      />
      <Stack.Screen
        name="notifications"
        options={{
          title: "Notifications",
        }}
      />
      <Stack.Screen
        name="permissions"
        options={{
          title: "Permissions",
          headerShown: false, // Has custom header
        }}
      />
      <Stack.Screen
        name="profile-edit"
        options={{
          title: "Edit Profile",
        }}
      />
    </Stack>
  );
}
