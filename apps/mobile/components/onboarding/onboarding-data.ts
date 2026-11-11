import type { OnboardingData } from "./types";

export const INITIAL_ONBOARDING_DATA: OnboardingData = {
  full_name: "",
  username: "",
  planning_timezone: null,
  intent: [],
  experience_level: null,
  dob: null,
  weight_kg: null,
  weight_unit: "kg",
  gender: null,
  activity_category_interests: [],
  max_hr: null,
  resting_hr: null,
  vo2max: null,
  training_frequency: null,
  equipment: [],
  goals: [],
  goal_draft: null,
  should_create_goal: false,
  selected_invitation_ids: [],
  selected_group_ids: [],
  selected_group_actions: [],
  selected_follow_profile_ids: [],
  social_action_statuses: {},
};

export const PRIMARY_ACTIVITY_CATEGORY_OPTIONS = [
  "cycling",
  "running",
  "swimming",
  "strength",
  "other",
] as const;
