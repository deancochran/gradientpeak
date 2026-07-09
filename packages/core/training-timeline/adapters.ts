import type { ProjectionChartPayload } from "../plan/projectionTypes";
import type { TrainingLoadTimelinePoint } from "../plan/trainingLoadTimeline";
import { type BuildTrainingTimelineWindowInput, buildTrainingTimelineWindow } from "./timeline";

export function buildTrainingTimelineWindowFromLoadTimeline(input: {
  today: string;
  startDate: string;
  endDate: string;
  timeline: TrainingLoadTimelinePoint[];
  scheduledItems?: BuildTrainingTimelineWindowInput["scheduledItems"];
  completedItems?: BuildTrainingTimelineWindowInput["completedItems"];
}) {
  return buildTrainingTimelineWindow({
    today: input.today,
    startDate: input.startDate,
    endDate: input.endDate,
    loadPoints: input.timeline,
    scheduledItems: input.scheduledItems,
    completedItems: input.completedItems,
  });
}

export function buildTrainingTimelineWindowFromProjection(input: {
  today: string;
  projection: ProjectionChartPayload;
  scheduledItems?: BuildTrainingTimelineWindowInput["scheduledItems"];
  completedItems?: BuildTrainingTimelineWindowInput["completedItems"];
}) {
  return buildTrainingTimelineWindow({
    today: input.today,
    startDate: input.projection.start_date,
    endDate: input.projection.end_date,
    loadPoints: input.projection.daily_load_points ?? [],
    scheduledItems: input.scheduledItems,
    completedItems: input.completedItems,
  });
}
