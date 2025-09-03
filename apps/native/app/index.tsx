import { useAuth } from "@/contexts/AuthContext";
import { useColorScheme } from "@/lib/useColorScheme";
import { useFocusEffect } from "expo-router";
import React from "react";
import { ActivityIndicator, View } from "react-native";

export default function RootIndex() {
  const { loading, isAuthenticated } = useAuth();
  const { isDarkColorScheme } = useColorScheme();
  const [shouldRender, setShouldRender] = React.useState(false);

  // Ensure we only render after the screen is focused
  useFocusEffect(
    React.useCallback(() => {
      setShouldRender(true);
      return () => setShouldRender(false);
    }, []),
  );

  // Show loading while determining auth state or waiting for focus
  if (loading || !shouldRender) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: isDarkColorScheme ? "#000000" : "#ffffff",
        }}
        testID="root-loading"
      >
        <ActivityIndicator
          size="large"
          color={isDarkColorScheme ? "#ffffff" : "#000000"}
        />
      </View>
    );
  }

  // The AuthProvider will handle navigation, so we just show loading
  // This prevents double navigation attempts
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: isDarkColorScheme ? "#000000" : "#ffffff",
      }}
      testID="root-navigating"
    >
      <ActivityIndicator
        size="large"
        color={isDarkColorScheme ? "#ffffff" : "#000000"}
      />
    </View>
  );
}
