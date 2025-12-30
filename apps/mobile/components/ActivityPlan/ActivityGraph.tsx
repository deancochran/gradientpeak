// ================================
// Activity Graph Component
// ================================

import {
  type ActivityPlanStructureV2,
  extractActivityProfileV2,
} from "@repo/core";
import { memo } from "react";

interface ActivityGraphProps {
  structure: ActivityPlanStructureV2;
  currentStep?: number;
  onStepPress?: (stepIndex: number) => void;
  className?: string;
}
export const ActivityGraph = memo<ActivityGraphProps>(function ActivityGraph({
  structure,
  currentStep,
  onStepPress,
  className = "h-24",
}: ActivityGraphProps) {
  const profileData = extractActivityProfileV2(structure);
  const totalDuration = profileData.reduce(
    (sum, step) => sum + step.duration,
    0,
  );

  return null; // TODO: Implement graph visualization
});

ActivityGraph.displayName = "ActivityGraph";
