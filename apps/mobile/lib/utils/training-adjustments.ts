/**
 * Training Plan Adjustment Utilities
 * Provides calculation helpers for quick adjustments
 */

export type AdjustmentType =
  | "reduce_intensity"
  | "increase_intensity"
  | "extend_timeline"
  | "add_rest_days";

export interface AdjustmentPreset {
  type: AdjustmentType;
  label: string;
  icon: string;
  description: string;
  calculate: (currentStructure: any) => any;
}

/**
 * Reduce intensity by 20% (for injury, fatigue, or low adherence)
 */
export const reduceIntensity = (structure: any): any => {
  const tssMin = Math.round(structure.target_weekly_tss_min * 0.8);
  const tssMax = Math.round(structure.target_weekly_tss_max * 0.8);
  const activities = Math.max(
    2,
    Math.floor(structure.target_activities_per_week * 0.85)
  );
  const restDays = Math.min(4, structure.min_rest_days_per_week + 1);

  return {
    ...structure,
    target_weekly_tss_min: tssMin,
    target_weekly_tss_max: tssMax,
    target_activities_per_week: activities,
    min_rest_days_per_week: restDays,
  };
};

/**
 * Increase intensity by 15-20% (for when feeling strong)
 */
export const increaseIntensity = (structure: any): any => {
  const tssMin = Math.round(structure.target_weekly_tss_min * 1.15);
  const tssMax = Math.round(structure.target_weekly_tss_max * 1.2);
  const activities = Math.min(
    7,
    Math.ceil(structure.target_activities_per_week * 1.15)
  );

  return {
    ...structure,
    target_weekly_tss_min: tssMin,
    target_weekly_tss_max: tssMax,
    target_activities_per_week: activities,
  };
};

/**
 * Extend timeline by 2-4 weeks (maintain current CTL trajectory)
 */
export const extendTimeline = (structure: any): any => {
  if (!structure.periodization_template?.target_date) {
    return structure;
  }

  const currentTargetDate = new Date(structure.periodization_template.target_date);
  const newTargetDate = new Date(currentTargetDate);
  newTargetDate.setDate(currentTargetDate.getDate() + 21); // Add 3 weeks

  return {
    ...structure,
    periodization_template: {
      ...structure.periodization_template,
      target_date: newTargetDate.toISOString().split("T")[0],
    },
  };
};

/**
 * Add more rest days (reduce risk of overtraining)
 */
export const addRestDays = (structure: any): any => {
  const restDays = Math.min(4, structure.min_rest_days_per_week + 1);
  const activities = Math.max(
    2,
    structure.target_activities_per_week - 1
  );

  return {
    ...structure,
    min_rest_days_per_week: restDays,
    target_activities_per_week: activities,
  };
};

/**
 * Adjustment presets configuration
 */
export const ADJUSTMENT_PRESETS: AdjustmentPreset[] = [
  {
    type: "reduce_intensity",
    label: "Reduce Intensity",
    icon: "😌",
    description: "Lower TSS targets by 20% and add rest",
    calculate: reduceIntensity,
  },
  {
    type: "increase_intensity",
    label: "Increase Intensity",
    icon: "💪",
    description: "Raise TSS targets by 15-20%",
    calculate: increaseIntensity,
  },
  {
    type: "extend_timeline",
    label: "Extend Timeline",
    icon: "📅",
    description: "Add 3 weeks to goal date",
    calculate: extendTimeline,
  },
  {
    type: "add_rest_days",
    label: "More Rest",
    icon: "🛌",
    description: "Add extra rest day per week",
    calculate: addRestDays,
  },
];

/**
 * Get formatted changes summary for user confirmation
 */
export const getAdjustmentSummary = (
  oldStructure: any,
  newStructure: any
): string[] => {
  const changes: string[] = [];

  if (
    oldStructure.target_weekly_tss_min !== newStructure.target_weekly_tss_min ||
    oldStructure.target_weekly_tss_max !== newStructure.target_weekly_tss_max
  ) {
    changes.push(
      `Weekly TSS: ${oldStructure.target_weekly_tss_min}-${oldStructure.target_weekly_tss_max} → ${newStructure.target_weekly_tss_min}-${newStructure.target_weekly_tss_max}`
    );
  }

  if (
    oldStructure.target_activities_per_week !==
    newStructure.target_activities_per_week
  ) {
    changes.push(
      `Activities/week: ${oldStructure.target_activities_per_week} → ${newStructure.target_activities_per_week}`
    );
  }

  if (
    oldStructure.min_rest_days_per_week !== newStructure.min_rest_days_per_week
  ) {
    changes.push(
      `Rest days/week: ${oldStructure.min_rest_days_per_week} → ${newStructure.min_rest_days_per_week}`
    );
  }

  if (
    oldStructure.periodization_template?.target_date !==
    newStructure.periodization_template?.target_date
  ) {
    const oldDate = new Date(
      oldStructure.periodization_template.target_date
    ).toLocaleDateString();
    const newDate = new Date(
      newStructure.periodization_template.target_date
    ).toLocaleDateString();
    changes.push(`Goal date: ${oldDate} → ${newDate}`);
  }

  return changes;
};
