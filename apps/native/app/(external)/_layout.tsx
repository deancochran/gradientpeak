// apps/native/app/(external)/_layout.tsx
import { useAuth } from "@lib/stores";
import { useColorScheme } from "@lib/useColorScheme";
import { router, Stack } from "expo-router";
import React from "react";
import { ActivityIndicator, Animated, View } from "react-native";

console.log("📱 EXTERNAL LAYOUT: File loaded and executing");

function AuthLoadingScreen() {
  const { isDarkColorScheme } = useColorScheme();
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const scaleAnim = React.useRef(new Animated.Value(0.9)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  const backgroundColor = isDarkColorScheme ? "#000000" : "#ffffff";

  return (
    <View
      style={{
        flex: 1,
        backgroundColor,
        justifyContent: "center",
        alignItems: "center",
      }}
      testID="auth-loading-screen"
    >
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        }}
        testID="auth-loading-indicator"
      >
        <ActivityIndicator
          size="large"
          color={isDarkColorScheme ? "#ffffff" : "#000000"}
        />
      </Animated.View>
    </View>
  );
}

export default function ExternalLayout() {
  console.log("📱 EXTERNAL LAYOUT: Component function called");

  const { isDarkColorScheme } = useColorScheme();
  const { loading, initialized, isAuthenticated, hydrated } = useAuth();

  console.log("🚦 External Layout: Rendering with state", {
    loading,
    initialized,
    isAuthenticated,
    hydrated,
  });

  // Direct navigation effect
  React.useEffect(() => {
    console.log("🚦 External Layout: Auth state changed", {
      loading,
      initialized,
      isAuthenticated,
      hydrated,
    });

    if (initialized && hydrated && !loading) {
      console.log("🚦 External Layout: Navigation conditions met");
      if (isAuthenticated) {
        console.log(
          "🏠 External Layout: Navigating to internal (authenticated)",
        );
        router.replace("/(internal)");
      } else {
        console.log(
          "🔓 External Layout: User not authenticated, staying on external",
        );
      }
    }
  }, [loading, initialized, isAuthenticated, hydrated]);

  // Show loading while determining auth state
  if (!initialized || !hydrated || loading) {
    console.log("🚦 External Layout: Showing loading screen", {
      initialized,
      hydrated,
      loading,
    });
    return <AuthLoadingScreen />;
  }

  console.log("🚦 External Layout: Auth state ready, checking authentication");

  // If authenticated, let navigation effect handle redirect
  if (isAuthenticated) {
    console.log(
      "🚦 External Layout: User authenticated, should navigate soon...",
    );
    return <AuthLoadingScreen />;
  }

  const backgroundColor = isDarkColorScheme ? "#000000" : "#ffffff";
  const textColor = isDarkColorScheme ? "#ffffff" : "#000000";

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor,
        },
        headerTintColor: textColor,
        headerTitleStyle: {
          fontWeight: "600",
        },
        headerShadowVisible: false,
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="auth-error" />
      <Stack.Screen name="sign-up-success" />
      <Stack.Screen name="verify" />
      <Stack.Screen name="verification-success" />
    </Stack>
  );
}
