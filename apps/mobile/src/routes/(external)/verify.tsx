import React from "react";
import {
  Animated,
  Button,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { zodResolver } from "@hookform/resolvers/zod";
import { Stack, useRouter } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Input } from "@/components/ui/input";
import { useAuth, useUser } from "@/lib/hooks/useAuth";

const resendSchema = z.object({
  email: z.email("Invalid email address"),
});

type ResendFields = z.infer<typeof resendSchema>;

export default function VerifyScreen() {
  const router = useRouter();
  const { isDarkColorScheme } = useColorScheme();
  const { loading } = useAuth();
  const user = useUser();
  const [showResendForm, setShowResendForm] = React.useState(false);
  const [isResending, setIsResending] = React.useState(false);

  // Animation refs
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const slideAnim = React.useRef(new Animated.Value(30)).current;
  const buttonScaleAnim = React.useRef(new Animated.Value(1)).current;
  const resendScaleAnim = React.useRef(new Animated.Value(1)).current;

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ResendFields>({
    resolver: zodResolver(resendSchema),
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

    // Check if user becomes verified and redirect
    if (user && user.email_confirmed_at) {
      router.replace("/(internal)/(tabs)");
    }
  }, [user]);

  const onResendVerification = async ({ email }: ResendFields) => {
    // Button press animation
    Animated.sequence([
      Animated.timing(resendScaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(resendScaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    setIsResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email,
      });

      if (error) {
        console.log("Resend verification error:", error);
        setError("email", {
          message: error.message || "Failed to resend verification email",
        });
      } else {
        // Success - show confirmation
        setShowResendForm(false);
        setError("root", {
          message: "Verification email sent! Please check your inbox.",
        });
      }
    } catch (err) {
      console.log("Unexpected resend verification error:", err);
      setError("email", { message: "Failed to resend verification email" });
    } finally {
      setIsResending(false);
    }
  };

  const handleContinuePress = () => {
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
    ]).start(() => {
      router.replace("/(external)/sign-in");
    });
  };

  const handleResendPress = () => {
    setShowResendForm(!showResendForm);
  };

  const backgroundColor = isDarkColorScheme ? "#000000" : "#ffffff";
  const textColor = isDarkColorScheme ? "#ffffff" : "#000000";
  const subtleColor = isDarkColorScheme ? "#666666" : "#999999";
  const borderColor = isDarkColorScheme ? "#333333" : "#e5e5e5";
  const errorColor = isDarkColorScheme ? "#ff6b6b" : "#dc3545";

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
        testID="verify-screen"
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.content,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
            testID="verify-content"
          >
            {/* Header */}
            <View style={styles.header} testID="verify-header">
              <Text
                style={[styles.title, { color: textColor }]}
                testID="verify-title"
              >
                Check your email
              </Text>
              <Text
                style={[styles.subtitle, { color: subtleColor }]}
                testID="verify-subtitle"
              >
                We sent a verification link to {user?.email || "your email"}.
                Click the link to verify your account and continue.
              </Text>
            </View>

            {/* Status Message */}
            {errors.root && (
              <View style={styles.messageContainer} testID="status-message">
                <Text
                  style={[
                    styles.messageText,
                    {
                      color: errors.root?.message?.includes("sent")
                        ? "#10b981"
                        : errorColor,
                      textAlign: "center",
                    },
                  ]}
                  testID="status-text"
                >
                  {errors.root?.message}
                </Text>
              </View>
            )}

            {/* Resend Form */}
            {showResendForm && (
              <View style={styles.form} testID="resend-form">
                <View style={styles.inputContainer}>
                  <Controller
                    control={control}
                    name="email"
                    render={({ field: { onChange, value } }) => (
                      <Input
                        placeholder="Enter your email address"
                        value={value}
                        onChangeText={onChange}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        autoComplete="email"
                        style={[
                          styles.input,
                          {
                            borderColor: errors.email
                              ? errorColor
                              : borderColor,
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

                <View
                  style={[
                    styles.buttonContainer,
                    { transform: [{ scale: resendScaleAnim }] },
                  ]}
                  testID="resend-button-container"
                >
                  <Button
                    onPress={handleSubmit(onResendVerification)}
                    disabled={isResending}
                    style={[
                      styles.secondaryButton,
                      {
                        borderColor,
                        opacity: isResending ? 0.7 : 1,
                      },
                    ]}
                    testID="resend-button"
                  >
                    <Text
                      style={[styles.secondaryButtonText, { color: textColor }]}
                      testID="resend-button-text"
                    >
                      {isResending ? "Sending..." : "Send verification email"}
                    </Text>
                  </Button>
                </View>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.actionsContainer}>
              <View
                style={[
                  styles.buttonContainer,
                  { transform: [{ scale: buttonScaleAnim }] },
                ]}
                testID="continue-button-container"
              >
                <Button
                  onPress={handleContinuePress}
                  style={[
                    styles.primaryButton,
                    {
                      backgroundColor: textColor,
                    },
                  ]}
                  testID="continue-button"
                >
                  <Text
                    style={[
                      styles.primaryButtonText,
                      { color: backgroundColor },
                    ]}
                    testID="continue-button-text"
                  >
                    Continue to Sign In
                  </Text>
                </Button>
              </View>

              <Button
                onPress={handleResendPress}
                style={styles.linkButton}
                testID="resend-link"
              >
                <Text
                  style={[styles.linkText, { color: subtleColor }]}
                  testID="resend-link-text"
                >
                  {showResendForm ? "Cancel" : "Didn't receive an email?"}
                </Text>
              </Button>
            </View>
          </View>
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
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    fontWeight: "400",
  },
  form: {
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
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: 8,
  },
  errorText: {
    fontSize: 14,
    marginTop: 8,
    fontWeight: "500",
  },
  buttonContainer: {
    marginBottom: 20,
  },
  messageContainer: {
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  messageText: {
    fontSize: 16,
    fontWeight: "500",
    lineHeight: 24,
  },
  actionsContainer: {
    alignItems: "center",
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
    marginBottom: 16,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  secondaryButton: {
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  linkButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  linkText: {
    fontSize: 16,
    fontWeight: "500",
    textAlign: "center",
  },
});
