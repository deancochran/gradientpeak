import {
  deriveTrainingPlanScheduleVisual,
  type TrainingPlanPlannedSchedulePreview as TrainingPlanPlannedSchedulePreviewModel,
} from "@repo/core";

import { TrainingPlanPeriodizationPreview } from "./TrainingPlanPeriodizationPreview";

export function TrainingPlanPlannedPreview({
  compact = false,
  planId,
  preview,
  structure,
}: {
  compact?: boolean;
  planId: string;
  preview?: TrainingPlanPlannedSchedulePreviewModel | null;
  structure?: unknown;
}) {
  const model = deriveTrainingPlanScheduleVisual({ preview, structure });
  if (!model) return null;

  return (
    <TrainingPlanPeriodizationPreview
      compact={compact}
      model={model}
      testID={`training-plan-planned-preview-${planId}`}
    />
  );
}
