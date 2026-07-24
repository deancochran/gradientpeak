import type { ActivityRow, ActivitySegmentRow, publicActivityCategorySchema } from "@repo/db";
import type { z } from "zod";

export const MAX_TRENDS_DASHBOARD_ROWS = 10_000;
// A dashboard may include multiple sport segments per activity, but this still
// bounds the in-memory projection to a conservative five segments per activity.
export const MAX_TRENDS_DASHBOARD_SEGMENTS = MAX_TRENDS_DASHBOARD_ROWS * 5;

export type TrendsDashboardActivityRow = Pick<
  ActivityRow,
  | "id"
  | "profile_id"
  | "name"
  | "started_at"
  | "finished_at"
  | "elapsed_ms"
  | "active_ms"
  | "moving_ms"
  | "timing_coverage"
  | "distance_meters"
  | "avg_heart_rate"
  | "max_heart_rate"
> & {
  segments: Array<
    Pick<
      ActivitySegmentRow,
      | "id"
      | "activity_id"
      | "ordinal"
      | "role"
      | "category"
      | "start_offset_ms"
      | "end_offset_ms"
      | "timing_coverage"
      | "active_ms"
      | "moving_ms"
      | "summary"
    >
  >;
};

export type TrendsDashboardRepositoryFailure =
  | { kind: "row_limit_exceeded" }
  | { kind: "segment_limit_exceeded" };

export type TrendsDashboardRepository = {
  loadDashboardActivities(input: {
    profileId: string;
    startDate: Date;
    endDate: Date;
    type?: z.infer<typeof publicActivityCategorySchema>;
  }): Promise<TrendsDashboardActivityRow[] | TrendsDashboardRepositoryFailure>;
};
