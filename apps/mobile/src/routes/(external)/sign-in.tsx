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

const signInSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z
    .string({ message: "Password is required" })
    .min(8, "Password must be at least 8 characters"),
});

type SignInFields = z.infer<typeof signInSchema>;

const mapSupabaseErrorToFormField = (error: string) => {
  if (error.includes("email") || error.includes("Email")) {
    return "email";
  }
  if (error.includes("password") || error.includes("Password")) {
    return "password";
  }
  return "root";
};

export default function SignInScreen() {
  const router = useRouter();
  const { isLoading: authLoading, signIn } = useAuth();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SignInFields>({
    resolver: zodResolver(signInSchema),
  });

  const onSignIn = async (data: SignInFields) => {
    setIsSubmitting(true);
    try {
      const { error } = await signIn(data.email, data.password);

      if (error) {
        console.log("Sign in error:", error);

        // Handle specific Supabase auth errors
        if (error.message?.includes("Invalid login credentials")) {
          setError("root", {
            message: "Invalid email or password. Please try again.",
          });
        } else if (error.message?.includes("Email not confirmed")) {
          setError("root", {
            message:
              "Please verify your email address before signing in. Check your email for a verification link.",
          });
        } else if (error.message?.includes("Too many requests")) {
          setError("root", {
            message: "Too many login attempts. Please try again later.",
          });
        } else {
          const fieldName = mapSupabaseErrorToFormField(error.message || "");
          setError(fieldName, {
            message: error.message || "An unexpected error occurred",
          });
        }
      } else {
        console.log("Successfully signed in");
      }
    } catch (err) {
      console.log("Unexpected sign in error:", err);
      setError("root", { message: "An unexpected error occurred" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUpPress = () => {
    router.replace("/(external)/sign-up");
  };

  const handleForgotPasswordPress = () => {
    router.push("/(external)/forgot-password");
  };

  const isLoading = authLoading || isSubmitting;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
      testID="sign-in-screen"
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
                Welcome Back
              </Text>
            </CardTitle>
            <Text variant="muted" className="text-center">
              Sign in to continue your fitness journey
            </Text>
          </CardHeader>

          <CardContent className="gap-6">
            {/* Form */}
            <View className="gap-4" testID="sign-in-form">
              {/* Email Input */}
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

              {/* Password Input */}
              <View className="gap-2">
                <Label nativeID="password-label">Password</Label>
                <Controller
                  control={control}
                  name="password"
                  render={({ field: { onChange, value } }) => (
                    <Input
                      placeholder="Password"
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
              </View>

              {/* Root Error */}
              {errors.root && (
                <View
                  className="bg-destructive/15 p-3 rounded-md border border-destructive/25"
                  testID="root-error-container"
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

            {/* Sign In Button */}
            <Button
              variant="default"
              size="lg"
              onPress={handleSubmit(onSignIn)}
              disabled={isLoading}
              testID="sign-in-button"
              className="w-full"
            >
              <Text>{isLoading ? "Signing In..." : "Sign In"}</Text>
            </Button>

            {/* Forgot Password Link */}
            <Button
              variant="link"
              onPress={handleForgotPasswordPress}
              testID="forgot-password-button"
              className="w-full"
            >
              <Text className="text-muted-foreground">
                Forgot your password?
              </Text>
            </Button>

            {/* Sign Up Link */}
            <View className="border-t border-border pt-4">
              <Button
                variant="outline"
                onPress={handleSignUpPress}
                testID="sign-up-link-button"
                className="w-full"
              >
                <Text>Don't have an account? Sign up</Text>
              </Button>
            </View>
          </CardContent>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
