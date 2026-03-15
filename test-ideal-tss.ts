import { deriveGoalDemandProfileFromTargets, resolveNoHistoryAnchor } from './packages/core/plan/projectionCalculations.ts';

const noHistoryContext = {
  goal_tier: "high" as const,
  goal_targets: [{ target_type: "race_performance", distance_m: 42195 } as any],
  weeks_to_event: 40,
  history_availability_state: "none" as const,
  availability_context: {
    availability_days: [
      { day: "monday", windows: [{ start_minute_of_day: 360, end_minute_of_day: 450 }] },
      { day: "tuesday", windows: [{ start_minute_of_day: 360, end_minute_of_day: 450 }] },
      { day: "wednesday", windows: [] },
      { day: "thursday", windows: [{ start_minute_of_day: 360, end_minute_of_day: 450 }] },
      { day: "friday", windows: [] },
      { day: "saturday", windows: [{ start_minute_of_day: 450, end_minute_of_day: 570 }] },
      { day: "sunday", windows: [] },
    ],
    hard_rest_days: ["wednesday", "friday", "sunday"],
    max_single_session_duration_minutes: 90,
  }
};

const result = resolveNoHistoryAnchor(noHistoryContext);

console.log(JSON.stringify(result, null, 2));
