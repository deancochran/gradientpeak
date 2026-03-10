import { deriveNoHistoryGoalTierFromTargets } from './packages/core/plan/projectionCalculations.ts';

console.log("No targets:", deriveNoHistoryGoalTierFromTargets([]));

console.log("Marathon (42.2km):", deriveNoHistoryGoalTierFromTargets([
  { target_type: "race_performance", distance_m: 42195 } as any
]));

console.log("Half Marathon (21.1km):", deriveNoHistoryGoalTierFromTargets([
  { target_type: "race_performance", distance_m: 21097 } as any
]));

console.log("5K (5km):", deriveNoHistoryGoalTierFromTargets([
  { target_type: "race_performance", distance_m: 5000 } as any
]));
