import { useRouter } from "expo-router";
import React from "react";
import {  Button, View } from "react-native";

import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/hooks/useAuth";

export default function WelcomeScreen() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  React.useEffect(() => {
    // Log authentication state on mount
    console.log("🏠 Welcome Screen: isAuthenticated =", isAuthenticated);


  const handleLoginPress = () => {
    router.replace("/(external)/sign-in");
  };

  const handleSignupPress = () => {
    router.replace("/(external)/sign-up");
  };


  return (
    <View
      style={[styles.container]}
      testID="welcome-screen"
    >

      {/* Hero Section */}
      <View
        style={[
          styles.heroSection,

        ]}
        testID="hero-section"
      >
        {/* Logo */}
        <View
          style={[styles.logoContainer]}
          testID="logo-container"
        >
          <View
            style={[
              styles.logoPlaceholder,
            ]}
            testID="app-logo"
          >
            <Text
              style={[
                styles.logoText,
              ]}
              testID="logo-text"
            >
              TF
            </Text>
          </View>
        </View>

        {/* Hero Content */}
        <View
          style={[
            styles.heroContent,

          ]}
          testID="hero-content"
        >
          <Text
            style={[styles.heroTitle]}
            testID="hero-title"
          >
            TurboFit
          </Text>
          <Text
            style={[styles.heroSubtitle]}
            testID="hero-subtitle"
          >
            Minimal fitness tracking.{"\n"}Maximum results.
          </Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View
        style={[styles.actionSection]}
        testID="action-section"
      >
        <View style={styles.buttonContainer} testID="button-container">
          <View >
            <Button
              onPress={handleLoginPress}
              style={[
                styles.primaryButton,

              ]}
              activeOpacity={0.9}
              testID="login-button"
            >
              <Text
                style={[styles.primaryButtonText]}
                testID="login-button-text"
              >
                Login
              </Text>
            </Button>
          </View>

          <View

          >
            <Button
              onPress={handleSignupPress}
              activeOpacity={0.8}
              testID="signup-button"
            >
              <Text
                style={[styles.secondaryButtonText]}
                testID="signup-button-text"
              >
                Create Account
              </Text>
            </Button>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footerText} testID="footer-section">
          <Text
            style={[styles.termsText]}
            testID="terms-text"
          >
            By continuing, you agree to our{"\n"}Terms & Privacy Policy
          </Text>
        </View>
      </View>
    </View>
  );
}
