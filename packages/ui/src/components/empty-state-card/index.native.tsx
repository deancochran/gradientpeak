import { View } from "react-native";

import { cn } from "../../lib/cn";
import { Button } from "../button/index.native";
import { Card, CardContent } from "../card/index.native";
import { Text } from "../text/index.native";
import { type EmptyStateCardProps, emptyStateToneClassNames } from "./shared";

function EmptyStateCard({
  actionLabel,
  children,
  compact = false,
  description,
  icon: Icon,
  iconColor = "text-muted-foreground",
  iconSize = 48,
  onAction,
  title,
  testID,
  tone = "empty",
}: EmptyStateCardProps) {
  const isError = tone === "error" || tone === "unavailable";

  return (
    <Card
      accessibilityLiveRegion={isError ? "assertive" : undefined}
      className={cn(emptyStateToneClassNames[tone], compact && "py-0")}
      testID={testID}
    >
      <CardContent className={compact ? "py-6" : "py-12"}>
        <View className="items-center justify-center gap-4">
          {Icon ? (
            <View className="items-center justify-center">
              <Icon className={iconColor} size={iconSize} strokeWidth={1.5} />
            </View>
          ) : null}

          <View className="min-w-0 max-w-full items-center gap-2">
            <Text
              className={cn(
                "max-w-full text-center font-semibold text-foreground",
                compact ? "text-base" : "text-lg",
              )}
            >
              {title}
            </Text>
            {description ? (
              <Text className="max-w-full text-center text-sm text-muted-foreground">
                {description}
              </Text>
            ) : null}
          </View>
          {children}

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
