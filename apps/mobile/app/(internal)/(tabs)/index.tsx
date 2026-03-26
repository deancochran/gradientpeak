import { Text } from "@repo/ui/components/text";
import { View } from "react-native";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { FeedList } from "@/components/feed";
import { AppHeader } from "@/components/shared";

function HomeScreen() {
  return (
    <View className="flex-1 bg-background">
      <AppHeader title="Feed" />
      <FeedList />
    </View>
  );
}

export default function HomeScreenWithErrorBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <HomeScreen />
    </ErrorBoundary>
  );
}
