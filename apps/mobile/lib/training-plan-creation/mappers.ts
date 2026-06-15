import { canonicalTrainingPlanStructureSchema, trainingPlanCreateInputSchema } from "@repo/core";
import type { z } from "zod";
import type { TrainingPlanBuilderEventOverrides, TrainingPlanBuilderState } from "./types";

type TrainingPlanStructure = z.output<typeof canonicalTrainingPlanStructureSchema>;
type TrainingPlanCreatePayload = z.output<typeof trainingPlanCreateInputSchema>;

function normalizeEventOverrides(
  eventOverrides: TrainingPlanBuilderEventOverrides | undefined,
): TrainingPlanBuilderEventOverrides | undefined {
  if (!eventOverrides) {
    return undefined;
  }

  const normalized: TrainingPlanBuilderEventOverrides = {};
  if (eventOverrides.title) {
    normalized.title = eventOverrides.title;
  }
  if (eventOverrides.description) {
    normalized.description = eventOverrides.description;
  }
  if (eventOverrides.start_time) {
    normalized.start_time = eventOverrides.start_time;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function toTrainingPlanStructure(state: TrainingPlanBuilderState): TrainingPlanStructure {
  return canonicalTrainingPlanStructureSchema.parse({
    version: 1,
    sessions: state.schedule.sessions
      .filter((session) => session.activityPlan !== null)
      .map((session) => {
        const eventOverrides = normalizeEventOverrides(session.eventOverrides);
        return {
          offset_days: session.offsetDays,
          activity_plan_id: session.activityPlan?.id,
          ...(eventOverrides ? { event_overrides: eventOverrides } : {}),
        };
      }),
  });
}

export function toTrainingPlanCreatePayload(
  state: TrainingPlanBuilderState,
): TrainingPlanCreatePayload {
  return trainingPlanCreateInputSchema.parse({
    name: state.details.name.trim(),
    description: state.details.description.trim() || null,
    is_active: true,
    structure: toTrainingPlanStructure(state),
  });
}
