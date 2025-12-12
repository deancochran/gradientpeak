import { Stack } from "expo-router";

/**
 * Plan Tab Root Layout
 *
 * Converted to Stack navigation for consistent header and back button support.
 *
 * Navigation Structure:
 * - /plan/index - Main plan dashboard (no back button - root screen)
 * - /plan/training-plan/* - Has its own _layout.tsx with Stack for back navigation
 * - /plan/create_activity_plan/* - Has its own _layout.tsx with Stack for back navigation
 * - /plan/library - Standalone page (add Stack layout if needs sub-pages)
 * - /plan/planned_activities - Standalone page (add Stack layout if needs sub-pages)
 * - /plan/create_planned_activity - Standalone page (add Stack layout if needs sub-pages)
 *
 * Benefits:
 * ✓ Consistent navigation patterns across the app
 * ✓ Proper header support for nested screens
 * ✓ Back navigation when entering sub-sections
 * ✓ Each section controls its own navigation behavior
 */
export default function PlanLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: "Back",
        animation: "slide_from_right",
        animationDuration: 300,
        gestureEnabled: true,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
          title: "Plan",
        }}
      />
      <Stack.Screen
        name="training-plan"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="create_activity_plan"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="library"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="planned_activities"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="create_planned_activity"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
}
