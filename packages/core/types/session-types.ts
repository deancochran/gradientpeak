import type { PlannedActivityStructure } from "../schemas/planned_activity";

/**
 * Represents the path to the current step within a nested workout structure.
 * e.g., [0] for the first step, [1, 2] for the third step inside the second repetition block.
 */
export type SchemaPosition = number[];

/**
 * Represents the live state of a workout session being recorded.
 */
export type LiveSession = {
  // The planned workout structure.
  plan: PlannedActivityStructure;

  // The current position within the workout structure.
  position: SchemaPosition;

  // The current state of the session.
  status: "active" | "paused" | "stopped";

  // Real-time metrics
  metrics: {
    heartRate?: number;
    power?: number;
    cadence?: number;
    speed?: number;
    distance?: number;
  };

  // Timestamp for the start of the session
  startTime: number;

  // Timestamp for the start of the current step
  currentStepStartTime: number;
};
