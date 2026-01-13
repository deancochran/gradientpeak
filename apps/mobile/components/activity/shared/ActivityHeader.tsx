import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { Calendar } from "lucide-react-native";
import React from "react";
import { View } from "react-native";

interface ActivityHeaderProps {
  type: "run" | "bike" | "swim" | "strength" | "other";
  name: string;
  startedAt: string;
  notes?: string;
  editable?: boolean;
  onNameChange?: (name: string) => void;
  onNotesChange?: (notes: string) => void;
}

const ACTIVITY_EMOJIS = {
  run: "🏃",
  bike: "🚴",
  swim: "🏊",
  strength: "💪",
  other: "🎯",
};

export function ActivityHeader({
  type,
  name,
  startedAt,
  notes,
  editable = false,
  onNameChange,
  onNotesChange,
}: ActivityHeaderProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <View className="items-center mb-4">
          <Text className="text-3xl mb-2">{ACTIVITY_EMOJIS[type]}</Text>

          {editable && onNameChange ? (
            <Input
              value={name}
              onChangeText={onNameChange}
              placeholder="Activity name"
              className="text-2xl font-bold text-center mb-2"
            />
          ) : (
            <Text className="text-2xl font-bold text-center">{name}</Text>
          )}
        </View>

        <View className="flex-row items-center justify-center gap-2 mb-4">
          <Icon as={Calendar} size={16} className="text-muted-foreground" />
          <Text className="text-sm text-muted-foreground">
            {format(new Date(startedAt), "EEEE, MMMM d, yyyy 'at' h:mm a")}
          </Text>
        </View>

        {editable && onNotesChange ? (
          <Textarea
            value={notes || ""}
            onChangeText={onNotesChange}
            placeholder="Add notes about your activity..."
            numberOfLines={4}
            className="min-h-20"
          />
        ) : (
          notes && (
            <View className="mt-4 p-3 bg-muted rounded-lg">
              <Text className="text-sm text-foreground">{notes}</Text>
            </View>
          )
        )}
      </CardContent>
    </Card>
  );
}
