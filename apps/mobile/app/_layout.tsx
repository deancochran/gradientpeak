// apps/native/app/_layout.tsx
import "../polyfills";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import "@/global.css";
import { useAuth } from "@/lib/hooks/useAuth";
import { QueryProvider } from "@/lib/providers/QueryProvider";
import { StreamBuffer } from "@/lib/services/ActivityRecorder/StreamBuffer";
import { GarminFitEncoder } from "@/lib/services/fit/GarminFitEncoder";
import { initSentry } from "@/lib/services/sentry";
import { useTheme } from "@/lib/stores/theme-store";
import { PortalHost } from "@rn-primitives/portal";
import { Redirect, router, Slot, useSegments } from "expo-router";
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

  const { userStatus, onboardingStatus, isAuthenticated, isFullyLoaded, user } =
    useAuth();
  const { theme, isLoaded: isThemeLoaded } = useTheme();
  const { colorScheme } = useColorScheme();
  const segments = useSegments();

  const inInternalGroup = segments[0] === "(internal)";
  const inExternalGroup = segments[0] === "(external)";
  const isOnboardingScreen =
    segments[0] === "(internal)" &&
    segments[1] === "(standard)" &&
    segments[2] === "onboarding";
  const isVerificationScreen =
    segments[0] === "(external)" && segments[1] === "verify";
  const isAuthCallbackScreen =
    segments[0] === "(external)" && segments[1] === "callback";

  const guardDecision = React.useMemo(() => {
    if (!isFullyLoaded || !isThemeLoaded) {
      return { type: "loading" as const };
    }

    // Not signed in: only external routes are allowed.
    if (!isAuthenticated) {
      return inExternalGroup
        ? { type: "allow" as const }
        : { type: "redirect" as const, to: "/(external)/sign-in" as const };
    }

    // Signed in but not verified: only verify/callback allowed.
    if (userStatus !== "verified") {
      if (isVerificationScreen || isAuthCallbackScreen) {
        return { type: "allow" as const };
      }

      return {
        type: "redirect" as const,
        to: "/(external)/verify" as const,
        params: { email: user?.email || "" },
      };
    }

    // Verified but not onboarded: onboarding is mandatory before internal app.
    if (onboardingStatus !== true) {
      return isOnboardingScreen
        ? { type: "allow" as const }
        : {
            type: "redirect" as const,
            to: "/(internal)/(standard)/onboarding" as const,
          };
    }

    // Fully eligible users should stay in internal app shell.
    if (!inInternalGroup || isOnboardingScreen) {
      return { type: "redirect" as const, to: "/(internal)/(tabs)" as const };
    }

    return { type: "allow" as const };
  }, [
    inExternalGroup,
    inInternalGroup,
    isAuthCallbackScreen,
    isAuthenticated,
    isFullyLoaded,
    isOnboardingScreen,
    isThemeLoaded,
    isVerificationScreen,
    onboardingStatus,
    user,
    userStatus,
  ]);

  if (guardDecision.type === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" className="text-foreground" />
      </View>
    );
  }

  if (guardDecision.type === "redirect") {
    if (guardDecision.to === "/(external)/verify") {
      return (
        <Redirect
          href={{ pathname: guardDecision.to, params: guardDecision.params }}
        />
      );
    }

    return <Redirect href={guardDecision.to} />;
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

    GarminFitEncoder.cleanupOrphanedRecordings().catch((error) => {
      console.warn("Failed to cleanup orphaned FIT recordings:", error);
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
