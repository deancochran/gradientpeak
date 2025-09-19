// apps/native/app/_layout.tsx

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { db } from "@/lib/db";
import migrations from "@/lib/db/migrations/migrations";
import { LocalDatabaseProvider } from "@/lib/providers/LocalDatabaseProvider";
import { QueryProvider } from "@/lib/providers/QueryProvider";
import { initializeStores } from "@/lib/stores";
import { useTheme } from "@/lib/stores/theme-store";
import { NAV_THEME } from "@/lib/theme";
import { ThemeProvider } from "@react-navigation/native";
import { PortalHost } from "@rn-primitives/portal";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { router, Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Export ErrorBoundary for the layout
export function ErrorBoundary({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  return (
    <View className="flex-1 justify-center items-center p-5 bg-background">
      <Text className="text-destructive text-2xl font-bold mb-3 text-center">
        Something went wrong
      </Text>
      <Text className="text-muted-foreground text-base mb-8 text-center">
        We&apos;re sorry, but something unexpected happened.
      </Text>

      {__DEV__ && (
        <View className="bg-muted p-4 rounded-lg mb-5 w-full">
          <Text className="text-muted-foreground text-sm font-semibold mb-2">
            Error Details (Dev Mode):
          </Text>
          <Text className="text-muted-foreground text-xs font-mono">
            {error.message}
          </Text>
        </View>
      )}

      <Button onPress={retry} className="mb-3 w-full max-w-xs">
        <Text className="text-primary-foreground font-semibold">Try Again</Text>
      </Button>

      <Button
        variant="outline"
        onPress={() => router.replace("/")}
        className="w-full max-w-xs"
      >
        <Text className="text-foreground">Go Home</Text>
      </Button>
    </View>
  );
}

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
