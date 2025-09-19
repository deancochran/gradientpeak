import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";

import { zodResolver } from "@hookform/resolvers/zod";
import { Slot, useRouter } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/hooks/useAuth";

const forgotPasswordSchema = z.object({
  email: z.email("Invalid email address"),
});

type ForgotPasswordFields = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { loading, resetPassword } = useAuth();
  const [emailSent, setEmailSent] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const {
    control,
    handleSubmit,
    setError,
    getValues,
    formState: { errors },
  } = useForm<ForgotPasswordFields>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSendResetEmail = async (data: ForgotPasswordFields) => {
    setIsSubmitting(true);
    try {
      const { error } = await resetPassword(data.email);

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

  if (emailSent) {
    return (
      <>
        <Slot />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={[styles.container, { backgroundColor }]}
          testID="reset-email-sent-screen"
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
            <Button
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
            </Button>

            <Button
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
            </Button>
          </View>
        </KeyboardAvoidingView>
      </>
    );
  }

  return (
    <>
      <Slot />
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

          <Button
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
          </Button>

          {/* Back to Sign In Link */}
          <View
            style={styles.linkContainer}
            testID="back-to-signin-link-container"
          >
            <Button
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
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
