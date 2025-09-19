// apps/native/app/_layout.tsx
import "@/global.css";
import { db } from "@/lib/db";
import migrations from "@/lib/db/migrations/migrations";
import { LocalDatabaseProvider } from "@/lib/providers/LocalDatabaseProvider";
import { QueryProvider } from "@/lib/providers/QueryProvider";
import { initializeStores } from "@/lib/stores";
import { useTheme } from "@/lib/stores/themeStore";
import { NAV_THEME } from "@/lib/theme";
import { ThemeProvider } from "@react-navigation/native";
import { PortalHost } from "@rn-primitives/portal";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export { ErrorBoundary } from "expo-router";

// Main app content
function AppContent() {
  const { theme, isLoaded } = useTheme();

  // Show loading until theme is loaded
  if (!isLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Determine if we're in dark mode - NativeWind handles 'system' automatically for CSS classes
  const isDark = theme === "dark";
  const navTheme = isDark ? NAV_THEME.dark : NAV_THEME.light;

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <SafeAreaView className="flex-1 bg-background">
        <Slot />
        <PortalHost />
      </SafeAreaView>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations);
  if (error || !success) {
    throw new Error(
      `Database migration failed: ${error ? error.message : "Unsuccessful Migration error"}`,
    );
  }

  // Init Stores
  React.useEffect(() => {
    initializeStores();
  }, []);

  return (
    <QueryProvider>
      <LocalDatabaseProvider>
        <AppContent />
      </LocalDatabaseProvider>
    </QueryProvider>
  );
}
