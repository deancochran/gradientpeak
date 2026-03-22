import type { LucideIcon } from "lucide-react-native";
import * as React from "react";

import { View } from "../../lib/react-native";
import { Button } from "../button/index.native";
import { Card, CardContent } from "../card/index.native";
import { Text } from "../text/index.native";

export interface EmptyStateCardProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  iconSize?: number;
  iconColor?: string;
}

export function EmptyStateCard({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  iconSize = 48,
  iconColor = "text-muted-foreground",
}: EmptyStateCardProps) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="py-12">
        <View className="items-center justify-center gap-4">
          {Icon ? (
            <View className="items-center justify-center">
              <Icon size={iconSize} className={iconColor} strokeWidth={1.5} />
            </View>
          ) : null}
          <View className="items-center gap-2">
            <Text className="text-lg font-semibold text-center text-foreground">{title}</Text>
            <Text className="text-sm text-center text-muted-foreground max-w-[280px]">
              {description}
            </Text>
          </View>
          {actionLabel && onAction ? (
            <Button variant="outline" onPress={onAction} className="mt-2">
              <Text>{actionLabel}</Text>
            </Button>
          ) : null}
        </View>
      </CardContent>
    </Card>
  );
}
