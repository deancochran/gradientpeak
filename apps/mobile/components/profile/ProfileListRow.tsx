import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Text } from "@repo/ui/components/text";
import { TouchableOpacity, View } from "react-native";
import { getReachableSupabaseStorageUrl } from "@/lib/server-config";

export type ProfileListRowProfile = {
  avatar_url: string | null;
  id: string;
  username: string | null;
};

export function ProfileListRow({
  onPress,
  profile,
}: {
  onPress: (profileId: string) => void;
  profile: ProfileListRowProfile;
}) {
  const displayName = profile.username || "Unknown user";
  const avatarUri = profile.avatar_url ? getReachableSupabaseStorageUrl(profile.avatar_url) : null;

  return (
    <TouchableOpacity
      className="flex-row items-center border-b border-border p-4"
      onPress={() => onPress(profile.id)}
    >
      <Avatar alt={profile.username || "User"} className="h-12 w-12">
        {avatarUri ? <AvatarImage key={avatarUri} source={{ uri: avatarUri }} /> : null}
        <AvatarFallback>
          <Text className="text-lg">{profile.username?.charAt(0)?.toUpperCase() || "U"}</Text>
        </AvatarFallback>
      </Avatar>
      <View className="ml-3 flex-1">
        <Text className="font-semibold text-foreground">{displayName}</Text>
      </View>
    </TouchableOpacity>
  );
}
