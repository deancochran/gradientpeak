import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { FeedList } from "@/components/feed";
import { AppHeader } from "@/components/shared";
import { Text } from "@/components/ui/text";
import { View } from "react-native";

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
