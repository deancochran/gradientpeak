import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { cn } from "@repo/ui/lib/cn";
import { useRouter } from "expo-router";
import { Bell, Inbox, MessageSquare, Search } from "lucide-react-native";
import { TouchableOpacity, View } from "react-native";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAuth } from "@/lib/hooks/useAuth";
import { getReachableSupabaseStorageUrl } from "@/lib/server-config";

interface HeaderButtonProps {
  className?: string;
}

export function MeHeaderButton({ className }: HeaderButtonProps = {}) {
  const router = useRouter();
  const { profile, user } = useAuth();
  const avatarUri = profile?.avatar_url ? getReachableSupabaseStorageUrl(profile.avatar_url) : null;
  const fallback =
    profile?.username?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || "A";

  return (
    <TouchableOpacity
      accessibilityLabel="Open Me"
      accessibilityRole="button"
      activeOpacity={0.7}
      className={cn("h-11 w-11 items-center justify-center", className)}
      onPress={() => router.navigate(ROUTES.ME)}
      testID="app-header-avatar-button"
    >
      <Avatar alt={profile?.username || "User profile"} className="h-8 w-8 border border-border">
        {avatarUri ? <AvatarImage source={{ uri: avatarUri }} key={avatarUri} /> : null}
        <AvatarFallback>
          <Text className="text-xs font-semibold text-foreground">{fallback}</Text>
        </AvatarFallback>
      </Avatar>
    </TouchableOpacity>
  );
}

export function InboxHeaderButton({ className }: HeaderButtonProps = {}) {
  const router = useRouter();
  const { data: messageCount = 0 } = api.messaging.getUnreadCount.useQuery();
  const { data: notificationCount = 0 } = api.notifications.getUnreadCount.useQuery();
  const unreadCount = messageCount + notificationCount;

  return (
    <TouchableOpacity
      accessibilityLabel="Inbox"
      accessibilityRole="button"
      accessibilityValue={{
        text: unreadCount > 0 ? `${unreadCount} unread items` : "No unread items",
      }}
      activeOpacity={0.7}
      className={cn("h-11 w-11 items-center justify-center", className)}
      onPress={() => router.navigate(ROUTES.INBOX)}
      testID="inbox-header-button"
    >
      <Icon as={Inbox} size={24} className="text-foreground" />
      {unreadCount > 0 ? (
        <View className="absolute right-0 top-0 h-5 min-w-5 items-center justify-center rounded-full bg-destructive-surface px-1">
          <Text className="text-[10px] font-bold text-destructive-surface-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export function SearchHeaderButton({ className }: HeaderButtonProps = {}) {
  const router = useRouter();

  return (
    <TouchableOpacity
      onPress={() => router.navigate(ROUTES.DISCOVER)}
      testID="search-header-button"
      className={cn("w-11 h-11 items-center justify-center mr-2", className)}
      accessibilityRole="button"
      accessibilityLabel="Search"
      activeOpacity={0.7}
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
      className={cn("w-11 h-11 items-center justify-center mr-2", className)}
      accessibilityRole="button"
      accessibilityLabel="Messages"
      accessibilityValue={{
        text:
          unreadCount > 0
            ? `${unreadCount} unread message${unreadCount === 1 ? "" : "s"}`
            : "No unread messages",
      }}
      activeOpacity={0.7}
    >
      <Icon as={MessageSquare} size={24} className="text-foreground" />
      {unreadCount > 0 && (
        <View className="absolute top-1 right-1 bg-destructive-surface w-4 h-4 rounded-full items-center justify-center">
          <Text className="text-[10px] font-bold text-destructive-surface-foreground">
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
      className={cn("w-11 h-11 items-center justify-center mr-2", className)}
      accessibilityRole="button"
      accessibilityLabel="Notifications"
      accessibilityValue={{
        text:
          unreadCount > 0
            ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
            : "No unread notifications",
      }}
      activeOpacity={0.7}
    >
      <Icon as={Bell} size={24} className="text-foreground" />
      {unreadCount > 0 && (
        <View className="absolute top-1 right-1 bg-destructive-surface w-4 h-4 rounded-full items-center justify-center">
          <Text className="text-[10px] font-bold text-destructive-surface-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
