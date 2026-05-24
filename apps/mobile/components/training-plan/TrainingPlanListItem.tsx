import type { EntityOwner } from "@/components/shared/EntityOwnerRow";
import { TrainingPlanCard } from "@/components/shared/TrainingPlanCard";
import { ROUTES } from "@/lib/constants/routes";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

interface TrainingPlanListItemProps {
  plan: {
    id: string;
    name: string;
    description?: string | null;
    likes_count?: number;
    has_liked?: boolean;
    owner?: EntityOwner | null;
    created_at?: string | null;
    updated_at?: string | null;
  };
  onPress?: () => void;
}

export function TrainingPlanListItem({ plan, onPress }: TrainingPlanListItemProps) {
  const navigateTo = useAppNavigate();

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      navigateTo(ROUTES.PLAN.TRAINING_PLAN.DETAIL(plan.id) as any);
    }
  };

  return <TrainingPlanCard plan={plan} onPress={handlePress} variant="compact" />;
}
