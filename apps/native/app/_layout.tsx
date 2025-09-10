// apps/native/app/_layout.tsx
import "@/global.css";

import { AuthProvider } from "@lib/contexts/AuthContext";
import { AuthErrorBoundary } from "@lib/contexts/AuthErrorBoundary";
import { PermissionsProvider } from "@lib/contexts/PermissionsContext";
import { db } from "@lib/db";
import migrations from "@lib/db/migrations/migrations";
import { useColorScheme } from "@lib/useColorScheme";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from "@tanstack/react-query";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import * as Linking from "expo-linking";
import * as Network from "expo-network";
import { Slot, router } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";
import { StatusBar } from "expo-status-bar";
import * as React from "react";

import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  Platform,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Modern black and white theme
const LIGHT_THEME = {
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

const DARK_THEME = {
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

// 1. Create a client
const queryClient = new QueryClient();

// 2. Configure online manager for React Native
onlineManager.setEventListener((setOnline) => {
  return Network.addNetworkStateListener((state) => {
    setOnline(!!state.isConnected);
  });
});

// 3. Configure focus manager for React Native
function onAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== "web") {
    focusManager.setFocused(status === "active");
  }
}

function DrizzleProvider({ children }: { children: React.ReactNode }) {
  const { success, error } = useMigrations(db, migrations);

  if (error) {
    // This will be caught by the ErrorBoundary
    throw new Error(`Failed to apply migrations: ${error.message}`);
  }

  if (!success) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <>{children}</>;
}

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

  React.useEffect(() => {
    const subscription = AppState.addEventListener("change", onAppStateChange);
    return () => subscription.remove();
  }, []);

  return (
    <React.Suspense
      fallback={
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <ActivityIndicator size="large" />
        </View>
      }
    >
      <QueryClientProvider client={queryClient}>
        <SQLiteProvider databaseName="db.db">
          <DrizzleProvider>
            <PermissionsProvider>
              <ThemeProvider
                value={isDarkColorScheme ? DARK_THEME : LIGHT_THEME}
              >
                <StatusBar style={isDarkColorScheme ? "light" : "dark"} />
                <AuthErrorBoundary>
                  <AuthProvider>
                    <RootLayoutInner />
                  </AuthProvider>
                </AuthErrorBoundary>
              </ThemeProvider>
            </PermissionsProvider>
          </DrizzleProvider>
        </SQLiteProvider>
      </QueryClientProvider>
    </React.Suspense>
  );
}
