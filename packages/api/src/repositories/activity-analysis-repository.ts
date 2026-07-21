import type { ActivityEffortRow, ProfileMetricRow, ProfileRow } from "@repo/db";

export type ActivityAnalysisProfileSnapshot = Pick<ProfileRow, "dob" | "gender">;
export type ActivityAnalysisMetricSnapshot = Omit<
  Pick<ProfileMetricRow, "metric_type" | "recorded_at" | "unit" | "value">,
  "value"
> & {
  value: number;
  id?: string;
  method?: string | null;
  calculation_version?: string | null;
  provenance?: unknown;
  reference_activity_id?: string | null;
  reference_activity_category?: string | null;
  source?: ProfileMetricRow["source"];
};
export type ActivityAnalysisEffortSnapshot = Omit<
  Pick<
    ActivityEffortRow,
    "activity_category" | "duration_seconds" | "effort_type" | "recorded_at" | "unit" | "value"
  >,
  "value"
> & {
  value: number;
  id?: string;
  activity_id?: string | null;
  method?: string | null;
  calculation_version?: string | null;
  provenance?: unknown;
  source?: string | null;
};

export type ActivityAnalysisContextSnapshot = {
  profile: ActivityAnalysisProfileSnapshot;
  profileMetrics: ActivityAnalysisMetricSnapshot[];
  recentEfforts: ActivityAnalysisEffortSnapshot[];
};

export interface ActivityAnalysisStore {
  getContextSnapshot(input: {
    asOf: Date;
    effortLookbackAsOf?: Date;
    profileId: string;
    evidenceScope?: "thresholds";
  }): Promise<ActivityAnalysisContextSnapshot>;
  loadContextEvidence?(input: {
    requests: Array<{ asOf: Date; effortLookbackAsOf?: Date; profileId: string }>;
    evidenceScope?: "thresholds";
  }): Promise<Map<string, ActivityAnalysisContextSnapshot>>;
}
