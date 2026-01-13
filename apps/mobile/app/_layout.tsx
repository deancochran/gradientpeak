// apps/native/app/_layout.tsx
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import "@/global.css";
import { useAuth } from "@/lib/hooks/useAuth";
import { QueryProvider } from "@/lib/providers/QueryProvider";
import { StreamBuffer } from "@/lib/services/ActivityRecorder/StreamBuffer";
import { initSentry } from "@/lib/services/sentry";
import { useTheme } from "@/lib/stores/theme-store";
import { PortalHost } from "@rn-primitives/portal";
import { router, Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

// Initialize Sentry error tracking for production
initSentry();

// Export ErrorBoundary for the layout
export function ErrorBoundary({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  return (
    <View className="flex-1 justify-center items-center p-5 bg-background">
      <Text className="text-destructive text-2xl font-bold mb-3 text-center">
        Something went wrong
      </Text>
      <Text className="text-muted-foreground text-base mb-8 text-center">
        We&apos;re sorry, but something unexpected happened.
      </Text>

      {__DEV__ && (
        <View className="bg-muted p-4 rounded-lg mb-5 w-full">
          <Text className="text-muted-foreground text-sm font-semibold mb-2">
            Error Details (Dev Mode):
          </Text>
          <Text className="text-muted-foreground text-xs font-mono">
            {error.message}
          </Text>
        </View>
      )}

      <Button onPress={retry} className="mb-3 w-full max-w-xs">
        <Text className="text-primary-foreground font-semibold">Try Again</Text>
      </Button>

      <Button
        variant="outline"
        onPress={() => router.replace("/")}
        className="w-full max-w-xs"
      >
        <Text className="text-foreground">Go Home</Text>
      </Button>
    </View>
  );
}

// Main app content
function AppContent() {
  console.log("AppContent loaded");

  // Debug NativeWind installation
  if (__DEV__) {
    const { verifyInstallation } = require("nativewind");
    verifyInstallation();
  }

  const { loading: authLoading } = useAuth();
  const { theme, isLoaded: isThemeLoaded } = useTheme();
  const { colorScheme } = useColorScheme();

  if (authLoading || !isThemeLoaded) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" className="text-foreground" />
      </View>
    );
  }

  // Use NativeWind's colorScheme
  const isDark = colorScheme === "dark";

  console.log(
    "Rendering with theme:",
    theme,
    "NativeWind colorScheme:",
    colorScheme,
    "isDark:",
    isDark,
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={isDark ? "light" : "dark"} />
        <SafeAreaView
          className="flex-1 bg-background"
          edges={["top", "left", "right"]}
        >
          <Slot />
          <PortalHost />
        </SafeAreaView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  console.log("RootLayout loaded");

  // Clean up any orphaned recording files on app startup
  React.useEffect(() => {
    StreamBuffer.cleanupOrphanedRecordings().catch((error) => {
      console.warn("Failed to cleanup orphaned recordings:", error);
    });

    // Note: Sentry is initialized at module level above to catch early errors
    console.log("App initialization complete - Sentry active in production");
  }, []);

  return (
    <QueryProvider>
      <AppContent />
    </QueryProvider>
  );
}
