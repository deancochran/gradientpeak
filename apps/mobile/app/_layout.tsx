// apps/native/app/_layout.tsx
import "../polyfills";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { NATIVE_THEME_VARIABLES } from "@repo/ui/theme/native";
import "@/global.css";
import { PortalHost } from "@rn-primitives/portal";
import { Redirect, router, Slot, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { vars } from "nativewind";
import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/hooks/useAuth";
import { QueryProvider } from "@/lib/providers/QueryProvider";
import { initializeServerConfig, useServerConfig } from "@/lib/server-config";
import { StreamBuffer } from "@/lib/services/ActivityRecorder/StreamBuffer";
import { GarminFitEncoder } from "@/lib/services/fit/GarminFitEncoder";
import { initSentry } from "@/lib/services/sentry";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useTheme } from "@/lib/stores/theme-store";

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

// Main app content
function AppContent() {
  console.log("AppContent loaded");

  const {
    userStatus,
    onboardingStatus,
    isAuthenticated,
    isFullyLoaded,
    user,
    profileLoading,
    profileError,
    refreshProfile,
  } = useAuth();
  const { theme, resolvedTheme, isLoaded: isThemeLoaded } = useTheme();
  const segments = useSegments();
  const [rootSegment, childSegment, grandchildSegment] = segments;
  const clearSession = useAuthStore((state) => state.clearSession);

  const inInternalGroup = rootSegment === "(internal)";
  const inExternalGroup = rootSegment === "(external)";
  const isOnboardingScreen =
    rootSegment === "(internal)" &&
    childSegment === "(standard)" &&
    grandchildSegment === "onboarding";
  const isVerificationScreen = rootSegment === "(external)" && childSegment === "verify";
  const isAuthCallbackScreen = rootSegment === "(external)" && childSegment === "callback";

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
    if (onboardingStatus === null) {
      if (profileLoading) {
        return { type: "loading" as const };
      }

      if (profileError) {
        return { type: "profile-error" as const, message: profileError.message };
      }

      return {
        type: "redirect" as const,
        to: "/(internal)/(standard)/onboarding" as const,
      };
    }

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

  const isDark = resolvedTheme === "dark";
  const themeVariables = React.useMemo(
    () => vars(NATIVE_THEME_VARIABLES[resolvedTheme]),
    [resolvedTheme],
  );

  if (guardDecision.type === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" className="text-foreground" />
      </View>
    );
  }

  if (guardDecision.type === "profile-error") {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background px-6">
        <Text variant="h3" className="text-center text-foreground">
          We couldn&apos;t finish loading your account
        </Text>
        <Text className="text-center text-muted-foreground">{guardDecision.message}</Text>
        <Button onPress={() => void refreshProfile()} className="w-full max-w-xs">
          <Text className="text-primary-foreground font-semibold">Try Again</Text>
        </Button>
        <Button variant="outline" onPress={() => void clearSession()} className="w-full max-w-xs">
          <Text className="text-foreground">Sign Out</Text>
        </Button>
      </View>
    );
  }

  if (guardDecision.type === "redirect") {
    if (guardDecision.to === "/(external)/verify") {
      return <Redirect href={{ pathname: guardDecision.to, params: guardDecision.params }} />;
    }

    return <Redirect href={guardDecision.to} />;
  }

  console.log("Rendering with theme:", theme, "resolvedTheme:", resolvedTheme, "isDark:", isDark);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <View style={themeVariables} className="flex-1 bg-background">
          <StatusBar style={isDark ? "light" : "dark"} />
          <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
            <View className="flex-1 bg-background">
              <Slot />
              <PortalHost />
            </View>
          </SafeAreaView>
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  console.log("RootLayout loaded");
  const { initialized } = useServerConfig();

  React.useEffect(() => {
    if (initialized) {
      return;
    }

    void initializeServerConfig();
  }, [initialized]);

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

  if (!initialized) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" className="text-foreground" />
      </View>
    );
  }

  return (
    <QueryProvider>
      <AppContent />
    </QueryProvider>
  );
}
