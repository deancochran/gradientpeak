import { useRouter } from "expo-router";
import React from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";

export default function VerificationSuccessScreen() {
  const router = useRouter();

  const handleContinuePress = () => {
    router.replace("/(external)/sign-in");
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background p-6"
      testID="verification-success-screen"
    >
      <View className="flex-1 justify-center items-center">
        <Card className="w-full max-w-sm bg-card border-border shadow-sm">
          <CardContent className="p-8 items-center">
            {/* Success Icon */}
            <View className="w-20 h-20 bg-success rounded-full items-center justify-center mb-6">
              <Text className="text-success-foreground text-3xl font-bold">
                ✓
              </Text>
            </View>

            {/* Success Message */}
            <View className="items-center mb-8">
              <Text variant="h2" className="text-center mb-2">
                Account Verified!
              </Text>
              <Text variant="muted" className="text-center mb-4">
                Welcome to GradientPeak
              </Text>
              <Text variant="muted" className="text-center">
                Your email has been verified successfully. You can now sign in
                to start your fitness journey.
              </Text>
            </View>

            {/* Continue Button */}
            <Button
              variant="default"
              size="lg"
              onPress={handleContinuePress}
              testID="continue-button"
              className="w-full"
            >
              <Text>Sign In Now</Text>
            </Button>
          </CardContent>
        </Card>
      </View>
    </KeyboardAvoidingView>
  );
}
