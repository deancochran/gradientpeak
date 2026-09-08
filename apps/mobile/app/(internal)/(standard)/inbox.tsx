import { Badge } from "@repo/ui/components/badge";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { useRouter } from "expo-router";
import { Bell, ChevronRight, MessageSquare } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";

function InboxRow({
  count,
  icon,
  label,
  onPress,
  testID,
}: {
  count: number;
  icon: typeof Bell;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label}, ${count} unread`}
      accessibilityRole="button"
      className="flex-row items-center gap-3 border-b border-border px-4 py-4 active:bg-accent"
      onPress={onPress}
      testID={testID}
    >
      <View className="h-11 w-11 items-center justify-center rounded-full bg-muted">
        <Icon as={icon} size={22} className="text-foreground" />
      </View>
      <Text className="flex-1 text-base font-medium text-foreground">{label}</Text>
      {count > 0 ? (
        <Badge variant="default">
          <Text className="text-xs text-primary-foreground">{count > 99 ? "99+" : count}</Text>
        </Badge>
      ) : null}
      <Icon as={ChevronRight} size={20} className="text-muted-foreground" />
    </Pressable>
  );
}

export default function InboxScreen() {
  const router = useRouter();
  const { data: messageCount = 0 } = api.messaging.getUnreadCount.useQuery();
  const { data: notificationCount = 0 } = api.notifications.getUnreadCount.useQuery();

  return (
    <View className="flex-1 bg-background" testID="inbox-screen">
      <View className="border-b border-border bg-muted/20 px-4 py-3">
        <Text className="text-sm text-muted-foreground">
          Messages and account updates in one place.
        </Text>
      </View>
      <InboxRow
        count={messageCount}
        icon={MessageSquare}
        label="Messages"
        onPress={() => router.navigate(ROUTES.MESSAGES)}
        testID="inbox-messages"
      />
      <InboxRow
        count={notificationCount}
        icon={Bell}
        label="Notifications"
        onPress={() => router.navigate(ROUTES.NOTIFICATIONS)}
        testID="inbox-notifications"
      />
    </View>
  );
}
