// ================================
// Activity Graph Component
// ================================

import { ActivityPlanStructure, extractActivityProfile } from "@repo/core";
import { memo } from "react";

interface ActivityGraphProps {
  structure: ActivityPlanStructure;
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
  const profileData = extractActivityProfile(structure);
  const totalDuration = profileData.reduce(
    (sum, step) => sum + step.duration,
    0,
  );
});

ActivityGraph.displayName = "ActivityGraph";
