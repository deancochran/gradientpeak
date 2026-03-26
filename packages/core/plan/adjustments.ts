export type AdjustmentType =
  | "reduce_intensity"
  | "increase_intensity"
  | "extend_timeline"
  | "add_rest_days";

export interface QuickAdjustmentPlanStructure {
  min_rest_days_per_week: number;
  periodization_template?: {
    target_date?: string | null;
  } | null;
  target_activities_per_week: number;
  target_weekly_tss_max: number;
  target_weekly_tss_min: number;
}

export interface AdjustmentPreset<TStructure extends QuickAdjustmentPlanStructure> {
  type: AdjustmentType;
  label: string;
  icon: string;
  description: string;
  calculate: (currentStructure: TStructure) => TStructure;
}

export function reduceIntensity<TStructure extends QuickAdjustmentPlanStructure>(
  structure: TStructure,
): TStructure {
  return {
    ...structure,
    min_rest_days_per_week: Math.min(4, structure.min_rest_days_per_week + 1),
    target_activities_per_week: Math.max(
      2,
      Math.floor(structure.target_activities_per_week * 0.85),
    ),
    target_weekly_tss_max: Math.round(structure.target_weekly_tss_max * 0.8),
    target_weekly_tss_min: Math.round(structure.target_weekly_tss_min * 0.8),
  };
}

export function increaseIntensity<TStructure extends QuickAdjustmentPlanStructure>(
  structure: TStructure,
): TStructure {
  return {
    ...structure,
    target_activities_per_week: Math.min(7, Math.ceil(structure.target_activities_per_week * 1.15)),
    target_weekly_tss_max: Math.round(structure.target_weekly_tss_max * 1.2),
    target_weekly_tss_min: Math.round(structure.target_weekly_tss_min * 1.15),
  };
}

export function extendTimeline<TStructure extends QuickAdjustmentPlanStructure>(
  structure: TStructure,
): TStructure {
  const currentTargetDate = structure.periodization_template?.target_date;
  if (!currentTargetDate) {
    return structure;
  }

  const nextTargetDate = new Date(currentTargetDate);
  nextTargetDate.setUTCDate(nextTargetDate.getUTCDate() + 21);

  return {
    ...structure,
    periodization_template: {
      ...structure.periodization_template,
      target_date: nextTargetDate.toISOString().slice(0, 10),
    },
  };
}

export function addRestDays<TStructure extends QuickAdjustmentPlanStructure>(
  structure: TStructure,
): TStructure {
  return {
    ...structure,
    min_rest_days_per_week: Math.min(4, structure.min_rest_days_per_week + 1),
    target_activities_per_week: Math.max(2, structure.target_activities_per_week - 1),
  };
}

export const ADJUSTMENT_PRESETS: AdjustmentPreset<QuickAdjustmentPlanStructure>[] = [
  {
    type: "reduce_intensity",
    label: "Reduce Intensity",
    icon: "-20%",
    description: "Lower TSS targets by 20% and add rest.",
    calculate: reduceIntensity,
  },
  {
    type: "increase_intensity",
    label: "Increase Intensity",
    icon: "+15%",
    description: "Raise TSS targets by 15-20%.",
    calculate: increaseIntensity,
  },
  {
    type: "extend_timeline",
    label: "Extend Timeline",
    icon: "+3w",
    description: "Add 3 weeks to the goal date.",
    calculate: extendTimeline,
  },
  {
    type: "add_rest_days",
    label: "More Rest",
    icon: "+rest",
    description: "Add an extra rest day per week.",
    calculate: addRestDays,
  },
];

export function getAdjustmentSummary<TStructure extends QuickAdjustmentPlanStructure>(
  oldStructure: TStructure,
  newStructure: TStructure,
): string[] {
  const changes: string[] = [];

  if (
    oldStructure.target_weekly_tss_min !== newStructure.target_weekly_tss_min ||
    oldStructure.target_weekly_tss_max !== newStructure.target_weekly_tss_max
  ) {
    changes.push(
      `Weekly TSS: ${oldStructure.target_weekly_tss_min}-${oldStructure.target_weekly_tss_max} -> ${newStructure.target_weekly_tss_min}-${newStructure.target_weekly_tss_max}`,
    );
  }

  if (oldStructure.target_activities_per_week !== newStructure.target_activities_per_week) {
    changes.push(
      `Activities/week: ${oldStructure.target_activities_per_week} -> ${newStructure.target_activities_per_week}`,
    );
  }

  if (oldStructure.min_rest_days_per_week !== newStructure.min_rest_days_per_week) {
    changes.push(
      `Rest days/week: ${oldStructure.min_rest_days_per_week} -> ${newStructure.min_rest_days_per_week}`,
    );
  }

  if (
    oldStructure.periodization_template?.target_date !==
    newStructure.periodization_template?.target_date
  ) {
    const oldDate = formatDateForSummary(oldStructure.periodization_template?.target_date);
    const newDate = formatDateForSummary(newStructure.periodization_template?.target_date);
    changes.push(`Goal date: ${oldDate} -> ${newDate}`);
  }

  return changes;
}

function formatDateForSummary(value: string | null | undefined): string {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}
