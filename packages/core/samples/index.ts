import { SAMPLE_INDOOR_TRAINER_ACTIVITIES } from "./indoor-bike-activity";
import { SAMPLE_TREADMILL_ACTIVITIES } from "./indoor-treadmill";
// Export sample data modules
export * from "./indoor-bike-activity";

export const SAMPLE_ACTIVITIES = [
  ...SAMPLE_INDOOR_TRAINER_ACTIVITIES,
  ...SAMPLE_TREADMILL_ACTIVITIES,
];
