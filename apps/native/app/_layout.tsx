// apps/native/app/_layout.tsx
import "@/global.css";

import { AuthProvider } from "@/lib/contexts/AuthContext";
import { AuthErrorBoundary } from "@/lib/contexts/AuthErrorBoundary";
import { PermissionsProvider } from "@/lib/contexts/PermissionsContext";
import { useColorScheme } from "@/lib/useColorScheme";
import {
  DarkTheme,
  DefaultTheme,
  Theme,
  ThemeProvider,
} from "@react-navigation/native";
import * as Linking from "expo-linking";
import { Slot, router } from "expo-router";
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
    let mounted = true;

    const handleDeepLink = async (url: string) => {
      console.log("🔗 Processing deep link:", url);

      // Wait a bit to ensure navigation is ready
      await new Promise((resolve) => setTimeout(resolve, 100));

      if (!mounted) return;

      try {
        // Extract the path from the deep link
        const urlObj = new URL(url);
        const path = urlObj.pathname;

        console.log("🔗 Navigating to path:", path);

        // Use replace to avoid navigation stack issues
        if (path.startsWith("/(internal)") || path.startsWith("/(external)")) {
          router.replace(path as any);
        } else {
          // Default handling for other paths
          console.log("🔗 Unknown path, letting Expo Router handle it");
        }
      } catch (error) {
        console.error("❌ Deep link parsing error:", error);
      }
    };

    // Handle initial URL when app starts from a link
    Linking.getInitialURL().then((url) => {
      if (url && mounted) {
        console.log("🔗 Initial deep link:", url);
        handleDeepLink(url);
      }
    });

    // Listen for incoming links when app is running
    const subscription = Linking.addEventListener("url", ({ url }) => {
      if (mounted) {
        handleDeepLink(url);
      }
    });

    return () => {
      mounted = false;
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
    <PermissionsProvider blockAppWhenMissing={false}>
      <ThemeProvider value={isDarkColorScheme ? DARK_THEME : LIGHT_THEME}>
        <StatusBar style={isDarkColorScheme ? "light" : "dark"} />
        <AuthErrorBoundary>
          <AuthProvider>
            <RootLayoutInner />
          </AuthProvider>
        </AuthErrorBoundary>
      </ThemeProvider>
    </PermissionsProvider>
  );
}
