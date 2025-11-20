import { Slot } from "expo-router";

/**
 * Plan Tab Root Layout
 *
 * Uses Slot (not Stack) to avoid unwanted back buttons at the root level.
 *
 * Navigation Structure:
 * - /plan/index - Main plan dashboard (Slot - no back button needed)
 * - /plan/training-plan/* - Has its own _layout.tsx with Stack for back navigation
 * - /plan/create_activity_plan/* - Has its own _layout.tsx with Stack for back navigation
 * - /plan/library - Standalone page (add Stack layout if needs sub-pages)
 * - /plan/planned_activities - Standalone page (add Stack layout if needs sub-pages)
 * - /plan/create_planned_activity - Standalone page (add Stack layout if needs sub-pages)
 *
 * This hybrid approach gives us:
 * ✓ No unwanted back button on main plan index
 * ✓ Proper back navigation within sub-sections
 * ✓ Each section controls its own navigation behavior
 */
export default function PlanLayout() {
  return <Slot />;
}
