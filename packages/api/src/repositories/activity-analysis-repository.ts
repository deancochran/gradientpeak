import type { ActivityEffortRow, ProfileMetricRow, ProfileRow } from "@repo/db";

export type ActivityAnalysisProfileSnapshot = Pick<ProfileRow, "dob" | "gender">;
export type ActivityAnalysisMetricSnapshot = Omit<
  Pick<ProfileMetricRow, "metric_type" | "recorded_at" | "unit" | "value">,
  "value"
> & { value: number };
export type ActivityAnalysisEffortSnapshot = Omit<
  Pick<
    ActivityEffortRow,
    "activity_category" | "duration_seconds" | "effort_type" | "recorded_at" | "unit" | "value"
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
  loadContextEvidence?(input: {
    requests: Array<{ asOf: Date; profileId: string }>;
  }): Promise<Map<string, ActivityAnalysisContextSnapshot>>;
}
