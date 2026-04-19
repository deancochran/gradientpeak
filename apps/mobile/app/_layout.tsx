// apps/native/app/_layout.tsx
import "../polyfills";
import { ThemeProvider } from "@react-navigation/native";
import { NATIVE_THEME_VARIABLES } from "@repo/tailwindcss/native";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import "@/global.css";
import { PortalHost } from "@rn-primitives/portal";
import { router, Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { vars } from "nativewind";
import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AppBootstrapGate } from "@/components/auth/AppBootstrapGate";
import { QueryProvider } from "@/lib/providers/QueryProvider";
import { initializeServerConfig, useServerConfig } from "@/lib/server-config";
import { StreamBuffer } from "@/lib/services/ActivityRecorder/StreamBuffer";
import { GarminFitEncoder } from "@/lib/services/fit/GarminFitEncoder";
import { initSentry } from "@/lib/services/sentry";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useTheme } from "@/lib/stores/theme-store";
import {
  clearE2ERuntimeErrors,
  E2ERuntimeErrorStatus,
  installE2ERuntimeErrorCapture,
} from "@/lib/testing/e2eRuntimeErrors";
import { getNavigationTheme } from "@/lib/theme";

// Initialize Sentry error tracking for production
initSentry();

// Export ErrorBoundary for the layout
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
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
          <Text className="text-muted-foreground text-xs font-mono">{error.message}</Text>
        </View>
      )}

      <Button onPress={retry} className="mb-3 w-full max-w-xs">
        <Text className="text-primary-foreground font-semibold">Try Again</Text>
      </Button>

      <Button variant="outline" onPress={() => router.replace("/")} className="w-full max-w-xs">
        <Text className="text-foreground">Go Home</Text>
      </Button>
    </View>
  );
}

function AppShell() {
  const { resolvedTheme, isLoaded: isThemeLoaded } = useTheme();

  const isDark = resolvedTheme === "dark";
  const navigationTheme = React.useMemo(() => getNavigationTheme(resolvedTheme), [resolvedTheme]);
  const themeVariables = React.useMemo(
    () => vars(NATIVE_THEME_VARIABLES[resolvedTheme]),
    [resolvedTheme],
  );

  if (!isThemeLoaded) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" className="text-foreground" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={navigationTheme}>
          <View style={themeVariables} className="flex-1 bg-background">
            <StatusBar style={isDark ? "light" : "dark"} />
            <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
              <View className="flex-1 bg-background">
                <Slot />
                <PortalHost />
                <E2ERuntimeErrorStatus />
              </View>
            </SafeAreaView>
          </View>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  const { initialized } = useServerConfig();
  const authReady = useAuthStore((state) => state.ready);
  const initializeAuth = useAuthStore((state) => state.initialize);

  // Clean up any orphaned recording files on app startup
  React.useEffect(() => {
    StreamBuffer.cleanupOrphanedRecordings().catch((error) => {
      console.warn("Failed to cleanup orphaned recordings:", error);
    });

    GarminFitEncoder.cleanupOrphanedRecordings().catch((error) => {
      console.warn("Failed to cleanup orphaned FIT recordings:", error);
    });
  }, []);

  React.useEffect(() => {
    installE2ERuntimeErrorCapture();
    clearE2ERuntimeErrors();
  }, []);

  React.useEffect(() => {
    void initializeServerConfig();
  }, []);

  React.useEffect(() => {
    if (initialized && !authReady) {
      void initializeAuth();
    }
  }, [authReady, initializeAuth, initialized]);

  return (
    <QueryProvider>
      <AppBootstrapGate>
        <AppShell />
      </AppBootstrapGate>
    </QueryProvider>
  );
}
