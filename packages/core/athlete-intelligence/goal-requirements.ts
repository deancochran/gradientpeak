import { deriveGoalDemandProfile, type ProfileGoal } from "../schemas";
import { fingerprintCanonicalJson } from "./canonical-json";
import {
  ATHLETE_INTELLIGENCE_VERSION,
  type GoalRequirementSet,
  goalRequirementSetSchema,
} from "./contracts";

/** Adapts the canonical goal-demand profile without duplicating demand mathematics. */
export function deriveGoalRequirementSet(input: {
  goal: ProfileGoal;
  asOf: string;
}): GoalRequirementSet {
  const requirements = deriveGoalDemandProfile(input.goal);
  const inputFingerprint = fingerprintCanonicalJson({ goal: input.goal, requirements });

  return goalRequirementSetSchema.parse({
    version: ATHLETE_INTELLIGENCE_VERSION,
    goalId: input.goal.id,
    activityCategory: input.goal.activity_category,
    requirements: {
      endurance: requirements.endurance_demand,
      threshold: requirements.threshold_demand,
      high_intensity: requirements.high_intensity_demand,
      durability: requirements.durability_demand,
      technical: requirements.technical_demand,
      specificity: requirements.specificity_demand,
    },
    confidence: {
      score: 1,
      level: "high",
      reasons: ["Derived from the canonical goal demand profile."],
    },
    provenance: {
      source: "goal_demand_profile",
      asOf: input.asOf,
      inputFingerprint,
      notes: [],
    },
  });
}
