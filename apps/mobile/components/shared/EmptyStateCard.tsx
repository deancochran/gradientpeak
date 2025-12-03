import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { LucideIcon } from "lucide-react-native";
import { View } from "react-native";

interface EmptyStateCardProps {
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
          {Icon && (
            <View className="items-center justify-center">
              <Icon
                size={iconSize}
                className={iconColor}
                strokeWidth={1.5}
              />
            </View>
          )}

          <View className="items-center gap-2">
            <Text className="text-lg font-semibold text-center text-foreground">
              {title}
            </Text>
            <Text className="text-sm text-center text-muted-foreground max-w-[280px]">
              {description}
            </Text>
          </View>

          {actionLabel && onAction && (
            <Button
              variant="outline"
              onPress={onAction}
              className="mt-2"
            >
              <Text>{actionLabel}</Text>
            </Button>
          )}
        </View>
      </CardContent>
    </Card>
  );
}
