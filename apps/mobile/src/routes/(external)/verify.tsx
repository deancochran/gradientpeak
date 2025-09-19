import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";

import { supabase } from "@/lib/supabase/client";

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

const resendSchema = z.object({
  email: z.string().email("Invalid email address"),
});

type ResendFields = z.infer<typeof resendSchema>;

export default function VerifyScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [showResendForm, setShowResendForm] = React.useState(false);
  const [isResending, setIsResending] = React.useState(false);

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ResendFields>({
    resolver: zodResolver(resendSchema),
  });

  React.useEffect(() => {
    // Check if user becomes verified and redirect
    if (user && user.email_confirmed_at) {
      router.replace("/(internal)/(tabs)");
    }
  }, [user, router]);

  const onResendVerification = async ({ email }: ResendFields) => {
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
    router.replace("/(external)/sign-in");
  };

  const handleResendPress = () => {
    setShowResendForm(!showResendForm);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
      testID="verify-screen"
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
                Check your email
              </Text>
            </CardTitle>
            <Text variant="muted" className="text-center">
              We sent a verification link to {user?.email || "your email"}.
              Click the link to verify your account and continue.
            </Text>
          </CardHeader>

          <CardContent className="gap-6">
            {/* Status Message */}
            {errors.root && (
              <View
                className={`p-3 rounded-md border ${
                  errors.root?.message?.includes("sent")
                    ? "bg-success/15 border-success/25"
                    : "bg-destructive/15 border-destructive/25"
                }`}
                testID="status-message"
              >
                <Text
                  variant="small"
                  className={`text-center ${
                    errors.root?.message?.includes("sent")
                      ? "text-success"
                      : "text-destructive"
                  }`}
                  testID="status-text"
                >
                  {errors.root?.message}
                </Text>
              </View>
            )}

            {/* Resend Form */}
            {showResendForm && (
              <View className="gap-4" testID="resend-form">
                <View className="gap-2">
                  <Label nativeID="email-label">Email</Label>
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

                <Button
                  variant="outline"
                  size="lg"
                  onPress={handleSubmit(onResendVerification)}
                  disabled={isResending}
                  testID="resend-button"
                  className="w-full"
                >
                  <Text>
                    {isResending ? "Sending..." : "Send verification email"}
                  </Text>
                </Button>
              </View>
            )}

            {/* Action Buttons */}
            <View className="gap-4">
              <Button
                variant="default"
                size="lg"
                onPress={handleContinuePress}
                testID="continue-button"
                className="w-full"
              >
                <Text>Continue to Sign In</Text>
              </Button>

              <Button
                variant="link"
                onPress={handleResendPress}
                testID="resend-link"
                className="w-full"
              >
                <Text className="text-muted-foreground">
                  {showResendForm ? "Cancel" : "Didn't receive an email?"}
                </Text>
              </Button>
            </View>
          </CardContent>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
