import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { MapPin, Smartphone } from "lucide-react-native";
import React from "react";
import { View } from "react-native";

interface ActivityHeaderProps {
  user: {
    username: string;
    avatarUrl?: string | null;
  };
  activity: {
    type: string;
    name: string;
    startedAt: string;
    device_manufacturer?: string | null;
    device_product?: string | null;
    location?: string | null;
  };
  notes?: string;
  editable?: boolean;
  onNameChange?: (name: string) => void;
  onNotesChange?: (notes: string) => void;
  variant?: "card" | "embedded";
}

const ACTIVITY_EMOJIS: Record<string, string> = {
  run: "🏃",
  bike: "🚴",
  swim: "🏊",
  strength: "💪",
  other: "🎯",
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
  const deviceInfo = [activity.device_manufacturer, activity.device_product]
    .filter(Boolean)
    .join(" ");

  const Content = (
    <>
      {/* Row 1: User & Date */}
      <View className="flex-row items-center gap-3 mb-3">
        <Avatar className="w-8 h-8" alt={user.username}>
          {user.avatarUrl && <AvatarImage source={{ uri: user.avatarUrl }} />}
          <AvatarFallback>
            <Text className="text-xs font-semibold">
              {user.username?.[0]?.toUpperCase() || "?"}
            </Text>
          </AvatarFallback>
        </Avatar>
        <View className="flex-1">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-foreground">
              {user.username}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {format(new Date(activity.startedAt), "MMM d, yyyy • h:mm a")}
            </Text>
          </View>
          {activity.location && (
            <View className="flex-row items-center gap-1 mt-0.5">
              <Icon as={MapPin} size={10} className="text-muted-foreground" />
              <Text className="text-xs text-muted-foreground">
                {activity.location}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Row 2: Activity Info */}
      <View className="flex-row items-center gap-3">
        <View className="w-8 items-center justify-center">
          <Text className="text-xl">
            {ACTIVITY_EMOJIS[activity.type] || "🎯"}
          </Text>
        </View>
        <View className="flex-1">
          {editable && onNameChange ? (
            <Input
              value={activity.name}
              onChangeText={onNameChange}
              placeholder="Activity name"
              className="text-base font-bold h-8 p-0 border-0"
            />
          ) : (
            <Text className="text-base font-bold text-foreground">
              {activity.name}
            </Text>
          )}
          {deviceInfo && (
            <View className="flex-row items-center gap-1 mt-0.5">
              <Icon
                as={Smartphone}
                size={10}
                className="text-muted-foreground"
              />
              <Text className="text-xs text-muted-foreground">
                {deviceInfo}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Notes Section */}
      {(editable || notes) && (
        <View className="mt-4 pt-3 border-t border-border">
          {editable && onNotesChange ? (
            <Textarea
              value={notes || ""}
              onChangeText={onNotesChange}
              placeholder="Add notes..."
              numberOfLines={3}
              className="min-h-16 text-sm"
            />
          ) : (
            notes && (
              <Text className="text-sm text-muted-foreground italic">
                {notes}
              </Text>
            )
          )}
        </View>
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
