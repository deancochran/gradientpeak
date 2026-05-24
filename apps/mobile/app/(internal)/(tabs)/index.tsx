import { View } from "react-native";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { FeedList } from "@/components/feed";
import { AppHeader } from "@/components/shared";
import { usePerformanceScreenReady } from "@/lib/performance";

function HomeScreen() {
  usePerformanceScreenReady("route-home");

  return (
    <View className="flex-1 bg-background" testID="home-screen">
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
