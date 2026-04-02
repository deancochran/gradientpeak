import { Alert, AlertDescription } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Form, FormMessage, FormTextField } from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import { useZodForm } from "@repo/ui/hooks";
import { useRouter } from "expo-router";
import { AlertCircle } from "lucide-react-native";
import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { z } from "zod";
import { ServerUrlOverride } from "@/components/auth/ServerUrlOverride";
import { authClient, getEmailVerificationCallbackUrl } from "@/lib/auth/client";
import {
  AuthRequestTimeoutError,
  getAuthRequestTimeoutMessage,
  withAuthRequestTimeout,
} from "@/lib/auth/request-timeout";
import { useAuth } from "@/lib/hooks/useAuth";
import { logMobileAction } from "@/lib/logging/mobile-action-log";
import { getHostedApiUrl, setServerUrlOverride, useServerConfig } from "@/lib/server-config";
import { useAuthStore } from "@/lib/stores/auth-store";

const signUpSchema = z
  .object({
    email: z.string().email("Invalid email address"),
    password: z
      .string({ message: "Password is required" })
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
    repeatPassword: z.string({ message: "Please confirm your password" }),
  })
  .refine((data) => data.password === data.repeatPassword, {
    message: "Passwords do not match",
    path: ["repeatPassword"],
  });

type SignUpFields = z.infer<typeof signUpSchema>;

export default function SignUpScreen() {
  const router = useRouter();
  const { loading: authLoading } = useAuth();
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
    schema: signUpSchema,
  });

  const onSignUp = async (data: SignUpFields) => {
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

      logMobileAction("auth.signUp", "attempt", { email: data.email });

      const result = await withAuthRequestTimeout(
        authClient.signUp.email({
          email: data.email,
          password: data.password,
          name: data.email.split("@")[0] || data.email,
          callbackURL: getEmailVerificationCallbackUrl(),
        }),
      );
      const error = result.error;

      if (error) {
        logMobileAction("auth.signUp", "failure", { email: data.email, error: error.message });
        console.log("Sign up error:", error.message);
        if (error.message?.includes("User already registered")) {
          form.setError("email", {
            message: "An account with this email already exists",
          });
        } else if (error.message?.includes("Password should be")) {
          form.setError("password", {
            message: error.message,
          });
        } else if (error.message?.includes("Unable to validate email")) {
          form.setError("email", {
            message: "Please enter a valid email address",
          });
        } else {
          form.setError("root", {
            message: error.message || "An unexpected error occurred",
          });
        }
      } else {
        logMobileAction("auth.signUp", "success", { email: data.email });
        // Successfully signed up - show verification message
        console.log("Successfully signed up:", data.email);
        router.push({
          pathname: "/(external)/verify",
          params: { email: data.email },
        });
      }
    } catch (err) {
      logMobileAction("auth.signUp", "failure", {
        email: data.email,
        error: err instanceof Error ? err.message : String(err),
      });
      console.log("Unexpected sign up error:", err);
      form.setError("root", {
        message:
          err instanceof AuthRequestTimeoutError
            ? getAuthRequestTimeoutMessage()
            : "An unexpected error occurred",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignInPress = () => {
    router.replace("/(external)/sign-in");
  };

  const isLoading = authLoading || isSubmitting;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
      testID="sign-up-screen"
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
                Create Account
              </Text>
            </CardTitle>
            <Text variant="muted" className="text-center">
              Start tracking your fitness progress today
            </Text>
          </CardHeader>

          <CardContent className="gap-6">
            {/* Form */}
            <Form {...form}>
              <View className="gap-4" testID="sign-up-form">
                {/* Email Input */}
                <FormTextField
                  control={form.control}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  label="Email"
                  name="email"
                  placeholder="m@example.com"
                  testId="email-input"
                />

                {/* Password Input */}
                <FormTextField
                  control={form.control}
                  label="Password"
                  name="password"
                  placeholder="Enter your password"
                  secureTextEntry
                  testId="password-input"
                />

                {/* Password Requirements */}
                <View className="mt-2 gap-1" testID="password-hints">
                  <Text variant="muted" className="text-xs">
                    Password must contain:
                  </Text>
                  <Text variant="muted" className="text-xs">
                    • At least 8 characters
                  </Text>
                  <Text variant="muted" className="text-xs">
                    • One uppercase letter
                  </Text>
                  <Text variant="muted" className="text-xs">
                    • One number
                  </Text>
                </View>

                {/* Repeat Password Input */}
                <FormTextField
                  control={form.control}
                  label="Repeat Password"
                  name="repeatPassword"
                  placeholder="Confirm your password"
                  secureTextEntry
                  testId="repeat-password-input"
                />

                {/* Root Error */}
                {form.formState.errors.root && (
                  <Alert icon={AlertCircle} variant="destructive" testID="form-error">
                    <AlertDescription className="text-center">
                      {form.formState.errors.root.message}
                    </AlertDescription>
                  </Alert>
                )}
              </View>
            </Form>

            {/* Sign Up Button */}
            <Button
              variant="default"
              size="lg"
              onPress={form.handleSubmit(onSignUp)}
              disabled={isLoading}
              testID="sign-up-button"
              className="w-full"
            >
              <Text>{isLoading ? "Creating Account..." : "Create Account"}</Text>
            </Button>

            <ServerUrlOverride
              expanded={isServerConfigExpanded}
              value={serverUrlInput}
              usingHostedDefault={!serverConfig.overrideUrl}
              onToggle={() => setIsServerConfigExpanded((currentValue) => !currentValue)}
              onChange={setServerUrlInput}
            />

            {/* Sign In Link */}
            <View className="border-t border-border pt-4">
              <Button
                variant="outline"
                onPress={handleSignInPress}
                testID="sign-in-link-button"
                className="w-full"
              >
                <Text>Already have an account? Sign in</Text>
              </Button>
            </View>

            {/* Terms */}
            <View className="pt-4" testID="terms-container">
              <Text variant="muted" className="text-center text-xs" testID="terms-text">
                By creating an account, you agree to our{"\n"}Terms of Service and Privacy Policy
              </Text>
            </View>
          </CardContent>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
