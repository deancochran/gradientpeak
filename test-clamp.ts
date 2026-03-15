import { clampNoHistoryFloorByAvailability } from './packages/core/plan/projectionCalculations.ts';

const availabilityContext = {
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
};

const result = clampNoHistoryFloorByAvailability(
  {
    goalTier: "high",
    fitnessLevel: "weak",
    start_ctl_floor: 35,
    start_weekly_tss_floor: 245,
    target_event_ctl: 65,
  },
  availabilityContext,
  undefined
);

console.log(JSON.stringify(result, null, 2));
