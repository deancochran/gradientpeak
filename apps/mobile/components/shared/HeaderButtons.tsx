import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { cn } from "@repo/ui/lib/cn";
import { useRouter } from "expo-router";
import { Bell, MessageSquare, Search } from "lucide-react-native";
import { TouchableOpacity, View } from "react-native";
import { api } from "@/lib/api";

interface HeaderButtonProps {
  className?: string;
}

export function SearchHeaderButton({ className }: HeaderButtonProps = {}) {
  const router = useRouter();

  return (
    <TouchableOpacity
      onPress={() => router.navigate("/search")}
      testID="search-header-button"
      className={cn("w-10 h-10 items-center justify-center mr-2", className)}
      accessibilityLabel="Search"
    >
      <Icon as={Search} size={24} className="text-foreground" />
    </TouchableOpacity>
  );
}

export function MessagesHeaderButton({ className }: HeaderButtonProps = {}) {
  const router = useRouter();
  const { data: unreadCount = 0 } = api.messaging.getUnreadCount.useQuery();

  return (
    <TouchableOpacity
      onPress={() => router.navigate("/messages")}
      testID="messages-header-button"
      className={cn("w-10 h-10 items-center justify-center mr-2", className)}
    >
      <Icon as={MessageSquare} size={24} className="text-foreground" />
      {unreadCount > 0 && (
        <View className="absolute top-1 right-1 bg-destructive w-4 h-4 rounded-full items-center justify-center">
          <Text className="text-[10px] font-bold text-destructive-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export function NotificationsHeaderButton({ className }: HeaderButtonProps = {}) {
  const router = useRouter();
  const { data: unreadCount = 0 } = api.notifications.getUnreadCount.useQuery();

  return (
    <TouchableOpacity
      onPress={() => router.navigate("/notifications")}
      testID="notifications-header-button"
      className={cn("w-10 h-10 items-center justify-center mr-2", className)}
    >
      <Icon as={Bell} size={24} className="text-foreground" />
      {unreadCount > 0 && (
        <View className="absolute top-1 right-1 bg-destructive w-4 h-4 rounded-full items-center justify-center">
          <Text className="text-[10px] font-bold text-destructive-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
