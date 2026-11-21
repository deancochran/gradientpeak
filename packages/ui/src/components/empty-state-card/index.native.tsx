import { View } from "react-native";

import { Button } from "../button/index.native";
import { Card, CardContent } from "../card/index.native";
import { Text } from "../text/index.native";
import type { EmptyStateCardProps } from "./shared";

function EmptyStateCard({
  actionLabel,
  description,
  icon: Icon,
  iconColor = "text-muted-foreground",
  iconSize = 48,
  onAction,
  title,
  tone = "empty",
}: EmptyStateCardProps) {
  const isError = tone === "error" || tone === "unavailable";
  const toneClassName =
    tone === "error"
      ? "border-destructive/50 bg-destructive/10"
      : tone === "denied"
        ? "border-warning/50 bg-warning/10"
        : tone === "unavailable"
          ? "border-warning/50 bg-card"
          : "border-border bg-card";

  return (
    <Card accessibilityLiveRegion={isError ? "assertive" : undefined} className={toneClassName}>
      <CardContent className="py-12">
        <View className="items-center justify-center gap-4">
          {Icon ? (
            <View className="items-center justify-center">
              <Icon className={iconColor} size={iconSize} strokeWidth={1.5} />
            </View>
          ) : null}

          <View className="min-w-0 max-w-full items-center gap-2">
            <Text className="max-w-full text-center text-lg font-semibold text-foreground">
              {title}
            </Text>
            <Text className="max-w-full text-center text-sm text-muted-foreground">
              {description}
            </Text>
          </View>

          {actionLabel && onAction ? (
            <Button className="mt-2 h-auto max-w-full" onPress={onAction} variant="outline">
              <Text className="max-w-full text-center">{actionLabel}</Text>
            </Button>
          ) : null}
        </View>
      </CardContent>
    </Card>
  );
}

export type { EmptyStateCardProps } from "./shared";
export { EmptyStateCard };
