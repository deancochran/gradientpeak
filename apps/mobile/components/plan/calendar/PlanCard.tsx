import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";

interface PlanCardProps {
  plan: {
    id: string;
    name: string;
    description?: string;
    activity_category: string;
    estimated_duration?: number;
    estimated_tss?: number;
    created_by?: string;
    structure?: {
      steps: any[];
    };
  };
  onPress: (planId: string) => void;
  showOwnership?: boolean;
}

export function PlanCard({ plan, onPress, showOwnership: _showOwnership = true }: PlanCardProps) {
  return (
    <ActivityPlanCard
      activity={{
        id: plan.id,
        name: plan.name,
        description: plan.description,
        activityType: plan.activity_category,
        estimatedDuration: plan.estimated_duration,
        estimatedTss: plan.estimated_tss,
        intensityFactor: undefined,
      }}
      onPress={() => onPress(plan.id)}
      variant="default"
    />
  );
}
