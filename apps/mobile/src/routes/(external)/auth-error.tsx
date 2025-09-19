import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";

export default function AuthErrorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ error?: string }>();

  const handleGoBackPress = () => {
    router.replace("/(external)");
  };

  const handleTryAgainPress = () => {
    router.back();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background p-6"
      testID="auth-error-screen"
    >
      <View className="flex-1 justify-center items-center">
        <Card className="w-full max-w-sm bg-card border-border shadow-sm">
          <CardContent className="p-8 items-center">
            {/* Error Icon */}
            <View className="w-20 h-20 border-2 border-destructive rounded-full items-center justify-center mb-6">
              <Text className="text-destructive text-3xl font-bold">!</Text>
            </View>

            {/* Error Message */}
            <View className="items-center mb-8" testID="message-container">
              <Text variant="h2" className="text-center mb-4">
                Sorry, something went wrong.
              </Text>

              {params?.error ? (
                <View className="w-full gap-3" testID="error-details">
                  <Text variant="muted" className="text-center">
                    Error details:
                  </Text>
                  <View
                    className="bg-muted p-4 rounded-md border border-border"
                    testID="error-box"
                  >
                    <Text
                      variant="small"
                      className="text-destructive text-center"
                      testID="error-message"
                    >
                      {params.error}
                    </Text>
                  </View>
                </View>
              ) : (
                <Text variant="muted" className="text-center">
                  An unspecified error occurred. Please try again.
                </Text>
              )}
            </View>

            {/* Action Buttons */}
            <View className="w-full gap-4" testID="buttons-container">
              <Button
                variant="default"
                size="lg"
                onPress={handleTryAgainPress}
                testID="try-again-button"
                className="w-full"
              >
                <Text>Try Again</Text>
              </Button>

              <Button
                variant="outline"
                size="lg"
                onPress={handleGoBackPress}
                testID="go-back-button"
                className="w-full"
              >
                <Text>Go Back to Welcome</Text>
              </Button>
            </View>
          </CardContent>
        </Card>
      </View>
    </KeyboardAvoidingView>
  );
}
