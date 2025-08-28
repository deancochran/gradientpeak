import { useAuth } from "@/lib/contexts";
import { useColorScheme } from "@/lib/useColorScheme";
import { Redirect, Stack } from "expo-router";
import React from "react";
import { Animated, View } from "react-native";

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
  }, []);

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
        <View
          style={{
            width: 60,
            height: 60,
            borderRadius: 16,
            backgroundColor: isDarkColorScheme ? "#ffffff" : "#000000",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              backgroundColor: backgroundColor,
            }}
          />
        </View>
      </Animated.View>
    </View>
  );
}

export default function AuthLayout() {
  const { isDarkColorScheme } = useColorScheme();
  const { user, initializing } = useAuth();

  // Show loading screen while auth state is being determined
  if (initializing) {
    return <AuthLoadingScreen />;
  }

  // Redirect to internal app if user is authenticated and verified
  if (user && user.email_confirmed_at) {
    return <Redirect href="/(internal)" />;
  }

  // If user exists but is not verified, allow access to external auth flows
  // (like verification, sign-in, etc.)
  // If no user, also allow access to auth flows

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
        // headerBackTitleVisible: false,
        headerShadowVisible: false,
        animation: "slide_from_right",
      }}
    />
  );
}
