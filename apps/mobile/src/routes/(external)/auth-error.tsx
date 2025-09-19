import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import React from "react";
import {
    KeyboardAvoidingView,
    Platform,
    View,
} from "react-native";

import { useLocalSearchParams, useRouter } from "expo-router";

export default function AuthErrorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ error?: string }>();

  const handleGoBackPress = () => {
    router.replace("/(external)");
  };

  return (
    <View >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[styles.container, { backgroundColor }]}
        testID="auth-error-screen"
      >

          {/* Error Icon */}
          <View style={styles.iconContainer} testID="error-icon-container">
            <View
              style={[
                styles.errorIcon,
                {
                  borderColor: errorColor,
                  backgroundColor: "transparent",
                },
              ]}
              testID="error-icon"
            >
              <Text
                style={[styles.errorSymbol, { color: errorColor }]}
                testID="error-symbol"
              >
                !
              </Text>
            </View>
          </View>

          {/* Error Message */}
          <View style={styles.messageContainer} testID="message-container">
            <Text
              style={[styles.title, { color: textColor }]}
              testID="error-title"
            >
              Sorry, something went wrong.
            </Text>

            {params?.error ? (
              <View style={styles.errorDetailsContainer} testID="error-details">
                <Text
                  style={[styles.errorLabel, { color: subtleColor }]}
                  testID="error-label"
                >
                  Error details:
                </Text>
                <View
                  style={[
                    styles.errorBox,
                    {
                      borderColor: borderColor,
                      backgroundColor: isDarkColorScheme
                        ? "#1a1a1a"
                        : "#f8f9fa",
                    },
                  ]}
                  testID="error-box"
                >
                  <Text
                    style={[styles.errorText, { color: errorColor }]}
                    testID="error-message"
                  >
                    {params.error}
                  </Text>
                </View>
              </View>
            ) : (
              <Text
                style={[styles.description, { color: subtleColor }]}
                testID="generic-error-description"
              >
                An unspecified error occurred. Please try again.
              </Text>
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonsContainer} testID="buttons-container">

              <Button
                onPress={handleTryAgainPress}
                style={[
                  styles.primaryButton,
                  {
                    backgroundColor: textColor,
                    shadowColor: textColor,
                  },
                ]}
                testID="try-again-button"
              >
                <Text
                  style={[styles.primaryButtonText, { color: backgroundColor }]}
                  testID="try-again-button-text"
                >
                  Try Again
                </Text>
              </Button>

            <Button
              onPress={handleGoBackPress}
              style={[styles.secondaryButton, { borderColor }]}
              testID="go-back-button"
            >
              <Text
                style={[styles.secondaryButtonText, { color: textColor }]}
                testID="go-back-button-text"
              >
                Go Back to Welcome
              </Text>
            </Button>
          </View>
    </View>
  );
}
