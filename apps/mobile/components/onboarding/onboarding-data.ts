import type { OnboardingData } from "./types";

export const INITIAL_ONBOARDING_DATA: OnboardingData = {
  full_name: "",
  username: "",
  intent: null,
  experience_level: null,
  dob: null,
  weight_kg: null,
  weight_unit: "kg",
  gender: null,
  sport_interests: [],
  max_hr: null,
  resting_hr: null,
  lthr: null,
  ftp: null,
  threshold_pace: null,
  css: null,
  vo2max: null,
  training_frequency: null,
  equipment: [],
  goals: [],
};

export const PRIMARY_SPORT_OPTIONS = [
  "cycling",
  "running",
  "swimming",
  "strength",
  "other",
] as const;
