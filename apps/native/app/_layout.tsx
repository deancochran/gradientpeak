import "@/global.css";

import { AuthProvider, useAuth } from "@/lib/contexts";
import { useColorScheme } from "@/lib/useColorScheme";
import {
  DarkTheme,
  DefaultTheme,
  Theme,
  ThemeProvider,
} from "@react-navigation/native";

import { Redirect, Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as React from "react";
import { Animated, Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Modern black and white theme
const LIGHT_THEME: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: "#000000",
    background: "#ffffff",
    card: "#ffffff",
    text: "#000000",
    border: "#e5e5e5",
    notification: "#000000",
  },
};

const DARK_THEME: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: "#ffffff",
    background: "#000000",
    card: "#111111",
    text: "#ffffff",
    border: "#333333",
    notification: "#ffffff",
  },
};

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from "expo-router";

function LoadingScreen() {
  const { isDarkColorScheme } = useColorScheme();
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const scaleAnim = React.useRef(new Animated.Value(0.8)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const backgroundColor = isDarkColorScheme ? "#000000" : "#ffffff";
  const logoColor = isDarkColorScheme ? "#ffffff" : "#000000";
  const logoInnerColor = isDarkColorScheme ? "#000000" : "#ffffff";

  return (
    <View
      style={{
        flex: 1,
        backgroundColor,
        justifyContent: "center",
        alignItems: "center",
      }}
      testID="loading-screen"
    >
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        }}
      >
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 20,
            backgroundColor: logoColor,
            justifyContent: "center",
            alignItems: "center",
            shadowColor: logoColor,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.3,
            shadowRadius: 20,
            elevation: 10,
          }}
          testID="loading-logo"
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              backgroundColor: logoInnerColor,
            }}
            testID="loading-logo-inner"
          />
        </View>
      </Animated.View>
    </View>
  );
}

function RootLayoutInner() {
  const { session, loading } = useAuth();
  const { isDarkColorScheme } = useColorScheme();
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const [hasRedirected, setHasRedirected] = React.useState(false);

  React.useEffect(() => {
    // Animate app entrance
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  // Debug logging
  React.useEffect(() => {
    console.log("🔍 RootLayout State:", {
      loading,
      hasSession: !!session,
      hasUser: !!session?.user,
      emailConfirmed: session?.user?.email_confirmed_at,
      hasRedirected,
    });
  }, [loading, session, hasRedirected]);

  // Show loading screen while auth is loading
  if (loading) {
    return <LoadingScreen />;
  }

  // Handle authentication routing - only redirect once
  if (!hasRedirected) {
    if (!session?.user) {
      console.log("🚪 No user, redirecting to welcome");
      setHasRedirected(true);
      return <Redirect href="/(external)/welcome" />;
    }

    if (session.user && !session.user.email_confirmed_at) {
      console.log("📧 User not verified, redirecting to verify");
      setHasRedirected(true);
      return <Redirect href="/(external)/verify" />;
    }
  }

  // User is authenticated and verified, show the main app
  console.log("✅ User authenticated and verified, showing main app");
  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: isDarkColorScheme ? "#000000" : "#ffffff",
      }}
      testID="root-safe-area"
    >
      <Animated.View
        style={{
          flex: 1,
          opacity: fadeAnim,
        }}
        testID="root-content"
      >
        <Slot />
      </Animated.View>
    </SafeAreaView>
  );
}

export default function RootLayout() {
  const { colorScheme, isDarkColorScheme } = useColorScheme();

  return (
    <ThemeProvider value={isDarkColorScheme ? DARK_THEME : LIGHT_THEME}>
      <StatusBar style={isDarkColorScheme ? "light" : "dark"} />
      <AuthProvider>
        <RootLayoutInner />
      </AuthProvider>
    </ThemeProvider>
  );
}

const useIsomorphicLayoutEffect =
  Platform.OS === "web" && typeof window === "undefined"
    ? React.useEffect
    : React.useLayoutEffect;
