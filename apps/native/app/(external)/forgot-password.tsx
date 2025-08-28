import React from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { zodResolver } from "@hookform/resolvers/zod";
import { Stack, useRouter } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/contexts";
import { supabase } from "@/lib/supabase";
import { useColorScheme } from "@/lib/useColorScheme";

const forgotPasswordSchema = z.object({
  email: z.email("Invalid email address"),
});

type ForgotPasswordFields = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { isDarkColorScheme } = useColorScheme();
  const { loading } = useAuth();
  const [emailSent, setEmailSent] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Animation refs
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const slideAnim = React.useRef(new Animated.Value(30)).current;
  const buttonScaleAnim = React.useRef(new Animated.Value(1)).current;

  const {
    control,
    handleSubmit,
    setError,
    getValues,
    formState: { errors },
  } = useForm<ForgotPasswordFields>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  React.useEffect(() => {
    // Entrance animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const onSendResetEmail = async (data: ForgotPasswordFields) => {
    // Button press animation
    Animated.sequence([
      Animated.timing(buttonScaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(buttonScaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(data.email);

      if (error) {
        console.log("Reset password error:", error);

        if (error.message?.includes("User not found")) {
          setError("email", {
            message: "No account found with this email address",
          });
        } else if (error.message?.includes("Email rate limit")) {
          setError("email", {
            message: "Too many requests. Please try again later.",
          });
        } else {
          setError("email", {
            message: error.message || "Failed to send reset email",
          });
        }
      } else {
        setEmailSent(true);
      }
    } catch (err) {
      console.log("Unexpected reset password error:", err);
      setError("email", {
        message: "An unexpected error occurred. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToSignIn = () => {
    router.replace("/(external)/sign-in");
  };

  const handleTryDifferentEmail = () => {
    setEmailSent(false);
  };

  const backgroundColor = isDarkColorScheme ? "#000000" : "#ffffff";
  const textColor = isDarkColorScheme ? "#ffffff" : "#000000";
  const subtleColor = isDarkColorScheme ? "#666666" : "#999999";
  const borderColor = isDarkColorScheme ? "#333333" : "#e5e5e5";
  const errorColor = isDarkColorScheme ? "#ff6b6b" : "#dc3545";
  const successColor = isDarkColorScheme ? "#4ade80" : "#16a34a";

  if (emailSent) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "",
            headerStyle: {
              backgroundColor,
            },
          }}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={[styles.container, { backgroundColor }]}
          testID="reset-email-sent-screen"
        >
          <Animated.View
            style={[
              styles.content,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
            testID="reset-email-sent-content"
          >
            {/* Success Icon */}
            <View style={styles.iconContainer} testID="success-icon-container">
              <View
                style={[
                  styles.successIcon,
                  {
                    backgroundColor: successColor,
                    shadowColor: successColor,
                  },
                ]}
                testID="success-icon"
              >
                <Text
                  style={[styles.checkmark, { color: backgroundColor }]}
                  testID="checkmark"
                >
                  ✓
                </Text>
              </View>
            </View>

            {/* Success Message */}
            <View style={styles.messageContainer} testID="message-container">
              <Text
                style={[styles.title, { color: textColor }]}
                testID="success-title"
              >
                Check your email
              </Text>
              <Text
                style={[styles.description, { color: subtleColor }]}
                testID="success-description"
              >
                We&apos;ve sent password reset instructions to{"\n"}
                <Text style={{ fontWeight: "600" }}>{getValues("email")}</Text>
              </Text>
            </View>

            {/* Action Buttons */}
            <View style={styles.buttonsContainer} testID="buttons-container">
              <TouchableOpacity
                onPress={handleBackToSignIn}
                style={[
                  styles.primaryButton,
                  {
                    backgroundColor: textColor,
                    shadowColor: textColor,
                  },
                ]}
                testID="back-to-signin-button"
              >
                <Text
                  style={[styles.primaryButtonText, { color: backgroundColor }]}
                  testID="back-to-signin-button-text"
                >
                  Back to Sign In
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleTryDifferentEmail}
                style={[styles.secondaryButton, { borderColor }]}
                testID="try-different-email-button"
              >
                <Text
                  style={[styles.secondaryButtonText, { color: textColor }]}
                  testID="try-different-email-button-text"
                >
                  Try different email
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "",
          headerStyle: {
            backgroundColor,
          },
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[styles.container, { backgroundColor }]}
        testID="forgot-password-screen"
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[
              styles.content,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
            testID="forgot-password-content"
          >
            {/* Header */}
            <View style={styles.header} testID="forgot-password-header">
              <Text
                style={[styles.title, { color: textColor }]}
                testID="forgot-password-title"
              >
                Reset your password
              </Text>
              <Text
                style={[styles.subtitle, { color: subtleColor }]}
                testID="forgot-password-subtitle"
              >
                Enter your email address and we&apos;ll send you instructions to
                reset your password
              </Text>
            </View>

            {/* Form */}
            <View style={styles.form} testID="forgot-password-form">
              <View style={styles.inputContainer}>
                <Controller
                  control={control}
                  name="email"
                  render={({ field: { onChange, value } }) => (
                    <Input
                      placeholder="Email address"
                      value={value}
                      onChangeText={onChange}
                      autoFocus
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoComplete="email"
                      style={[
                        styles.input,
                        {
                          borderColor: errors.email ? errorColor : borderColor,
                          color: textColor,
                        },
                      ]}
                      testID="email-input"
                    />
                  )}
                />
                {errors.email && (
                  <Text
                    style={[styles.errorText, { color: errorColor }]}
                    testID="email-error"
                  >
                    {errors.email.message}
                  </Text>
                )}
              </View>
            </View>

            {/* Send Reset Email Button */}
            <Animated.View
              style={[
                styles.buttonContainer,
                { transform: [{ scale: buttonScaleAnim }] },
              ]}
              testID="send-reset-button-container"
            >
              <TouchableOpacity
                onPress={handleSubmit(onSendResetEmail)}
                disabled={isSubmitting}
                style={[
                  styles.primaryButton,
                  {
                    backgroundColor: textColor,
                    opacity: loading ? 0.7 : 1,
                  },
                ]}
                testID="send-reset-button"
              >
                <Text
                  style={[styles.primaryButtonText, { color: backgroundColor }]}
                  testID="send-reset-button-text"
                >
                  {loading ? "Sending..." : "Send Reset Instructions"}
                </Text>
              </TouchableOpacity>
            </Animated.View>

            {/* Back to Sign In Link */}
            <View
              style={styles.linkContainer}
              testID="back-to-signin-link-container"
            >
              <TouchableOpacity
                onPress={handleBackToSignIn}
                style={[styles.secondaryButton, { borderColor }]}
                testID="back-to-signin-link-button"
              >
                <Text
                  style={[styles.secondaryButtonText, { color: textColor }]}
                  testID="back-to-signin-link-text"
                >
                  Back to Sign In
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  content: {
    width: "100%",
    alignItems: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 12,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    fontWeight: "400",
    lineHeight: 24,
    maxWidth: 300,
  },
  form: {
    width: "100%",
    marginBottom: 32,
  },
  inputContainer: {
    marginBottom: 20,
  },
  input: {
    height: 56,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 20,
    fontSize: 16,
    fontWeight: "500",
  },
  errorText: {
    fontSize: 14,
    marginTop: 8,
    fontWeight: "500",
  },
  buttonContainer: {
    width: "100%",
    marginBottom: 20,
  },
  primaryButton: {
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  linkContainer: {
    alignItems: "center",
    width: "100%",
  },
  secondaryButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  iconContainer: {
    marginBottom: 40,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  checkmark: {
    fontSize: 32,
    fontWeight: "900",
  },
  messageContainer: {
    alignItems: "center",
    marginBottom: 60,
    maxWidth: 320,
  },
  description: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
    fontWeight: "400",
  },
  buttonsContainer: {
    width: "100%",
    gap: 16,
  },
});
