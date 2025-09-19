import { useRouter } from "expo-router";
import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/hooks/useAuth";
import { trpc } from "@/lib/trpc";

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

const mapSupabaseErrorToFormField = (error: string) => {
  if (error.includes("email") || error.includes("Email")) {
    return "email";
  }
  if (error.includes("password") || error.includes("Password")) {
    return "password";
  }
  return "root";
};

export default function SignUpScreen() {
  const router = useRouter();
  const { loading: authLoading } = useAuth();
  const signUpMutation = trpc.auth.signUp.useMutation();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SignUpFields>({
    resolver: zodResolver(signUpSchema),
  });

  const onSignUp = async (data: SignUpFields) => {
    setIsSubmitting(true);
    try {
      await signUpMutation.mutateAsync({
        email: data.email,
        password: data.password,
      });

      if (signUpMutation.error) {
        console.log("Sign up error:", signUpMutation.error);

        // Handle specific auth errors
        if (signUpMutation.error.message?.includes("User already registered")) {
          setError("email", {
            message: "An account with this email already exists",
          });
        } else if (
          signUpMutation.error.message?.includes("Password should be")
        ) {
          setError("password", {
            message: signUpMutation.error.message,
          });
        } else if (
          signUpMutation.error.message?.includes("Unable to validate email")
        ) {
          setError("email", {
            message: "Please enter a valid email address",
          });
        } else {
          const fieldName = mapSupabaseErrorToFormField(
            signUpMutation.error.message || "",
          );
          setError(fieldName, {
            message:
              signUpMutation.error.message || "An unexpected error occurred",
          });
        }
      } else {
        // Successfully signed up - show verification message
        console.log("Successfully signed up:", data.email);
        router.push("/(external)/verify");
      }
    } catch (err) {
      console.log("Unexpected sign up error:", err);
      setError("root", { message: "An unexpected error occurred" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignInPress = () => {
    router.replace("/(external)/sign-in");
  };

  const isLoading = authLoading || isSubmitting || signUpMutation.isPending;

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
            <View className="gap-4" testID="sign-up-form">
              {/* Email Input */}
              <View className="gap-2">
                <Label nativeID="email-label">Email</Label>
                <Controller
                  control={control}
                  name="email"
                  render={({ field: { onChange, value } }) => (
                    <Input
                      placeholder="m@example.com"
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

              {/* Password Input */}
              <View className="gap-2">
                <Label nativeID="password-label">Password</Label>
                <Controller
                  control={control}
                  name="password"
                  render={({ field: { onChange, value } }) => (
                    <Input
                      placeholder="Enter your password"
                      value={value}
                      onChangeText={onChange}
                      secureTextEntry
                      className={errors.password ? "border-destructive" : ""}
                      testID="password-input"
                      aria-labelledby="password-label"
                    />
                  )}
                />
                {errors.password && (
                  <Text variant="small" className="text-destructive">
                    {errors.password.message}
                  </Text>
                )}

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
              </View>

              {/* Repeat Password Input */}
              <View className="gap-2">
                <Label nativeID="repeat-password-label">Repeat Password</Label>
                <Controller
                  control={control}
                  name="repeatPassword"
                  render={({ field: { onChange, value } }) => (
                    <Input
                      placeholder="Confirm your password"
                      value={value}
                      onChangeText={onChange}
                      secureTextEntry
                      className={
                        errors.repeatPassword ? "border-destructive" : ""
                      }
                      testID="repeat-password-input"
                      aria-labelledby="repeat-password-label"
                    />
                  )}
                />
                {errors.repeatPassword && (
                  <Text variant="small" className="text-destructive">
                    {errors.repeatPassword.message}
                  </Text>
                )}
              </View>

              {/* Root Error */}
              {errors.root && (
                <View
                  className="bg-destructive/15 p-3 rounded-md border border-destructive/25"
                  testID="form-error"
                >
                  <Text
                    variant="small"
                    className="text-destructive text-center"
                  >
                    {errors.root.message}
                  </Text>
                </View>
              )}
            </View>

            {/* Sign Up Button */}
            <Button
              variant="default"
              size="lg"
              onPress={handleSubmit(onSignUp)}
              disabled={isLoading}
              testID="sign-up-button"
              className="w-full"
            >
              <Text>
                {isLoading ? "Creating Account..." : "Create Account"}
              </Text>
            </Button>

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
              <Text
                variant="muted"
                className="text-center text-xs"
                testID="terms-text"
              >
                By creating an account, you agree to our{"\n"}Terms of Service
                and Privacy Policy
              </Text>
            </View>
          </CardContent>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
