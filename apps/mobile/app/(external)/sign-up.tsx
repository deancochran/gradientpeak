import { useRouter } from "expo-router";
import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/hooks/useAuth";
import { supabase } from "@/lib/supabase/client";

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
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<SignUpFields>({
    resolver: zodResolver(signUpSchema),
  });

  const onSignUp = async (data: SignUpFields) => {
    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          // For mobile apps, we don't set emailRedirectTo since we can't handle web redirects
          // Instead, users should verify via the app after clicking the email link
          // Or disable email confirmation in development
        },
      });

      if (error) {
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
        // Successfully signed up - show verification message
        console.log("Successfully signed up:", data.email);
        router.push({
          pathname: "/(external)/verify",
          params: { email: data.email },
        });
      }
    } catch (err) {
      console.log("Unexpected sign up error:", err);
      form.setError("root", { message: "An unexpected error occurred" });
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
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="m@example.com"
                          value={field.value}
                          onChangeText={field.onChange}
                          autoFocus
                          autoCapitalize="none"
                          keyboardType="email-address"
                          autoComplete="email"
                          testID="email-input"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Password Input */}
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter your password"
                          value={field.value}
                          onChangeText={field.onChange}
                          secureTextEntry
                          testID="password-input"
                        />
                      </FormControl>
                      <FormMessage />

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
                    </FormItem>
                  )}
                />

                {/* Repeat Password Input */}
                <FormField
                  control={form.control}
                  name="repeatPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Repeat Password</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Confirm your password"
                          value={field.value}
                          onChangeText={field.onChange}
                          secureTextEntry
                          testID="repeat-password-input"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Root Error */}
                {form.formState.errors.root && (
                  <View
                    className="bg-destructive/15 p-3 rounded-md border border-destructive/25"
                    testID="form-error"
                  >
                    <Text
                      variant="small"
                      className="text-destructive text-center"
                    >
                      {form.formState.errors.root.message}
                    </Text>
                  </View>
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
