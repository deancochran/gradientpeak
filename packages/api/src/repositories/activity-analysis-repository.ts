import type { AthletePerformanceModelSnapshot, AthletePerformanceTargetFacts } from "@repo/core";
import type { ActivityEffortRow, ProfileMetricRow, ProfileRow } from "@repo/db";

export const ACTIVITY_ANALYSIS_CONTEXT_EVIDENCE_REQUEST_LIMIT = 525;

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
  distance_meters?: number | null;
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
  /** The set-based calibration read hit its sentinel; no calibration may be selected from it. */
  calibrationTruncated?: boolean;
};

export type ActivityAnalysisContextEvidenceRequest = {
  asOf: Date;
  effortLookbackAsOf?: Date;
  profileId: string;
  activityIdToExclude?: string;
};

export interface ActivityAnalysisStore {
  getPerformanceModelAsOf?(input: {
    asOf: Date;
    profileId: string;
    activityIdToExclude?: string;
  }): Promise<AthletePerformanceModelSnapshot>;
  getPerformanceTargetsAsOf?(input: {
    asOf: Date;
    profileId: string;
    activityIdToExclude?: string;
  }): Promise<AthletePerformanceTargetFacts>;
  getPerformanceTargetsForRequests?(input: {
    requests: Array<{
      asOf: Date;
      profileId: string;
      activityIdToExclude?: string;
    }>;
  }): Promise<AthletePerformanceTargetFacts[]>;
  getContextSnapshot(input: {
    asOf: Date;
    effortLookbackAsOf?: Date;
    profileId: string;
    activityIdToExclude?: string;
    evidenceScope?: "thresholds";
  }): Promise<ActivityAnalysisContextSnapshot>;
  loadContextEvidence?(input: {
    requests: ActivityAnalysisContextEvidenceRequest[];
    evidenceScope?: "thresholds";
  }): Promise<Map<string, ActivityAnalysisContextSnapshot>>;
}
