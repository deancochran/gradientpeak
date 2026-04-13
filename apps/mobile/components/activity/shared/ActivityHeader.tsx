import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Input } from "@repo/ui/components/input";
import { Text } from "@repo/ui/components/text";
import { Textarea } from "@repo/ui/components/textarea";
import { format } from "date-fns";
import { useRouter } from "expo-router";
import { Activity, Bike, Dumbbell, Footprints, Waves } from "lucide-react-native";
import React from "react";
import { Pressable, View } from "react-native";
import { useDedupedPush } from "@/lib/navigation/useDedupedPush";

interface ActivityHeaderProps {
  user: {
    id?: string;
    username: string;
    avatarUrl?: string | null;
  };
  activity: {
    type: string;
    name: string;
    startedAt: string;
    device_manufacturer?: string | null;
    device_product?: string | null;
  };
  notes?: string;
  editable?: boolean;
  onNameChange?: (name: string) => void;
  onNotesChange?: (notes: string) => void;
  variant?: "card" | "embedded";
}

// Map activity types to Lucide icons
const ACTIVITY_ICONS: Record<string, any> = {
  run: Footprints,
  bike: Bike,
  swim: Waves,
  strength: Dumbbell,
  other: Activity,
};

export function ActivityHeader({
  user,
  activity,
  notes,
  editable = false,
  onNameChange,
  onNotesChange,
  variant = "card",
}: ActivityHeaderProps) {
  const router = useRouter();
  const pushIfNotCurrent = useDedupedPush();
  const deviceInfo = [activity.device_manufacturer, activity.device_product]
    .filter(Boolean)
    .join(" ");

  const ActivityIcon = ACTIVITY_ICONS[activity.type] || Activity;

  const handleUserPress = () => {
    if (!user.id) return;
    pushIfNotCurrent({
      pathname: "/user/[userId]",
      params: { userId: user.id },
    } as any);
  };

  const Content = (
    <>
      {/* Header: Avatar + Username + Metadata */}
      <View className="flex-row items-start gap-3 mb-3">
        <Pressable onPress={handleUserPress} disabled={!user.id}>
          <Avatar className="w-10 h-10" alt={user.username}>
            {user.avatarUrl && <AvatarImage source={{ uri: user.avatarUrl }} />}
            <AvatarFallback>
              <Text className="text-sm font-semibold">
                {user.username?.[0]?.toUpperCase() || "?"}
              </Text>
            </AvatarFallback>
          </Avatar>
        </Pressable>

        <View className="flex-1">
          <Pressable onPress={handleUserPress} disabled={!user.id}>
            <Text className="text-sm font-semibold text-foreground">{user.username}</Text>
          </Pressable>

          <View className="flex-row items-center gap-1.5 mt-1">
            <Icon as={ActivityIcon} size={12} className="text-muted-foreground" />
            <Text className="text-xs text-muted-foreground">
              {format(new Date(activity.startedAt), "MMM d, yyyy • h:mm a")}
            </Text>
            {deviceInfo && (
              <>
                <Text className="text-xs text-muted-foreground">•</Text>
                <Text className="text-xs text-muted-foreground">{deviceInfo}</Text>
              </>
            )}
          </View>
        </View>
      </View>

      {/* Activity Name */}
      {editable && onNameChange ? (
        <Input
          value={activity.name}
          onChangeText={onNameChange}
          placeholder="Activity name"
          className="text-base font-semibold mb-2 h-10 px-0 border-0"
        />
      ) : (
        <Text className="text-base font-semibold text-foreground mb-2">{activity.name}</Text>
      )}

      {/* Notes/Description */}
      {editable && onNotesChange ? (
        <Textarea
          value={notes || ""}
          onChangeText={onNotesChange}
          placeholder="Add notes..."
          numberOfLines={3}
          className="min-h-16 text-sm"
        />
      ) : (
        notes && <Text className="text-sm text-muted-foreground">{notes}</Text>
      )}
    </>
  );

  if (variant === "embedded") {
    return <View>{Content}</View>;
  }

  return (
    <Card>
      <CardContent className="p-4">{Content}</CardContent>
    </Card>
  );
}
