export {
  plannedActivityStructureSchema,
  type PlannedActivityStructure,
} from "./planned_activity";
export {
  profilePlanConfigSchema,
  type ProfilePlanConfig,
} from "./profile_plan";

// Shared sub-schemas (optional export if needed elsewhere)
export { durationSchema, type Duration } from "./shared/duration";
export {
  intensityTargetSchema,
  type IntensityTarget,
} from "./shared/intensity-target";
export { repetitionSchema, type Repetition } from "./shared/repetition";
export { stepSchema, type Step } from "./shared/step";
