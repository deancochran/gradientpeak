import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Text } from "@repo/ui/components/text";
import { Lock, Users } from "lucide-react-native";
import { View } from "react-native";

type EmptyStateProps = {
  actionLabel?: string;
  description?: string;
  onActionPress?: () => void;
  title?: string;
};

export function GroupEmptyState({
  actionLabel,
  description = "Create or join a group to train with other athletes.",
  onActionPress,
  title = "No groups yet",
}: EmptyStateProps) {
  return (
    <View className="items-center justify-center px-6 py-12">
      <View className="mb-4 rounded-full bg-primary/10 p-4">
        <Users size={32} className="text-primary" />
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

export function GroupListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View className="gap-3 p-4">
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} className="gap-3 rounded-2xl border border-border bg-card p-4">
          <View className="flex-row items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-full" />
            <View className="flex-1 gap-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </View>
          </View>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <View className="flex-row gap-2">
            <Skeleton className="h-7 w-20 rounded-full" />
            <Skeleton className="h-7 w-28 rounded-full" />
          </View>
        </View>
      ))}
    </View>
  );
}

export function GroupMembersOnlyLockedState({ onRequestAccess }: { onRequestAccess?: () => void }) {
  return (
    <View className="items-center justify-center rounded-2xl border border-border bg-card px-6 py-10">
      <View className="mb-4 rounded-full bg-muted p-4">
        <Lock size={28} className="text-muted-foreground" />
      </View>
      <Text className="text-center text-lg font-semibold text-foreground">Private group</Text>
      <Text className="mt-2 text-center text-sm leading-5 text-muted-foreground">
        Join this group to see members, events, and full group content.
      </Text>
      {onRequestAccess ? (
        <Button className="mt-5" onPress={onRequestAccess}>
          <Text className="text-sm font-semibold text-primary-foreground">Request access</Text>
        </Button>
      ) : null}
    </View>
  );
}
