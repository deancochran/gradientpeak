import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/hooks/useAuth";

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

type ForgotPasswordFields = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { isLoading: authLoading, resetPassword } = useAuth();
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

  const isLoading = authLoading || isSubmitting;

  if (emailSent) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 bg-background p-6"
        testID="reset-email-sent-screen"
      >
        <View className="flex-1 justify-center items-center">
          <Card className="w-full max-w-sm bg-card border-border shadow-sm">
            <CardContent className="p-8 items-center">
              {/* Success Icon */}
              <View className="w-16 h-16 bg-success rounded-full items-center justify-center mb-6">
                <Text className="text-success-foreground text-2xl font-bold">
                  ✓
                </Text>
              </View>

              {/* Success Message */}
              <View className="items-center mb-8">
                <Text variant="h3" className="text-center mb-2">
                  Check your email
                </Text>
                <Text variant="muted" className="text-center">
                  We've sent password reset instructions to{"\n"}
                  <Text variant="default" className="font-semibold">
                    {getValues("email")}
                  </Text>
                </Text>
              </View>

              {/* Action Buttons */}
              <View className="w-full gap-4">
                <Button
                  variant="default"
                  size="lg"
                  onPress={handleBackToSignIn}
                  testID="back-to-signin-button"
                  className="w-full"
                >
                  <Text>Back to Sign In</Text>
                </Button>

                <Button
                  variant="outline"
                  size="lg"
                  onPress={handleTryDifferentEmail}
                  testID="try-different-email-button"
                  className="w-full"
                >
                  <Text>Try different email</Text>
                </Button>
              </View>
            </CardContent>
          </Card>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
      testID="forgot-password-screen"
    >
      <ScrollView
        contentContainerClassName="flex-grow justify-center p-6"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Card className="w-full max-w-sm mx-auto bg-card border-border shadow-sm">
          <CardHeader className="items-center pb-6">
            <CardTitle>
              <Text variant="h2" className="text-center">
                Reset your password
              </Text>
            </CardTitle>
            <Text variant="muted" className="text-center">
              Enter your email address and we'll send you instructions to reset
              your password
            </Text>
          </CardHeader>

          <CardContent className="gap-6">
            {/* Form */}
            <View className="gap-4" testID="forgot-password-form">
              <View className="gap-2">
                <Label nativeID="email-label">Email</Label>
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
                      className={errors.email ? "border-destructive" : ""}
                      testID="email-input"
                      aria-labelledby="email-label"
                    />
                  )}
                />
                {errors.email && (
                  <Text variant="small" className="text-destructive">
                    {errors.email.message}
                  </Text>
                )}
              </View>
            </View>

            {/* Send Reset Button */}
            <Button
              variant="default"
              size="lg"
              onPress={handleSubmit(onSendResetEmail)}
              disabled={isLoading}
              testID="send-reset-button"
              className="w-full"
            >
              <Text>
                {isLoading ? "Sending..." : "Send Reset Instructions"}
              </Text>
            </Button>

            {/* Back to Sign In Link */}
            <View className="border-t border-border pt-4">
              <Button
                variant="outline"
                onPress={handleBackToSignIn}
                testID="back-to-signin-link-button"
                className="w-full"
              >
                <Text>Back to Sign In</Text>
              </Button>
            </View>
          </CardContent>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
