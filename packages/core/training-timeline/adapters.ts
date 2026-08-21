import type { ProjectionChartPayload } from "../plan/projectionTypes";
import type { TrainingLoadTimelineInputPoint } from "../plan/trainingLoadTimeline";
import { type BuildTrainingTimelineWindowInput, buildTrainingTimelineWindow } from "./timeline";

export function buildTrainingTimelineWindowFromLoadTimeline(input: {
  today: string;
  startDate: string;
  endDate: string;
  timeline: TrainingLoadTimelineInputPoint[];
  scheduledItems?: BuildTrainingTimelineWindowInput["scheduledItems"];
  scheduledSourceStatus?: BuildTrainingTimelineWindowInput["scheduledSourceStatus"];
  completedItems?: BuildTrainingTimelineWindowInput["completedItems"];
  completedSourceStatus?: BuildTrainingTimelineWindowInput["completedSourceStatus"];
}) {
  return buildTrainingTimelineWindow({
    today: input.today,
    startDate: input.startDate,
    endDate: input.endDate,
    loadPoints: input.timeline,
    scheduledItems: input.scheduledItems,
    scheduledSourceStatus: input.scheduledSourceStatus,
    completedItems: input.completedItems,
    completedSourceStatus: input.completedSourceStatus,
  });
}

export function buildTrainingTimelineWindowFromProjection(input: {
  today: string;
  projection: ProjectionChartPayload;
  scheduledItems?: BuildTrainingTimelineWindowInput["scheduledItems"];
  scheduledSourceStatus?: BuildTrainingTimelineWindowInput["scheduledSourceStatus"];
  completedItems?: BuildTrainingTimelineWindowInput["completedItems"];
  completedSourceStatus?: BuildTrainingTimelineWindowInput["completedSourceStatus"];
}) {
  return buildTrainingTimelineWindow({
    today: input.today,
    startDate: input.projection.start_date,
    endDate: input.projection.end_date,
    loadPoints: input.projection.daily_load_points ?? [],
    scheduledItems: input.scheduledItems,
    scheduledSourceStatus: input.scheduledSourceStatus,
    completedItems: input.completedItems,
    completedSourceStatus: input.completedSourceStatus,
  });
}
