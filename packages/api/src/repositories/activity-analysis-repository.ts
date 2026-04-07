import type { ActivityEffortRow, ProfileMetricRow, ProfileRow } from "@repo/db";

type ActivityAnalysisProfileSnapshot = Pick<ProfileRow, "dob" | "gender">;
type ActivityAnalysisMetricSnapshot = Omit<
  Pick<ProfileMetricRow, "metric_type" | "recorded_at" | "value">,
  "value"
> & { value: number };
type ActivityAnalysisEffortSnapshot = Omit<
  Pick<
    ActivityEffortRow,
    "activity_category" | "duration_seconds" | "effort_type" | "recorded_at" | "value"
  >,
  "value"
> & { value: number };

export type ActivityAnalysisContextSnapshot = {
  profile: ActivityAnalysisProfileSnapshot;
  profileMetrics: ActivityAnalysisMetricSnapshot[];
  recentEfforts: ActivityAnalysisEffortSnapshot[];
};

export interface ActivityAnalysisStore {
  getContextSnapshot(input: {
    asOf: Date;
    profileId: string;
  }): Promise<ActivityAnalysisContextSnapshot>;
}
