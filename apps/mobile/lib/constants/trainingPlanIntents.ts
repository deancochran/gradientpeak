export const TPV_NEXT_STEP_INTENTS = {
  REFINE: "refine",
  EDIT: "edit",
  MANAGE: "manage",
  REVIEW_ACTIVITY: "review-activity",
} as const;

export type TrainingPlanNextStepIntent =
  (typeof TPV_NEXT_STEP_INTENTS)[keyof typeof TPV_NEXT_STEP_INTENTS];

const TPV_NEXT_STEP_ALIAS_MAP: Record<string, TrainingPlanNextStepIntent> = {
  refine: TPV_NEXT_STEP_INTENTS.REFINE,
  edit: TPV_NEXT_STEP_INTENTS.EDIT,
  "edit-structure": TPV_NEXT_STEP_INTENTS.EDIT,
  settings: TPV_NEXT_STEP_INTENTS.MANAGE,
  manage: TPV_NEXT_STEP_INTENTS.MANAGE,
  "review-activity": TPV_NEXT_STEP_INTENTS.REVIEW_ACTIVITY,
};

export function normalizeTrainingPlanNextStep(
  value?: string,
): TrainingPlanNextStepIntent | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return TPV_NEXT_STEP_ALIAS_MAP[value.trim().toLowerCase()];
}
