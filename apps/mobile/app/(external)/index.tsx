import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Text } from "@repo/ui/components/text";
import { useRouter } from "expo-router";
import React from "react";
import { View } from "react-native";
import { useAuth } from "@/lib/hooks/useAuth";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

export default function WelcomeScreen() {
  const router = useRouter();
  const navigateTo = useAppNavigate();
  const { isAuthenticated } = useAuth();

  React.useEffect(() => {
    console.log("🏠 Welcome Screen: isAuthenticated =", isAuthenticated);
  }, [isAuthenticated]);

  const handleLoginPress = () => {
    router.replace({ pathname: "/(external)/sign-in" });
  };

  const handleSignupPress = () => {
    router.replace({ pathname: "/(external)/sign-up" });
  };

  const handleUiPreviewPress = () => {
    navigateTo("/(external)/ui-preview" as any);
  };

  return (
    <View className="flex-1 bg-background p-6" testID="welcome-screen">
      {/* Main Content */}
      <View className="flex-1 justify-center items-center">
        {/* Hero Card */}
        <Card className="w-full max-w-sm bg-card border-border shadow-sm">
          <CardContent className="p-8 items-center">
            {/* App Logo/Brand */}
            <View className="w-20 h-20 bg-primary rounded-full items-center justify-center mb-6">
              <Text variant="h1" className="text-primary-foreground">
                TF
              </Text>
            </View>

            {/* App Title */}
            <Text variant="h1" className="text-center mb-2">
              GradientPeak
            </Text>

            {/* Tagline */}
            <Text variant="muted" className="text-center mb-8">
              Minimal fitness tracking.{"\n"}Maximum results.
            </Text>

            {/* Action Buttons */}
            <View className="w-full gap-4">
              <Button
                variant="default"
                size="lg"
                onPress={handleLoginPress}
                testID="login-button"
                className="w-full"
              >
                <Text>Login</Text>
              </Button>

              <Button
                variant="outline"
                size="lg"
                onPress={handleSignupPress}
                testID="signup-button"
                className="w-full"
              >
                <Text>Create Account</Text>
              </Button>

              {__DEV__ && (
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={handleUiPreviewPress}
                  testId="open-ui-preview-button"
                  className="w-full"
                >
                  <Text>UI Preview</Text>
                </Button>
              )}
            </View>
          </CardContent>
        </Card>
      </View>

      {/* Footer */}
      <View className="pb-8 items-center" testID="footer-section">
        <Text variant="muted" className="text-center text-xs" testID="terms-text">
          By continuing, you agree to our{"\n"}Terms & Privacy Policy
        </Text>
      </View>
    </View>
  );
}
