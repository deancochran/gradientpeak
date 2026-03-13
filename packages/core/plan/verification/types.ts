import type { AthletePreferenceProfile } from "../../schemas/settings/profile_settings";
import type { BuildProjectionEngineInputShape } from "../buildProjectionEngineInput";

export type VerificationToleranceClass = "tight" | "moderate" | "flexible";

export type VerificationFixturePrecision = "exact" | "audit-first";

export type VerificationScenarioGroup =
  | "baseline"
  | "constraints"
  | "multi_goal";

export type VerificationHeuristicMode =
  | "target_seeking"
  | "constraint_compromise"
  | "capacity_bounded"
  | "priority_sensitive";

export interface VerificationAuditMetadata {
  fixture_precision: VerificationFixturePrecision;
  exact_fields: readonly string[];
  audit_fields: readonly string[];
  limitations: readonly string[];
}

export interface AthleteScenarioSnapshot {
  history_availability_state: "none" | "sparse" | "rich";
  starting_ctl: number;
  availability_days_per_week: number;
  max_single_session_duration_minutes?: number;
  hard_rest_days?: readonly string[];
  age?: number;
}

export interface AthleteScenarioFixture {
  id: string;
  title: string;
  description: string;
  scenario_group: VerificationScenarioGroup;
  primary_activity_category: "run" | "bike" | "swim" | "other";
  default_tolerance_class: VerificationToleranceClass;
  heuristic_mode: VerificationHeuristicMode;
  athlete_snapshot: AthleteScenarioSnapshot;
  expected_plan_traits: readonly string[];
  projection_input: BuildProjectionEngineInputShape;
  preference_profile?: AthletePreferenceProfile;
  audit: VerificationAuditMetadata;
}

export interface LinkedSystemActivityTemplateFixture {
  id: string;
  name: string;
  activity_category: string;
  source_activity_plan_id: string;
  normalized_from_legacy_id: boolean;
}

export interface SystemPlanFixtureCatalogEntry {
  plan_id: string;
  plan_name: string;
  sessions_per_week_target: number;
  duration_hours: number;
  declared_cycle_weeks: number | null;
  materialized_session_weeks: number;
  linked_activity_templates: readonly LinkedSystemActivityTemplateFixture[];
  dominant_activity_categories: readonly string[];
  audit: VerificationAuditMetadata;
}

export interface SystemPlanMappingFixture {
  id: string;
  scenario_id: string;
  plan_id: string;
  tolerance_class: VerificationToleranceClass;
  expected_session_emphasis: readonly string[];
  audit: VerificationAuditMetadata;
}
