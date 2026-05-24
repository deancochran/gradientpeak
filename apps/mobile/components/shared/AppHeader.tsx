import { Text } from "@repo/ui/components/text";
import { View } from "react-native";
import {
  MessagesHeaderButton,
  NotificationsHeaderButton,
  SearchHeaderButton,
} from "./HeaderButtons";

interface AppHeaderProps {
  showGreeting?: boolean;
  title?: string;
}

export function AppHeader(_props: AppHeaderProps) {
  return (
    <View className="relative flex-row items-center justify-between px-4 py-2 bg-background border-b border-border">
      <View className="flex-row items-center">
        <SearchHeaderButton className="mr-0" />
      </View>
      <View pointerEvents="none" className="absolute left-24 right-24 items-center">
        <Text className="text-xl font-semibold tracking-wide text-foreground">GradientPeak</Text>
      </View>
      <View className="flex-row items-center">
        <MessagesHeaderButton />
        <NotificationsHeaderButton className="mr-0" />
      </View>
    </View>
  );
}
