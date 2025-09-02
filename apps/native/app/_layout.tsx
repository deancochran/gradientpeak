// apps/native/app/_layout.tsx
import "@/global.css";

import { AuthProvider } from "@/lib/contexts/AuthContext";
import { AuthErrorBoundary } from "@/lib/contexts/AuthErrorBoundary";
import { useColorScheme } from "@/lib/useColorScheme";
import {
  DarkTheme,
  DefaultTheme,
  Theme,
  ThemeProvider,
} from "@react-navigation/native";
import * as Linking from "expo-linking";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as React from "react";
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

function RootLayoutInner() {
  const { isDarkColorScheme } = useColorScheme();

  React.useEffect(() => {
    // Handle deep link when app is already running
    const handleDeepLink = (url: string) => {
      console.log("🔗 Deep link received:", url);
      // Expo Router will automatically handle routing based on the URL
    };

    // Listen for incoming links when app is running
    const subscription = Linking.addEventListener("url", ({ url }) => {
      handleDeepLink(url);
    });

    // Handle deep link when app starts from a link
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink(url);
      }
    });

    return () => {
      subscription?.remove();
    };
  }, []);

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: isDarkColorScheme ? "#000000" : "#ffffff",
      }}
      testID="root-safe-area"
    >
      <Slot />
    </SafeAreaView>
  );
}

export default function RootLayout() {
  const { isDarkColorScheme } = useColorScheme();

  return (
    <ThemeProvider value={isDarkColorScheme ? DARK_THEME : LIGHT_THEME}>
      <StatusBar style={isDarkColorScheme ? "light" : "dark"} />
      <AuthErrorBoundary>
        <AuthProvider>
          <RootLayoutInner />
        </AuthProvider>
      </AuthErrorBoundary>
    </ThemeProvider>
  );
}
