import type { AthletePreferenceProfile } from "../../schemas/settings/profile_settings";
import { ALL_SAMPLE_PLANS } from "../../samples";
import type { BuildProjectionEngineInputShape } from "../buildProjectionEngineInput";
import {
  ATHLETE_SCENARIO_FIXTURES_BY_ID,
  type AthleteScenarioFixtureId,
} from "./fixtures/athlete-scenarios";
import { SYSTEM_PLAN_MAPPING_FIXTURES_BY_SCENARIO } from "./fixtures/system-plan-mappings";
import type {
  AthleteScenarioFixture,
  SystemPlanMappingFixture,
  VerificationToleranceClass,
} from "./types";

export type FixtureBackedContractMatchType = "exact" | "crosswalk";

export type FixtureBackedContractGoal =
  BuildProjectionEngineInputShape["expanded_plan"]["goals"][number];

export interface FixtureBackedSystemPlanContractOverride {
  scenario_id: AthleteScenarioFixtureId;
  enabled: boolean;
  match_type: FixtureBackedContractMatchType;
  expected_weekly_load: number;
  expected_mode: "target_seeking" | "capacity_bounded";
  notes?: string;
}

export interface FixtureBackedSystemPlanContract {
  key: AthleteScenarioFixtureId;
  enabled: boolean;
  plan_id: string;
  plan_name: string;
  mapping_id: string;
  match_type: FixtureBackedContractMatchType;
  tolerance_class: VerificationToleranceClass;
  expected_weekly_load: number;
  current_ctl: number;
  preference_profile?: AthletePreferenceProfile;
  goals: readonly FixtureBackedContractGoal[];
  expected_mode: "target_seeking" | "capacity_bounded";
  notes: string;
  scenario_fixture: AthleteScenarioFixture;
  mapping_fixture: SystemPlanMappingFixture;
}

const planById = new Map(ALL_SAMPLE_PLANS.map((plan) => [plan.id, plan]));

function requireSingleMapping(
  scenarioId: AthleteScenarioFixtureId,
): SystemPlanMappingFixture {
  const mappings = SYSTEM_PLAN_MAPPING_FIXTURES_BY_SCENARIO[scenarioId] ?? [];

  if (mappings.length !== 1) {
    throw new Error(
      `Expected exactly one system plan mapping for verification scenario ${scenarioId}, found ${mappings.length}`,
    );
  }

  return mappings[0]!;
}

function requirePlanName(planId: string): string {
  const plan = planById.get(planId);

  if (!plan) {
    throw new Error(`Missing system training plan fixture ${planId}`);
  }

  return plan.name;
}

/**
 * Derives test-facing verification contracts from the fixture layer so scenario
 * goals, CTL, plan selection, and tolerance metadata stay aligned with the
 * canonical verification catalog.
 *
 * @param overrides - Contract-only expectations layered on top of fixture truth
 * @returns Stable contract scenarios for focused system-plan tests
 */
export function deriveFixtureBackedSystemPlanContracts(
  overrides: ReadonlyArray<FixtureBackedSystemPlanContractOverride>,
): FixtureBackedSystemPlanContract[] {
  return overrides.map((override) => {
    const scenarioFixture =
      ATHLETE_SCENARIO_FIXTURES_BY_ID[override.scenario_id];
    if (!scenarioFixture) {
      throw new Error(
        `Missing athlete verification fixture ${override.scenario_id}`,
      );
    }

    const mappingFixture = requireSingleMapping(override.scenario_id);

    return {
      key: override.scenario_id,
      enabled: override.enabled,
      plan_id: mappingFixture.plan_id,
      plan_name: requirePlanName(mappingFixture.plan_id),
      mapping_id: mappingFixture.id,
      match_type: override.match_type,
      tolerance_class: mappingFixture.tolerance_class,
      expected_weekly_load: override.expected_weekly_load,
      current_ctl: scenarioFixture.athlete_snapshot.starting_ctl,
      preference_profile: scenarioFixture.preference_profile,
      goals: scenarioFixture.projection_input.expanded_plan.goals,
      expected_mode: override.expected_mode,
      notes: [
        scenarioFixture.description,
        ...mappingFixture.audit.limitations,
        override.notes,
      ]
        .filter((value): value is string => Boolean(value))
        .join(" "),
      scenario_fixture: scenarioFixture,
      mapping_fixture: mappingFixture,
    };
  });
}
