import { router } from "expo-router";
import { useCallback } from "react";
import { Alert } from "react-native";
import { logError } from "../services/error-tracking";

export const useErrorHandler = () => {
  const handleError = useCallback((error: Error, context?: string) => {
    logError(error, context);

    // Handle specific error types
    if (
      error.message.includes("UNAUTHORIZED") ||
      error.message.includes("401")
    ) {
      Alert.alert("Session Expired", "Please log in again.", [
        { text: "OK", onPress: () => router.push("/(external)/sign-in") },
      ]);
      return;
    }

    if (
      error.message.includes("NETWORK") ||
      error.message.includes("Failed to fetch")
    ) {
      Alert.alert(
        "Network Error",
        "Please check your connection and try again.",
        [{ text: "OK" }],
      );
      return;
    }

    if (error.message.includes("FORBIDDEN") || error.message.includes("403")) {
      Alert.alert(
        "Access Denied",
        "You don't have permission to perform this action.",
        [{ text: "OK" }],
      );
      return;
    }

    // Generic error fallback
    Alert.alert(
      "Error",
      error.message || "Something went wrong. Please try again.",
      [{ text: "OK" }],
    );
  }, []);

  const handleAsyncError = useCallback(
    async <T>(
      asyncFn: () => Promise<T>,
      context?: string,
    ): Promise<T | null> => {
      try {
        return await asyncFn();
      } catch (error) {
        handleError(error as Error, context);
        return null;
      }
    },
    [handleError],
  );

  return { handleError, handleAsyncError };
};
