import React from "react";
import { TouchableOpacity, View } from "react-native";
import { Card, CardContent } from "@repo/ui/components/card";
import { Text } from "@repo/ui/components/text";
import { Icon } from "@repo/ui/components/icon";
import { Plus } from "lucide-react-native";

interface GhostCardProps {
  onPress: () => void;
  message?: string;
}

export function GhostCard({
  onPress,
  message = "Nothing scheduled. Tap to plan or find a route."
}: GhostCardProps) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card className="border-dashed border-2 border-muted-foreground/30 bg-transparent">
        <CardContent className="p-8">
          <View className="items-center gap-3">
            <View className="w-16 h-16 rounded-full bg-muted items-center justify-center">
              <Icon as={Plus} size={32} className="text-muted-foreground" />
            </View>
            <Text className="text-center text-muted-foreground text-base">
              {message}
            </Text>
          </View>
        </CardContent>
      </Card>
    </TouchableOpacity>
  );
}
