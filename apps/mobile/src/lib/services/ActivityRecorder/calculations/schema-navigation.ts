import type {
  PlannedActivityStructure,
  Repetition,
  Step,
} from "../schemas/planned_activity";
import type { SchemaPosition } from "../types/session-types";

/**
 * Schema Navigation Utilities for Planned Activity Structures
 *
 * These utilities provide navigation through structured activities, enabling
 * step-by-step guidance and activity progression tracking.
 */

/**
 * Retrieves the current step from a planned activity structure based on a schema position.
 *
 * @param plan The planned activity structure
 * @param position The schema position array (e.g., [0, 1] for first repetition, second step)
 * @returns The current step or null if position is invalid
 */
export const getCurrentStep = (
  plan: PlannedActivityStructure,
  position: SchemaPosition,
): Step | null => {
  if (!plan?.steps?.length || !position?.length) {
    return null;
  }

  let currentLevel: (Step | Repetition)[] = plan.steps;
  let currentItem: Step | Repetition | undefined;

  for (let i = 0; i < position.length; i++) {
    const index = position[i];

    if (index < 0 || index >= currentLevel.length) {
      return null; // Invalid index
    }

    currentItem = currentLevel[index];

    // If this is a repetition and we need to go deeper
    if ("repeat" in currentItem && i < position.length - 1) {
      currentLevel = currentItem.steps;
    }
  }

  // If final item is a repetition, return the first step
  if (currentItem && "repeat" in currentItem) {
    return currentItem.steps[0] || null;
  }

  return (currentItem as Step) || null;
};

/**
 * Advances to the next step in the activity structure.
 * Note: This function is stateless regarding repetition counts.
 * A stateful wrapper is needed to track current repetition iterations.
 *
 * @param plan The planned activity structure
 * @param position Current schema position
 * @param repetitionState Optional map of repetition positions to current iteration counts
 * @returns Next schema position or null if activity is complete
 */
export const getNextStep = (
  plan: PlannedActivityStructure,
  position: SchemaPosition,
  repetitionState?: Map<string, number>,
): SchemaPosition | null => {
  if (!plan?.steps?.length || !position?.length) {
    return null;
  }

  const newPosition = [...position];

  // Try to advance within current level
  const lastIndex = newPosition.length - 1;
  newPosition[lastIndex]++;

  // Check if we can move to next sibling at this level
  const parentPath = newPosition.slice(0, -1);
  const parentLevel = getStepsAtPosition(plan, parentPath);

  if (parentLevel && newPosition[lastIndex] < parentLevel.length) {
    // Check if next item is a repetition that we need to enter
    const nextItem = parentLevel[newPosition[lastIndex]];
    if (nextItem && "repeat" in nextItem && nextItem.steps.length > 0) {
      newPosition.push(0); // Enter the repetition
    }
    return newPosition;
  }

  // Can't advance at current level, try to move up and continue
  while (newPosition.length > 1) {
    newPosition.pop(); // Go up one level
    const upperLastIndex = newPosition.length - 1;
    newPosition[upperLastIndex]++;

    const upperParentPath = newPosition.slice(0, -1);
    const upperParentLevel = getStepsAtPosition(plan, upperParentPath);

    if (
      upperParentLevel &&
      newPosition[upperLastIndex] < upperParentLevel.length
    ) {
      const nextItem = upperParentLevel[newPosition[upperLastIndex]];
      if (nextItem && "repeat" in nextItem && nextItem.steps.length > 0) {
        newPosition.push(0); // Enter the repetition
      }
      return newPosition;
    }
  }

  return null; // End of activity
};

/**
 * Gets the steps array at a specific position in the activity hierarchy.
 * Helper function for navigation logic.
 */
const getStepsAtPosition = (
  plan: PlannedActivityStructure,
  position: SchemaPosition,
): (Step | Repetition)[] | null => {
  if (position.length === 0) {
    return plan.steps;
  }

  let currentLevel: (Step | Repetition)[] = plan.steps;

  for (let i = 0; i < position.length; i++) {
    const index = position[i];

    if (index < 0 || index >= currentLevel.length) {
      return null;
    }

    const item = currentLevel[index];

    if ("repeat" in item) {
      currentLevel = item.steps;
    } else {
      return null; // Can't go deeper from a step
    }
  }

  return currentLevel;
};

/**
 * Gets a preview of upcoming steps from the current position.
 *
 * @param plan The planned activity structure
 * @param position Current schema position
 * @param count Number of upcoming steps to return (default: 3)
 * @param repetitionState Optional map of repetition states
 * @returns Array of upcoming steps (may contain nulls if activity is ending)
 */
export const getUpcomingSteps = (
  plan: PlannedActivityStructure,
  position: SchemaPosition,
  count: number = 3,
  repetitionState?: Map<string, number>,
): (Step | null)[] => {
  const upcomingSteps: (Step | null)[] = [];
  let currentPosition: SchemaPosition | null = position;

  for (let i = 0; i < count; i++) {
    if (!currentPosition) {
      upcomingSteps.push(null);
      continue;
    }

    const nextPosition = getNextStep(plan, currentPosition, repetitionState);
    if (nextPosition) {
      const step = getCurrentStep(plan, nextPosition);
      upcomingSteps.push(step);
      currentPosition = nextPosition;
    } else {
      upcomingSteps.push(null);
      currentPosition = null;
    }
  }

  return upcomingSteps;
};

/**
 * Calculates the total estimated duration of a planned activity in seconds.
 * Only considers time-based durations.
 *
 * @param plan The planned activity structure
 * @returns Total estimated duration in seconds
 */
export const calculateTotalDuration = (
  plan: PlannedActivityStructure,
): number => {
  if (!plan?.steps?.length) return 0;

  let totalDuration = 0;

  const processStep = (step: Step): number => {
    if (step.duration?.type === "time") {
      return step.duration.value;
    }
    return 0;
  };

  const processItem = (item: Step | Repetition): number => {
    if ("repeat" in item) {
      // Repetition block
      const stepsDuration = item.steps.reduce(
        (sum, step) => sum + processStep(step),
        0,
      );
      return stepsDuration * item.repeat;
    } else {
      // Single step
      return processStep(item);
    }
  };

  totalDuration = plan.steps.reduce((sum, item) => sum + processItem(item), 0);

  return totalDuration;
};

/**
 * Gets the duration for the current step in seconds.
 * Returns 0 for non-time-based durations.
 *
 * @param plan The planned activity structure
 * @param position Current schema position
 * @returns Duration in seconds or 0 if not time-based
 */
export const getCurrentStepDuration = (
  plan: PlannedActivityStructure,
  position: SchemaPosition,
): number => {
  const step = getCurrentStep(plan, position);
  if (!step?.duration || step.duration.type !== "time") {
    return 0;
  }
  return step.duration.value;
};

/**
 * Calculates elapsed time up to the current position in the activity.
 * Only considers completed steps with time-based durations.
 *
 * @param plan The planned activity structure
 * @param position Current schema position
 * @returns Elapsed time in seconds
 */
export const getElapsedTime = (
  plan: PlannedActivityStructure,
  position: SchemaPosition,
): number => {
  if (!plan?.steps?.length || !position?.length) return 0;

  let elapsedTime = 0;
  let currentPos: SchemaPosition | null = [0];

  // Walk through all completed steps
  while (currentPos && !isPositionEqual(currentPos, position)) {
    const step = getCurrentStep(plan, currentPos);
    if (step?.duration?.type === "time") {
      elapsedTime += step.duration.value;
    }

    currentPos = getNextStep(plan, currentPos);
  }

  return elapsedTime;
};

/**
 * Helper function to compare if two schema positions are equal.
 */
const isPositionEqual = (
  pos1: SchemaPosition,
  pos2: SchemaPosition,
): boolean => {
  if (pos1.length !== pos2.length) return false;
  return pos1.every((value, index) => value === pos2[index]);
};

/**
 * Validates if a schema position is valid for the given plan.
 *
 * @param plan The planned activity structure
 * @param position Schema position to validate
 * @returns true if position is valid, false otherwise
 */
export const isValidPosition = (
  plan: PlannedActivityStructure,
  position: SchemaPosition,
): boolean => {
  return getCurrentStep(plan, position) !== null;
};

/**
 * Gets the activity progress as a percentage (0-100) based on elapsed time.
 *
 * @param plan The planned activity structure
 * @param position Current schema position
 * @returns Progress percentage (0-100)
 */
export const getActivityProgress = (
  plan: PlannedActivityStructure,
  position: SchemaPosition,
): number => {
  const totalDuration = calculateTotalDuration(plan);
  if (totalDuration === 0) return 0;

  const elapsedTime = getElapsedTime(plan, position);
  return Math.min(100, Math.max(0, (elapsedTime / totalDuration) * 100));
};
