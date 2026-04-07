import { formatDurationSec } from "@repo/core";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "expo-router";
import { Clock, Heart, MapPin, MessageCircle, TrendingUp, Zap } from "lucide-react-native";
import { useCallback, useState } from "react";
import { TouchableOpacity, View } from "react-native";
import { api } from "@/lib/api";
import { getActivityCategoryConfig } from "@/lib/constants/activities";

// ============================================
// TYPES
// ============================================

export interface FeedActivityItem {
  id: string;
  profile_id: string;
  name: string;
  type: string;
  started_at: string;
  distance_meters: number;
  duration_seconds: number;
  moving_seconds: number;
  avg_heart_rate: number | null;
  avg_power: number | null;
  avg_cadence: number | null;
  elevation_gain_meters: number | null;
  calories: number | null;
  polyline: string | null;
  likes_count: number;
  comments_count: number;
  is_private: boolean;

  profile?: {
    id: string;
    username: string | null;
    avatar_url: string | null;
  };

  has_liked: boolean;
  derived?: {
    tss: number | null;
    intensity_factor: number | null;
    computed_as_of: string;
  } | null;
}

interface ActivityFeedItemProps {
  activity: FeedActivityItem;
  onLikeToggle?: (activityId: string, currentlyLiked: boolean) => void;
  onCommentPress?: (activityId: string) => void;
}

// ============================================
// COMPONENT
// ============================================

export function ActivityFeedItem({
  activity,
  onLikeToggle,
  onCommentPress,
}: ActivityFeedItemProps) {
  const router = useRouter();
  const [isLiked, setIsLiked] = useState(activity.has_liked);
  const [likesCount, setLikesCount] = useState(activity.likes_count);

  const activityConfig = getActivityCategoryConfig(activity.type);

  const toggleLikeMutation = api.social.toggleLike.useMutation({
    onSuccess: (data) => {
      setIsLiked(data.liked);
      setLikesCount((prev) => (data.liked ? prev + 1 : prev - 1));
      onLikeToggle?.(activity.id, data.liked);
    },
  });

  const handleLikePress = useCallback(() => {
    toggleLikeMutation.mutate({
      entity_id: activity.id,
      entity_type: "activity",
    });
  }, [activity.id]);

  const handleCommentPress = useCallback(() => {
    onCommentPress?.(activity.id);
  }, [activity.id, onCommentPress]);

  const handleProfilePress = useCallback(() => {
    if (activity.profile?.id) {
      router.push(`/user/${activity.profile.id}` as any);
    }
  }, [activity.profile?.id, router]);

  const handleActivityPress = useCallback(() => {
    router.push(`/activity-detail?id=${activity.id}` as any);
  }, [activity.id, router]);

  const formatActivityDate = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
    } catch {
      return "";
    }
  };

  const formatDurationDisplay = (seconds: number) => {
    return formatDurationSec(seconds);
  };

  const formatDistanceDisplay = (meters: number) => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(2)} km`;
    }
    return `${meters} m`;
  };

  return (
    <Card className="mb-3 mx-4 mt-2">
      <CardContent className="p-4">
        {/* Header: Avatar, Username, Timestamp */}
        <TouchableOpacity className="flex-row items-center mb-3" onPress={handleProfilePress}>
          <Avatar alt={activity.profile?.username || "User"} className="h-10 w-10 mr-3">
            {activity.profile?.avatar_url && (
              <AvatarImage source={{ uri: activity.profile.avatar_url }} />
            )}
            <AvatarFallback>
              <Text className="text-sm">
                {activity.profile?.username?.charAt(0)?.toUpperCase() || "U"}
              </Text>
            </AvatarFallback>
          </Avatar>
          <View className="flex-1">
            <Text className="font-semibold text-foreground">
              {activity.profile?.username || "Unknown User"}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {formatActivityDate(activity.started_at)}
            </Text>
          </View>
          <View
            className={`flex-row items-center px-2 py-1 rounded-full ${activityConfig.bgColor}`}
          >
            <Icon as={activityConfig.icon} size={14} className={`mr-1 ${activityConfig.color}`} />
            <Text className={`text-xs font-medium ${activityConfig.color}`}>
              {activityConfig.name}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Activity Details - Clickable */}
        <TouchableOpacity onPress={handleActivityPress}>
          <Text className="text-lg font-bold text-foreground mb-2">{activity.name}</Text>

          {/* Stats Row */}
          <View className="flex-row flex-wrap gap-x-3 gap-y-1 mb-2">
            {activity.distance_meters > 0 && (
              <View className="flex-row items-center">
                <Icon as={MapPin} size={12} className="text-muted-foreground mr-1" />
                <Text className="text-sm text-foreground">
                  {formatDistanceDisplay(activity.distance_meters)}
                </Text>
              </View>
            )}

            {activity.duration_seconds > 0 && (
              <View className="flex-row items-center">
                <Icon as={Clock} size={12} className="text-muted-foreground mr-1" />
                <Text className="text-sm text-foreground">
                  {formatDurationDisplay(activity.duration_seconds)}
                </Text>
              </View>
            )}

            {activity.avg_heart_rate !== null && (
              <View className="flex-row items-center">
                <Icon as={Heart} size={12} className="text-muted-foreground mr-1" />
                <Text className="text-sm text-foreground">{activity.avg_heart_rate}</Text>
              </View>
            )}

            {activity.avg_power !== null && (
              <View className="flex-row items-center">
                <Icon as={Zap} size={12} className="text-muted-foreground mr-1" />
                <Text className="text-sm text-foreground">{activity.avg_power}</Text>
              </View>
            )}

            {activity.derived?.tss !== null && activity.derived?.tss !== undefined && (
              <View className="flex-row items-center">
                <Icon as={TrendingUp} size={12} className="text-muted-foreground mr-1" />
                <Text className="text-sm text-foreground">{activity.derived.tss}</Text>
              </View>
            )}
          </View>

          {/* Map Preview Indicator */}
          {activity.polyline && (
            <View className="flex-row items-center mt-2">
              <MapPin size={14} className="text-muted-foreground mr-1" />
              <Text className="text-xs text-muted-foreground">Route available</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Actions Row */}
        <View className="flex-row items-center mt-3 pt-3 border-t border-border">
          {/* Like Button */}
          <TouchableOpacity
            className="flex-row items-center mr-4"
            onPress={handleLikePress}
            disabled={toggleLikeMutation.isPending}
          >
            <Heart
              size={20}
              className={`mr-1 ${isLiked ? "fill-red-500 text-red-500" : "text-muted-foreground"}`}
              color={isLiked ? "#ef4444" : undefined}
            />
            <Text className={`text-sm ${isLiked ? "text-red-500" : "text-muted-foreground"}`}>
              {likesCount}
            </Text>
          </TouchableOpacity>

          {/* Comment Button */}
          <TouchableOpacity className="flex-row items-center" onPress={handleCommentPress}>
            <MessageCircle size={20} className="mr-1 text-muted-foreground" />
            <Text className="text-sm text-muted-foreground">{activity.comments_count}</Text>
          </TouchableOpacity>
        </View>
      </CardContent>
    </Card>
  );
}
