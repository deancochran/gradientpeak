import { zodResolver } from "@hookform/resolvers/zod";
import { Slot, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from "react-native";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type ResetPasswordFields = z.infer<typeof resetPasswordSchema>;

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { access_token, refresh_token } = useLocalSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [sessionSet, setSessionSet] = useState(false);
  const { isDarkColorScheme } = useColorScheme();

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ResetPasswordFields>({
    resolver: zodResolver(resetPasswordSchema),
  });

  useEffect(() => {
    // Set the session from the deep link tokens
    const setSessionFromTokens = async () => {
      console.log("🔗 Password reset callback received:", {
        hasAccessToken: !!access_token,
        hasRefreshToken: !!refresh_token,
      });

      if (access_token && refresh_token) {
        try {
          console.log("🔑 Setting session from reset password tokens...");
          const { error } = await supabase.auth.setSession({
            access_token: access_token as string,
            refresh_token: refresh_token as string,
          });

          if (error) {
            console.error("❌ Session error:", error.message);
            Alert.alert(
              "Invalid Link",
              "This password reset link is invalid or has expired. Please request a new one.",
              [
                {
                  text: "OK",
                  onPress: () => router.replace("/(external)/forgot-password"),
                },
              ],
            );
            return;
          }

          console.log("✅ Session set successfully for password reset");
          setSessionSet(true);
        } catch (err) {
          console.error("💥 Error setting session:", err);
          Alert.alert("Error", "Something went wrong. Please try again.", [
            {
              text: "OK",
              onPress: () => router.replace("/(external)/forgot-password"),
            },
          ]);
        }
      } else {
        console.warn("⚠️ No tokens found in reset password callback");
        Alert.alert(
          "Invalid Link",
          "This password reset link is invalid. Please request a new one.",
          [
            {
              text: "OK",
              onPress: () => router.replace("/(external)/forgot-password"),
            },
          ],
        );
      }
    };

    setSessionFromTokens();
  }, [access_token, refresh_token, router, fadeAnim, slideAnim]);

  const onUpdatePassword = async (data: ResetPasswordFields) => {
    if (!sessionSet) {
      setError("root", { message: "Session not ready. Please try again." });
      return;
    }

    setIsLoading(true);

    try {
      console.log("🔄 Updating password...");
      const { error } = await supabase.auth.updateUser({
        password: data.password,
      });

      if (error) {
        console.error("❌ Password update error:", error.message);
        setError("root", { message: error.message });
        return;
      }

      console.log("✅ Password updated successfully");

      Alert.alert(
        "Success!",
        "Your password has been updated successfully. You are now signed in.",
        [{ text: "OK", onPress: () => router.replace("/") }],
      );
    } catch (err) {
      console.error("💥 Unexpected password update error:", err);
      setError("root", { message: "An unexpected error occurred" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Slot />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[styles.container, { backgroundColor }]}
        testID="reset-password-screen"
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
            testID="reset-password-content"
          >
            {/* Header */}
            <View style={styles.header} testID="reset-password-header">
              <Text
                style={[styles.title, { color: textColor }]}
                testID="reset-password-title"
              >
                Set New Password
              </Text>
              <Text
                style={[styles.subtitle, { color: subtleColor }]}
                testID="reset-password-subtitle"
              >
                Please enter your new password below
              </Text>
            </View>

            {/* Form */}
            <View style={styles.form} testID="reset-password-form">
              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: textColor }]}>
                  New Password
                </Text>
                <Controller
                  control={control}
                  name="password"
                  render={({ field: { onChange, value } }) => (
                    <Input
                      placeholder="Enter new password"
                      value={value}
                      onChangeText={onChange}
                      secureTextEntry
                      autoFocus
                      style={[
                        styles.input,
                        {
                          borderColor: errors.password
                            ? errorColor
                            : borderColor,
                          color: textColor,
                        },
                      ]}
                      testID="password-input"
                    />
                  )}
                />
                {errors.password && (
                  <Text
                    style={[styles.errorText, { color: errorColor }]}
                    testID="password-error"
                  >
                    {errors.password.message}
                  </Text>
                )}

                {/* Password Requirements */}
                <View style={styles.passwordHints} testID="password-hints">
                  <Text style={[styles.hintText, { color: subtleColor }]}>
                    Password must contain:
                  </Text>
                  <Text style={[styles.hintText, { color: subtleColor }]}>
                    • At least 8 characters
                  </Text>
                  <Text style={[styles.hintText, { color: subtleColor }]}>
                    • One uppercase letter
                  </Text>
                  <Text style={[styles.hintText, { color: subtleColor }]}>
                    • One number
                  </Text>
                </View>
              </View>

              <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: textColor }]}>
                  Confirm Password
                </Text>
                <Controller
                  control={control}
                  name="confirmPassword"
                  render={({ field: { onChange, value } }) => (
                    <Input
                      placeholder="Confirm new password"
                      value={value}
                      onChangeText={onChange}
                      secureTextEntry
                      style={[
                        styles.input,
                        {
                          borderColor: errors.confirmPassword
                            ? errorColor
                            : borderColor,
                          color: textColor,
                        },
                      ]}
                      testID="confirm-password-input"
                    />
                  )}
                />
                {errors.confirmPassword && (
                  <Text
                    style={[styles.errorText, { color: errorColor }]}
                    testID="confirm-password-error"
                  >
                    {errors.confirmPassword.message}
                  </Text>
                )}
              </View>

              {errors.root && (
                <Text
                  style={[
                    styles.errorText,
                    { color: errorColor, textAlign: "center" },
                  ]}
                  testID="form-error"
                >
                  {errors.root.message}
                </Text>
              )}
            </View>

            {/* Update Password Button */}
            <View
              style={[
                styles.buttonContainer,
                { transform: [{ scale: buttonScaleAnim }] },
              ]}
              testID="update-password-button-container"
            >
              <Button
                onPress={handleSubmit(onUpdatePassword)}
                disabled={isLoading || !sessionSet}
                style={[
                  styles.primaryButton,
                  {
                    backgroundColor: textColor,
                    opacity: isLoading || !sessionSet ? 0.7 : 1,
                  },
                ]}
                testID="update-password-button"
              >
                <Text
                  style={[styles.primaryButtonText, { color: backgroundColor }]}
                  testID="update-password-button-text"
                >
                  {isLoading ? "Updating Password..." : "Update Password"}
                </Text>
              </Button>
            </View>

            {/* Help Text */}
            <View style={styles.helpContainer} testID="help-container">
              <Text
                style={[styles.helpText, { color: subtleColor }]}
                testID="help-text"
              >
                After updating your password, you'll be automatically signed in
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
