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
  if (activeSheet === "profileGoalCreate") return "Create profile goal";
  if (activeSheet === "preferences") return "Preferences";
  if (activeSheet === "schedulePreview") return "Schedule preview";
  if (activeSheet === "session") return "Workout";
  if (activeSheet === "activityAssignment") {
    return selectedSession?.activityPlan ? "Change workout" : "Assign workout";
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
    return "Name the reusable plan.";
  }
  if (activeSheet === "athleteContext") {
    return "Adjust the athlete inputs used by this plan.";
  }
  if (activeSheet === "goals") return "Create a new goal or select one from your profile.";
  if (activeSheet === "localGoalCreate") return "Create a goal for this plan only.";
  if (activeSheet === "profileGoalCreate") {
    return "Add a goal without leaving the builder.";
  }
  if (activeSheet === "preferences") {
    return "Set optional limits for this plan.";
  }
  if (activeSheet === "schedulePreview") {
    return "Review relative Week/Day placement before applying the plan.";
  }
  if (activeSheet === "session") return undefined;
  if (activeSheet === "activityAssignment") {
    return selectedSession
      ? `Choose a workout for ${formatBuilderWeekdayWithWeek(selectedSession.offsetDays)}.`
      : undefined;
  }
  if (activeSheet === "activityFilters") return "Refine the workouts shown here.";
  return undefined;
}

export function builderSheetHasSaveAction(activeSheet: BuilderSheet | null) {
  return (
    activeSheet !== null &&
    activeSheet !== "activityAssignment" &&
    activeSheet !== "localGoalCreate" &&
    activeSheet !== "session"
  );
}

export function getBuilderSheetActionLabel(activeSheet: BuilderSheet | null) {
  if (activeSheet === "activityFilters" || activeSheet === "preferences") return "Apply";
  if (activeSheet === "profileGoalCreate") return "Add";
  if (activeSheet === "metadata") return "Save";
  return "Done";
}
