import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { Calendar, Heart } from "lucide-react-native";
import { useState } from "react";
import { TouchableOpacity, View } from "react-native";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

interface TrainingPlanListItemProps {
  plan: {
    id: string;
    name: string;
    description?: string | null;
    likes_count?: number;
    has_liked?: boolean;
  };
  onPress?: () => void;
}

export function TrainingPlanListItem({ plan, onPress }: TrainingPlanListItemProps) {
  const navigateTo = useAppNavigate();
  const [isLiked, setIsLiked] = useState(plan.has_liked ?? false);
  const [likesCount, setLikesCount] = useState(plan.likes_count ?? 0);

  const toggleLikeMutation = api.social.toggleLike.useMutation({
    onError: () => {
      setIsLiked(plan.has_liked ?? false);
      setLikesCount(plan.likes_count ?? 0);
    },
  });

  const handleToggleLike = (e: any) => {
    e.stopPropagation();
    const newLikedState = !isLiked;
    setIsLiked(newLikedState);
    setLikesCount((prev) => (newLikedState ? prev + 1 : prev - 1));
    toggleLikeMutation.mutate({
      entity_id: plan.id,
      entity_type: "training_plan",
    });
  };

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      navigateTo(ROUTES.PLAN.TRAINING_PLAN.DETAIL(plan.id) as any);
    }
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
      <View className="mb-2 flex-row items-center justify-between rounded-xl border border-border bg-card p-3">
        <View className="flex-1 flex-row items-center gap-3">
          <Icon as={Calendar} size={20} className="shrink-0 text-muted-foreground" />
          <View className="min-w-0 flex-1">
            <Text className="flex-1 text-sm font-semibold" numberOfLines={1}>
              {plan.name}
            </Text>
            {plan.description ? (
              <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                {plan.description}
              </Text>
            ) : null}
          </View>
        </View>

        <TouchableOpacity onPress={handleToggleLike} className="ml-2 flex-row items-center">
          <Heart
            size={16}
            className={`${isLiked ? "fill-red-500 text-red-500" : "text-muted-foreground"}`}
            color={isLiked ? "#ef4444" : undefined}
          />
          <Text className={`ml-1 text-xs ${isLiked ? "text-red-500" : "text-muted-foreground"}`}>
            {likesCount}
          </Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}
