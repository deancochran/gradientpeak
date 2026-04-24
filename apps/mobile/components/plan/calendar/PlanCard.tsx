import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";

interface PlanCardProps {
  plan: {
    id: string;
    name: string;
    description?: string;
    activity_category: string;
    authoritative_metrics?: {
      estimated_duration?: number | null;
      estimated_tss?: number | null;
    } | null;
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
        estimatedDuration: plan.authoritative_metrics?.estimated_duration ?? undefined,
        estimatedTss: plan.authoritative_metrics?.estimated_tss ?? undefined,
        intensityFactor: undefined,
      }}
      onPress={() => onPress(plan.id)}
      variant="default"
    />
  );
}
