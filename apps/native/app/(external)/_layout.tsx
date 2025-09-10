// apps/native/app/(external)/_layout.tsx
import { useAuth } from "@lib/stores";
import { useColorScheme } from "@lib/useColorScheme";
import { router, Stack } from "expo-router";
import React from "react";
import { ActivityIndicator, Animated, View } from "react-native";

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
  const { isDarkColorScheme } = useColorScheme();
  const { loading, initialized, isAuthenticated, hydrated } = useAuth();

  // Direct navigation effect
  React.useEffect(() => {
    if (initialized && hydrated && !loading) {
      if (isAuthenticated) {
        router.replace("/(internal)");
      }
    }
  }, [loading, initialized, isAuthenticated, hydrated]);

  // Show loading while determining auth state
  if (!initialized || !hydrated || loading) {
    return <AuthLoadingScreen />;
  }

  // If authenticated, let navigation effect handle redirect
  if (isAuthenticated) {
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
