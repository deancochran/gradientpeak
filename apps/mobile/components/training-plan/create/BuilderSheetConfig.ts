import { formatBuilderWeekdayWithWeek } from "@/lib/training-plan-creation/formatters";
import type { TrainingPlanBuilderSession } from "@/lib/training-plan-creation/types";
import type { BuilderSheet } from "./BuilderSheetTypes";

export function getBuilderSheetTitle(input: {
  activeSheet: BuilderSheet | null;
  selectedSession: TrainingPlanBuilderSession | null;
}) {
  const { activeSheet, selectedSession } = input;
  if (activeSheet === "metadata") return "Plan Settings";
  if (activeSheet === "athleteContext") return "Athlete";
  if (activeSheet === "goals") return "Goals";
  if (activeSheet === "localGoalCreate") return "Create Plan Goal";
  if (activeSheet === "preferences") return "Preferences";
  if (activeSheet === "session") return "Activity";
  if (activeSheet === "activityAssignment") {
    return selectedSession?.activityPlan ? "Change activity" : "Assign activity";
  }
  if (activeSheet === "activityFilters") return "Filters";
  return "Training plan";
}

export function getBuilderSheetDescription(input: {
  activeSheet: BuilderSheet | null;
  selectedSession: TrainingPlanBuilderSession | null;
}) {
  const { activeSheet, selectedSession } = input;
  if (activeSheet === "metadata") {
    return "Apply updates the plan details. Close discards unapplied changes.";
  }
  if (activeSheet === "athleteContext") {
    return "Close finishes these fields in the open form. Correct or clear invalid values before saving the plan.";
  }
  if (activeSheet === "goals")
    return "Selections update the open form. Create a new goal or select one from your profile.";
  if (activeSheet === "localGoalCreate")
    return "Add to plan applies this goal. Close discards the unfinished goal.";
  if (activeSheet === "preferences") {
    return "Apply updates the optional limits. Close discards unapplied changes.";
  }
  if (activeSheet === "session")
    return "Close finishes these fields in the open form. Days are relative to the plan start date.";
  if (activeSheet === "activityAssignment") {
    return selectedSession
      ? `Choose a activity for ${formatBuilderWeekdayWithWeek(selectedSession.offsetDays)}.`
      : undefined;
  }
  if (activeSheet === "activityFilters") return "Refine the activities shown here.";
  return undefined;
}

export function builderSheetHasSaveAction(activeSheet: BuilderSheet | null) {
  return (
    activeSheet === "metadata" || activeSheet === "preferences" || activeSheet === "activityFilters"
  );
}

export function getBuilderSheetActionLabel(activeSheet: BuilderSheet | null) {
  if (activeSheet === "activityFilters" || activeSheet === "preferences") return "Apply";
  if (activeSheet === "metadata") return "Apply";
  return "Close";
}
