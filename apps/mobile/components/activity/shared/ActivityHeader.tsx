import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import {
  Activity,
  Bike,
  Dumbbell,
  Footprints,
  Waves,
} from "lucide-react-native";
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
  const deviceInfo = [activity.device_manufacturer, activity.device_product]
    .filter(Boolean)
    .join(" ");

  const ActivityIcon = ACTIVITY_ICONS[activity.type] || Activity;

  const Content = (
    <>
      {/* Header: Avatar + Username + Metadata */}
      <View className="flex-row items-start gap-3 mb-3">
        <Avatar className="w-10 h-10" alt={user.username}>
          {user.avatarUrl && <AvatarImage source={{ uri: user.avatarUrl }} />}
          <AvatarFallback>
            <Text className="text-sm font-semibold">
              {user.username?.[0]?.toUpperCase() || "?"}
            </Text>
          </AvatarFallback>
        </Avatar>

        <View className="flex-1">
          {/* Username */}
          <Text className="text-sm font-semibold text-foreground">
            {user.username}
          </Text>

          {/* Metadata Row: Icon + Date/Time + Device */}
          <View className="flex-row items-center gap-1.5 mt-1">
            <Icon
              as={ActivityIcon}
              size={12}
              className="text-muted-foreground"
            />
            <Text className="text-xs text-muted-foreground">
              {format(new Date(activity.startedAt), "MMM d, yyyy • h:mm a")}
            </Text>
            {deviceInfo && (
              <>
                <Text className="text-xs text-muted-foreground">•</Text>
                <Text className="text-xs text-muted-foreground">
                  {deviceInfo}
                </Text>
              </>
            )}
            {activity.location && (
              <>
                <Text className="text-xs text-muted-foreground">•</Text>
                <Text className="text-xs text-muted-foreground capitalize">
                  {activity.location}
                </Text>
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
        <Text className="text-base font-semibold text-foreground mb-2">
          {activity.name}
        </Text>
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
