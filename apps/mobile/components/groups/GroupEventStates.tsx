import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Text } from "@repo/ui/components/text";
import { CalendarDays } from "lucide-react-native";
import { View } from "react-native";

export function GroupEventEmptyState({
  actionLabel,
  description = "No one-off events are scheduled for this group yet.",
  onActionPress,
  title = "No events yet",
}: {
  actionLabel?: string;
  description?: string;
  onActionPress?: () => void;
  title?: string;
}) {
  return (
    <View className="items-center justify-center rounded-2xl border border-border bg-card px-6 py-10">
      <View className="mb-4 rounded-full bg-primary/10 p-4">
        <CalendarDays size={30} className="text-primary" />
      </View>
      <Text className="text-center text-lg font-semibold text-foreground">{title}</Text>
      <Text className="mt-2 text-center text-sm leading-5 text-muted-foreground">
        {description}
      </Text>
      {onActionPress && actionLabel ? (
        <Button className="mt-5" onPress={onActionPress}>
          <Text className="text-sm font-semibold text-primary-foreground">{actionLabel}</Text>
        </Button>
      ) : null}
    </View>
  );
}

export function GroupEventListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View className="gap-3">
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} className="gap-3 rounded-2xl border border-border bg-card p-4">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-full" />
        </View>
      ))}
    </View>
  );
}
