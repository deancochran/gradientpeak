import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Form, FormTextField } from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { useRouter } from "expo-router";
import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { z } from "zod";
import { ServerUrlOverride } from "@/components/auth/ServerUrlOverride";
import {
  AuthRequestTimeoutError,
  getAuthRequestTimeoutMessage,
  withAuthRequestTimeout,
} from "@/lib/auth/request-timeout";
import { useAuth } from "@/lib/hooks/useAuth";
import { getHostedApiUrl, setServerUrlOverride, useServerConfig } from "@/lib/server-config";
import { useAuthStore } from "@/lib/stores/auth-store";
import { supabase } from "@/lib/supabase/client";

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

type ForgotPasswordFields = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { loading: authLoading } = useAuth();
  const [emailSent, setEmailSent] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isServerConfigExpanded, setIsServerConfigExpanded] = React.useState(false);
  const serverConfig = useServerConfig();
  const [serverUrlInput, setServerUrlInput] = React.useState(
    serverConfig.overrideUrl ?? serverConfig.apiUrl,
  );

  React.useEffect(() => {
    setServerUrlInput(serverConfig.overrideUrl ?? serverConfig.apiUrl);
  }, [serverConfig.overrideUrl, serverConfig.apiUrl]);

  const form = useZodForm({
    schema: forgotPasswordSchema,
    defaultValues: {
      email: "",
    },
  });

  const onSendResetEmail = async (data: ForgotPasswordFields) => {
    setIsSubmitting(true);
    try {
      if (isServerConfigExpanded) {
        const nextUrl = serverUrlInput.trim();
        const hostedApiUrl = getHostedApiUrl();
        const { changed } = await setServerUrlOverride(
          nextUrl.length === 0 || nextUrl === hostedApiUrl ? null : nextUrl,
        );

        if (changed) {
          await useAuthStore.getState().clearSession();
        }
      }

      const { error } = await withAuthRequestTimeout(
        supabase.auth.resetPasswordForEmail(data.email, {
          redirectTo: `${process.env.EXPO_PUBLIC_APP_URL}/(external)/reset-password`,
        }),
      );

      if (error) {
        console.log("Reset password error:", error.message);
        if (error.message?.includes("User not found")) {
          form.setError("email", {
            message: "No account found with this email address",
          });
        } else if (error.message?.includes("Email rate limit")) {
          form.setError("email", {
            message: "Too many requests. Please try again later.",
          });
        } else {
          form.setError("email", {
            message: error.message || "Failed to send reset email",
          });
        }
      } else {
        setEmailSent(true);
      }
    } catch (err) {
      console.log("Unexpected reset password error:", err);
      form.setError("email", {
        message:
          err instanceof AuthRequestTimeoutError
            ? getAuthRequestTimeoutMessage()
            : "An unexpected error occurred. Please try again.",
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
  const submitForm = useZodFormSubmit({
    form,
    onSubmit: onSendResetEmail,
  });

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
                <Text className="text-success-foreground text-2xl font-bold">✓</Text>
              </View>

              {/* Success Message */}
              <View className="items-center mb-8">
                <Text variant="h3" className="text-center mb-2">
                  Check your email
                </Text>
                <Text variant="muted" className="text-center">
                  Weve sent password reset instructions to{"\n"}
                  <Text variant="default" className="font-semibold">
                    {form.getValues("email")}
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
              Enter your email address and we will send you instructions to reset your password
            </Text>
          </CardHeader>

          <CardContent className="gap-6">
            {/* Form */}
            <Form {...form}>
              <View className="gap-4" testID="forgot-password-form">
                <FormTextField
                  autoCapitalize="none"
                  autoComplete="email"
                  control={form.control}
                  keyboardType="email-address"
                  label="Email"
                  name="email"
                  placeholder="Email address"
                  testId="email-input"
                />
              </View>
            </Form>

            {/* Send Reset Button */}
            <Button
              variant="default"
              size="lg"
              onPress={submitForm.handleSubmit}
              disabled={isLoading}
              testID="send-reset-button"
              className="w-full"
            >
              <Text>{isLoading ? "Sending..." : "Send Reset Instructions"}</Text>
            </Button>

            <ServerUrlOverride
              expanded={isServerConfigExpanded}
              value={serverUrlInput}
              usingHostedDefault={!serverConfig.overrideUrl}
              onToggle={() => setIsServerConfigExpanded((currentValue) => !currentValue)}
              onChange={setServerUrlInput}
            />

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
