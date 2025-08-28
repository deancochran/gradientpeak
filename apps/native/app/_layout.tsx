import "@/global.css";

import { AuthProvider, ProtectedRoute, useAuth } from "@/lib/contexts";
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
  const { user, initializing } = useAuth();
  const { isDarkColorScheme } = useColorScheme();
  const [isAppReady, setIsAppReady] = React.useState(false);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  useIsomorphicLayoutEffect(() => {
    // Animate app entrance
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();

    setIsAppReady(true);
  }, []);

  // Show loading screen while auth is initializing or app is getting ready
  if (initializing || !isAppReady) {
    return <LoadingScreen />;
  }

  // Handle authentication routing
  if (!user) {
    // User is not authenticated, redirect to welcome page
    return <Redirect href="/(external)/welcome" />;
  }

  // Check if user is authenticated but not verified
  if (user && !user.email_confirmed_at) {
    // User exists but email not verified, redirect to verification flow
    return <Redirect href="/(external)/verify" />;
  }

  // User is authenticated and verified, show the main app
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
