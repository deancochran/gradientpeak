import { deriveGoalDemandProfileFromTargets } from './packages/core/plan/projectionCalculations.ts';

const result = deriveGoalDemandProfileFromTargets({
  goalTargets: [{ target_type: "race_performance", distance_m: 42195 } as any],
  goalTier: "high",
  weeksToEvent: 40
});

console.log(JSON.stringify(result, null, 2));

const noTargetsResult = deriveGoalDemandProfileFromTargets({
  goalTargets: [],
  goalTier: "medium",
  weeksToEvent: 40
});

console.log(JSON.stringify(noTargetsResult, null, 2));
