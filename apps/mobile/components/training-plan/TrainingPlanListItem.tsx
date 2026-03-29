import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { useRouter } from "expo-router";
import { Calendar, Heart } from "lucide-react-native";
import { useState } from "react";
import { TouchableOpacity, View } from "react-native";
import { ROUTES } from "@/lib/constants/routes";
import { trpc } from "@/lib/trpc";

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
  const router = useRouter();
  const [isLiked, setIsLiked] = useState(plan.has_liked ?? false);
  const [likesCount, setLikesCount] = useState(plan.likes_count ?? 0);

  const toggleLikeMutation = trpc.social.toggleLike.useMutation({
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
      router.push(ROUTES.PLAN.TRAINING_PLAN.DETAIL(plan.id) as any);
    }
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
      <Card className="mb-2">
        <CardContent className="p-3 flex-row items-center justify-between">
          <View className="flex-1 flex-row items-center gap-3">
            <Icon as={Calendar} size={20} className="text-muted-foreground shrink-0" />
            <View className="flex-1 min-w-0">
              <View className="flex-row items-center gap-2">
                <Text className="font-semibold text-sm flex-1" numberOfLines={1}>
                  {plan.name}
                </Text>
              </View>
              {plan.description && (
                <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                  {plan.description}
                </Text>
              )}
            </View>
          </View>

          <TouchableOpacity onPress={handleToggleLike} className="flex-row items-center ml-2">
            <Heart
              size={16}
              className={`${isLiked ? "fill-red-500 text-red-500" : "text-muted-foreground"}`}
              color={isLiked ? "#ef4444" : undefined}
            />
            <Text className={`ml-1 text-xs ${isLiked ? "text-red-500" : "text-muted-foreground"}`}>
              {likesCount}
            </Text>
          </TouchableOpacity>
        </CardContent>
      </Card>
    </TouchableOpacity>
  );
}
