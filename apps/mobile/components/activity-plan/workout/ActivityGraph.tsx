// ================================
// Activity Graph Component
// ================================

import {
  type ActivityPlanStructureV3,
  compileActivityPlanV3,
  extractActivityProfile,
} from "@repo/core";
import { memo } from "react";

interface ActivityGraphProps {
  structure: ActivityPlanStructureV3;
  currentStep?: number;
  onStepPress?: (stepIndex: number) => void;
  className?: string;
}
export const ActivityGraph = memo<ActivityGraphProps>(function ActivityGraph({
  structure,
}: ActivityGraphProps) {
  const profileData = extractActivityProfile(compileActivityPlanV3(structure));
  const _totalDuration = profileData.reduce((sum, step) => sum + (step.durationSeconds ?? 0), 0);

  return null; // TODO: Implement graph visualization
});

ActivityGraph.displayName = "ActivityGraph";
