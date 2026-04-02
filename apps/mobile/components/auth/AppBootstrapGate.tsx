import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import { Redirect, useSegments } from "expo-router";
import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/lib/hooks/useAuth";
import { initializeServerConfig, useServerConfig } from "@/lib/server-config";
import { useAuthStore } from "@/lib/stores/auth-store";

export function AppBootstrapGate({ children }: { children: React.ReactNode }) {
  const { initialized } = useServerConfig();
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
  const segments = useSegments();
  const rootSegment = segments[0];
  const childSegment = segments.at(1);
  const grandchildSegment = segments.at(2);
  const clearSession = useAuthStore((state) => state.clearSession);

  React.useEffect(() => {
    if (!initialized) {
      void initializeServerConfig();
    }
  }, [initialized]);

  const inInternalGroup = rootSegment === "(internal)";
  const inExternalGroup = rootSegment === "(external)";
  const isOnboardingScreen =
    rootSegment === "(internal)" &&
    childSegment === "(standard)" &&
    grandchildSegment === "onboarding";
  const isVerificationScreen = rootSegment === "(external)" && childSegment === "verify";
  const isAuthCallbackScreen = rootSegment === "(external)" && childSegment === "callback";

  const guardDecision = React.useMemo(() => {
    if (!initialized || !isFullyLoaded) {
      return { type: "loading" as const };
    }

    if (!isAuthenticated) {
      return inExternalGroup
        ? { type: "allow" as const }
        : { type: "redirect" as const, to: "/(external)/sign-in" as const };
    }

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

    if (!inInternalGroup || isOnboardingScreen) {
      return { type: "redirect" as const, to: "/(internal)/(tabs)" as const };
    }

    return { type: "allow" as const };
  }, [
    inExternalGroup,
    inInternalGroup,
    initialized,
    isAuthCallbackScreen,
    isAuthenticated,
    isFullyLoaded,
    isOnboardingScreen,
    isVerificationScreen,
    onboardingStatus,
    profileError,
    profileLoading,
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

  return <>{children}</>;
}
