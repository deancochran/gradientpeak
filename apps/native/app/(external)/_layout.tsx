// apps/native/app/(external)/_layout.tsx
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

export default function ExternalLayout() {
  const { isDarkColorScheme } = useColorScheme();
  const { session, loading } = useAuth();

  // Show loading screen while auth state is being determined
  if (loading) {
    return <AuthLoadingScreen />;
  }

  // If user is authenticated and verified, redirect to internal app
  if (session?.user?.email_confirmed_at) {
    console.log("🔄 External: User verified, redirecting to internal");
    return <Redirect href="/(internal)" />;
  }

  // Allow access to external auth flows
  // - No user: can access sign-up, sign-in, etc.
  // - User exists but not verified: can access verification flow
  console.log("📱 External: Showing auth screens");

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
    />
  );
}
