import {
  buildTrainingTimelineWindowFromLoadTimeline,
  buildTrainingTimelineWindowFromProjection,
  type CompletedTrainingItem,
  type ProjectionChartPayload,
  type ScheduledTrainingItem,
  type TrainingLoadTimelinePoint,
  type TrainingTimelineWindow,
} from "@repo/core";

export type PlanTabTrainingTimelineFromProjectionInput = {
  today: string;
  projection: ProjectionChartPayload;
  scheduledItems?: ScheduledTrainingItem[];
  completedItems?: CompletedTrainingItem[];
};

export type PlanTabTrainingTimelineFromLoadTimelineInput = {
  today: string;
  startDate: string;
  endDate: string;
  timeline: TrainingLoadTimelinePoint[];
  scheduledItems?: ScheduledTrainingItem[];
  completedItems?: CompletedTrainingItem[];
};

/** Builds the canonical Plan-tab training timeline read model without changing router contracts. */
export function buildPlanTabTrainingTimeline(
  input: PlanTabTrainingTimelineFromProjectionInput | PlanTabTrainingTimelineFromLoadTimelineInput,
): TrainingTimelineWindow {
  if ("projection" in input) {
    return buildTrainingTimelineWindowFromProjection(input);
  }

  return buildTrainingTimelineWindowFromLoadTimeline(input);
}
