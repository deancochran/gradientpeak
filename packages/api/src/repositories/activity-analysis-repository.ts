export type ActivityAnalysisContextSnapshot = {
  profile: {
    dob: Date | null;
    gender: "male" | "female" | "other" | null;
  };
  profileMetrics: Array<{
    metric_type: "weight_kg" | "resting_hr" | "max_hr" | "lthr";
    recorded_at: Date;
    value: number;
  }>;
  recentEfforts: Array<{
    activity_category: "run" | "bike" | "swim" | "strength" | "other";
    duration_seconds: number;
    effort_type: "power" | "speed";
    recorded_at: Date;
    value: number;
  }>;
};

export interface ActivityAnalysisStore {
  getContextSnapshot(input: {
    asOf: Date;
    profileId: string;
  }): Promise<ActivityAnalysisContextSnapshot>;
}
