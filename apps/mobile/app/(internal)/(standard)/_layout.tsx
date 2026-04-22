import { Icon } from "@repo/ui/components/icon";
import { Stack, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import React from "react";
import { TouchableOpacity } from "react-native";

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
 * - activity-import - Import completed activity history
 * - activity-detail - Individual activity details
 *
 * ROUTES:
 * - routes-list - Browse saved routes
 * - route-detail - Individual route details
 * - route-upload - Upload new route
 *
 * ACTIVITY PLANS:
 * - activity-plans-list - Browse owned activity plans
 * - activity-plan-detail - View/edit activity plan details
 * - create-activity-plan - Main activity plan builder
 *
 * SCHEDULED ACTIVITIES:
 * - schedule-activity - Schedule activity to calendar
 * - scheduled-activities-list - View all scheduled activities
 *
 * TRAINING PLANS:
 * - training-plans-list - Training plan management
 * - training-plan-detail - Training plan overview
 * - training-plan-create - Create new training plan
 * - training-plan-edit - Edit training plan structure
 *
 * USER:
 * - user/[userId] - Universal user profile
 *
 * SETTINGS:
 * - integrations - Connected services
 * - notifications - Notification preferences
 * - profile-edit - Edit user profile
 *
 * OTHER:
 * (none currently)
 */
export default function StandardLayout() {
  const router = useRouter();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: "Back",
        animation: "slide_from_right",
        gestureEnabled: true,
        gestureDirection: "horizontal",
        presentation: "card",
        headerLeft: () => (
          <TouchableOpacity onPress={() => router.back()} className="ml-2 p-2 -ml-2">
            <Icon as={ChevronLeft} size={24} className="text-foreground" />
          </TouchableOpacity>
        ),
      }}
    >
      {/* ACTIVITIES */}
      <Stack.Screen
        name="activities-list"
        options={{
          title: "My Activities",
        }}
      />
      <Stack.Screen
        name="activity-import"
        options={{
          title: "Import Activity",
          presentation: "modal",
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
          title: "My Routes",
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

      {/* ACTIVITY EFFORTS */}
      <Stack.Screen
        name="activity-efforts-list"
        options={{
          title: "My Activity Efforts",
        }}
      />
      <Stack.Screen
        name="activity-effort-create"
        options={{
          title: "Add Effort",
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="activity-effort-detail"
        options={{
          title: "Activity Effort",
        }}
      />

      {/* ACTIVITY PLANS */}
      <Stack.Screen
        name="activity-plans-list"
        options={{
          title: "My Activity Plans",
        }}
      />
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
      {/* SCHEDULED ACTIVITIES */}
      <Stack.Screen
        name="scheduled-activities-list"
        options={{
          title: "Scheduled Activities",
        }}
      />
      <Stack.Screen
        name="event-detail"
        options={{
          title: "Event Details",
        }}
      />
      <Stack.Screen
        name="event-detail-update"
        options={{
          title: "Update Event",
        }}
      />
      <Stack.Screen
        name="calendar-day"
        options={{
          title: "Day Agenda",
        }}
      />
      <Stack.Screen
        name="goal-detail"
        options={{
          title: "Goal Details",
        }}
      />

      {/* TRAINING PLANS */}
      <Stack.Screen
        name="training-plans-list"
        options={{
          title: "My Training Plans",
        }}
      />
      <Stack.Screen
        name="training-plan-detail"
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
        name="training-plan-edit"
        options={{
          title: "Edit Training Plan",
        }}
      />
      <Stack.Screen
        name="workouts-reorder"
        options={{
          title: "Reorder Workouts",
        }}
      />

      {/* USER */}
      <Stack.Screen
        name="user/[userId]"
        options={{
          title: "Profile",
        }}
      />

      {/* SETTINGS */}
      <Stack.Screen
        name="integrations"
        options={{
          title: "Integrations",
          headerShown: false, // Has custom header
        }}
      />
      <Stack.Screen
        name="onboarding"
        options={{
          title: "Onboarding",
          headerShown: false, // Custom wizard UI
          gestureEnabled: false, // Prevent going back
        }}
      />
      <Stack.Screen
        name="notifications"
        options={{
          title: "Notifications",
        }}
      />
      <Stack.Screen
        name="messages/new"
        options={{
          title: "New Message",
        }}
      />
      <Stack.Screen
        name="profile-edit"
        options={{
          title: "Edit Profile",
        }}
      />
      <Stack.Screen
        name="profile-metrics-list"
        options={{
          title: "My Profile Metrics",
        }}
      />
      <Stack.Screen
        name="profile-metric-detail"
        options={{
          title: "Profile Metric",
        }}
      />
      <Stack.Screen
        name="training-preferences"
        options={{
          title: "Training Preferences",
        }}
      />
    </Stack>
  );
}
