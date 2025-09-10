import { useRouter } from "expo-router";
import React from "react";
import {
  Animated,
  Platform,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

import { ThemedView } from "@components/ThemedView";
import { Text } from "@components/ui/text";
import { useAuth } from "@lib/stores";
import { useColorScheme } from "@lib/providers/ThemeProvider";

export default function WelcomeScreen() {
  const router = useRouter();
  const { isDarkColorScheme } = useColorScheme();
  const { isAuthenticated } = useAuth();

  // Animation refs
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const slideAnim = React.useRef(new Animated.Value(50)).current;
  const logoAnim = React.useRef(new Animated.Value(0)).current;
  const buttonAnim = React.useRef(new Animated.Value(0)).current;
  const scaleAnim = React.useRef(new Animated.Value(0.95)).current;

  // Button press animations
  const loginPressAnim = React.useRef(new Animated.Value(1)).current;
  const signupPressAnim = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    // Log authentication state on mount
    console.log("🏠 Welcome Screen: isAuthenticated =", isAuthenticated);

    // Stagger animations for smooth entrance
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(logoAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(buttonAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim, logoAnim, slideAnim, buttonAnim, isAuthenticated]);

  const handleLoginPress = () => {
    Animated.sequence([
      Animated.timing(loginPressAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(loginPressAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start(() => {
      console.log("👉 Navigating to sign-in");
      router.replace("/(external)/sign-in");
    });
  };

  const handleSignupPress = () => {
    Animated.sequence([
      Animated.timing(signupPressAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(signupPressAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start(() => {
      console.log("👉 Navigating to sign-up");
      router.replace("/(external)/sign-up");
    });
  };

  const backgroundColor = isDarkColorScheme ? "#000000" : "#ffffff";
  const textColor = isDarkColorScheme ? "#ffffff" : "#000000";
  const subtleColor = isDarkColorScheme ? "#666666" : "#999999";
  const borderColor = isDarkColorScheme ? "#333333" : "#e5e5e5";

  return (
    <ThemedView
      style={[styles.container, { backgroundColor }]}
      testID="welcome-screen"
    >
      <StatusBar
        barStyle={isDarkColorScheme ? "light-content" : "dark-content"}
        backgroundColor={backgroundColor}
      />

      {/* Hero Section */}
      <Animated.View
        style={[
          styles.heroSection,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
          },
        ]}
        testID="hero-section"
      >
        {/* Logo */}
        <Animated.View
          style={[styles.logoContainer, { opacity: logoAnim }]}
          testID="logo-container"
        >
          <View
            style={[
              styles.logoPlaceholder,
              {
                backgroundColor: isDarkColorScheme ? "#ffffff" : "#000000",
                shadowColor: textColor,
                shadowOpacity: 0.1,
                shadowOffset: { width: 0, height: 10 },
                shadowRadius: 30,
                elevation: 10,
              },
            ]}
            testID="app-logo"
          >
            <Text
              style={[
                styles.logoText,
                { color: isDarkColorScheme ? "#000000" : "#ffffff" },
              ]}
              testID="logo-text"
            >
              TF
            </Text>
          </View>
        </Animated.View>

        {/* Hero Content */}
        <Animated.View
          style={[
            styles.heroContent,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
          testID="hero-content"
        >
          <Text
            style={[styles.heroTitle, { color: textColor }]}
            testID="hero-title"
          >
            TurboFit
          </Text>
          <Text
            style={[styles.heroSubtitle, { color: subtleColor }]}
            testID="hero-subtitle"
          >
            Minimal fitness tracking.{"\n"}Maximum results.
          </Text>
        </Animated.View>
      </Animated.View>

      {/* Action Buttons */}
      <Animated.View
        style={[styles.actionSection, { opacity: buttonAnim }]}
        testID="action-section"
      >
        <View style={styles.buttonContainer} testID="button-container">
          <Animated.View
            style={{
              transform: [{ scale: loginPressAnim }],
            }}
          >
            <TouchableOpacity
              onPress={handleLoginPress}
              style={[
                styles.primaryButton,
                {
                  backgroundColor: textColor,
                  shadowColor: textColor,
                },
              ]}
              activeOpacity={0.9}
              testID="login-button"
            >
              <Text
                style={[styles.primaryButtonText, { color: backgroundColor }]}
                testID="login-button-text"
              >
                Login
              </Text>
            </TouchableOpacity>
          </Animated.View>

          <Animated.View
            style={{
              transform: [{ scale: signupPressAnim }],
            }}
          >
            <TouchableOpacity
              onPress={handleSignupPress}
              style={[
                styles.secondaryButton,
                {
                  borderColor: borderColor,
                  backgroundColor: "transparent",
                },
              ]}
              activeOpacity={0.8}
              testID="signup-button"
            >
              <Text
                style={[styles.secondaryButtonText, { color: textColor }]}
                testID="signup-button-text"
              >
                Create Account
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Footer */}
        <View style={styles.footerText} testID="footer-section">
          <Text
            style={[styles.termsText, { color: subtleColor }]}
            testID="terms-text"
          >
            By continuing, you agree to our{"\n"}Terms & Privacy Policy
          </Text>
        </View>
      </Animated.View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  heroSection: {
    flex: 3,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    paddingTop: Platform.OS === "ios" ? 60 : 40,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 60,
  },
  logoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -1,
  },
  heroContent: {
    alignItems: "center",
  },
  heroTitle: {
    fontSize: 48,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 16,
    letterSpacing: -2,
  },
  heroSubtitle: {
    fontSize: 18,
    textAlign: "center",
    lineHeight: 26,
    maxWidth: 300,
    fontWeight: "400",
  },
  actionSection: {
    flex: 1,
    paddingHorizontal: 40,
    paddingBottom: 50,
    justifyContent: "space-between",
  },
  buttonContainer: {
    gap: 16,
    marginTop: 20,
  },
  primaryButton: {
    height: 60,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  secondaryButton: {
    height: 60,
    borderRadius: 20,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
  },
  secondaryButtonText: {
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: -0.5,
  },
  footerText: {
    alignItems: "center",
    paddingBottom: 20,
  },
  termsText: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
    fontWeight: "400",
  },
});
