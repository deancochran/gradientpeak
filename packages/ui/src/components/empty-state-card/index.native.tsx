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
}: EmptyStateCardProps) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="py-12">
        <View className="items-center justify-center gap-4">
          {Icon ? (
            <View className="items-center justify-center">
              <Icon className={iconColor} size={iconSize} strokeWidth={1.5} />
            </View>
          ) : null}

          <View className="items-center gap-2">
            <Text className="text-center text-lg font-semibold text-foreground">{title}</Text>
            <Text className="max-w-[280px] text-center text-sm text-muted-foreground">
              {description}
            </Text>
          </View>

          {actionLabel && onAction ? (
            <Button className="mt-2" onPress={onAction} variant="outline">
              <Text>{actionLabel}</Text>
            </Button>
          ) : null}
        </View>
      </CardContent>
    </Card>
  );
}

export type { EmptyStateCardProps } from "./shared";
export { EmptyStateCard };
