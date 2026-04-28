import { Text } from "@repo/ui/components/text";
import React from "react";
import { View } from "react-native";

export function SurfaceUnavailableCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <View className="flex-1 items-center justify-center rounded-2xl border border-border bg-card p-6">
      <Text className="text-lg font-semibold text-foreground">{title}</Text>
      <Text className="mt-2 text-center text-sm text-muted-foreground">{description}</Text>
    </View>
  );
}
