import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Form, FormTextField } from "@repo/ui/components/form";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { z } from "zod";
import { supabase } from "@/lib/supabase/client";

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

  const form = useZodForm({
    schema: resetPasswordSchema,
    defaultValues: {
      confirmPassword: "",
      password: "",
    },
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
  }, [access_token, refresh_token, router]);

  const onUpdatePassword = async (data: ResetPasswordFields) => {
    if (!sessionSet) {
      form.setError("root", {
        message: "Session not ready. Please try again.",
      });
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
        form.setError("root", { message: error.message });
        return;
      }

      console.log("✅ Password updated successfully");

      // Force sign-out for security
      await supabase.auth.signOut();

      Alert.alert(
        "Password Updated",
        "Your password has been changed. Please sign in with your new credentials.",
        [{ text: "OK", onPress: () => router.replace("/(external)/sign-in") }],
      );
    } catch (err) {
      console.error("💥 Unexpected password update error:", err);
      form.setError("root", { message: "An unexpected error occurred" });
    } finally {
      setIsLoading(false);
    }
  };

  const submitForm = useZodFormSubmit({
    form,
    onSubmit: onUpdatePassword,
  });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
      testID="reset-password-screen"
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
                Set New Password
              </Text>
            </CardTitle>
            <Text variant="muted" className="text-center">
              Please enter your new password below
            </Text>
          </CardHeader>

          <CardContent className="gap-6">
            {/* Form */}
            <Form {...form}>
              <View className="gap-4" testID="reset-password-form">
                {/* Password Input */}
                <FormTextField
                  control={form.control}
                  label="New Password"
                  name="password"
                  placeholder="Enter new password"
                  secureTextEntry
                  testId="password-input"
                />

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

                {/* Confirm Password Input */}
                <FormTextField
                  control={form.control}
                  label="Confirm Password"
                  name="confirmPassword"
                  placeholder="Confirm new password"
                  secureTextEntry
                  testId="confirm-password-input"
                />

                {/* Root Error */}
                {form.formState.errors.root && (
                  <View
                    className="bg-destructive/15 p-3 rounded-md border border-destructive/25"
                    testID="form-error"
                  >
                    <Text variant="small" className="text-destructive text-center">
                      {form.formState.errors.root.message}
                    </Text>
                  </View>
                )}
              </View>
            </Form>

            {/* Update Password Button */}
            <Button
              variant="default"
              size="lg"
              onPress={submitForm.handleSubmit}
              disabled={isLoading || !sessionSet}
              testID="update-password-button"
              className="w-full"
            >
              <Text>{isLoading ? "Updating Password..." : "Update Password"}</Text>
            </Button>

            {/* Help Text */}
            <View className="pt-4" testID="help-container">
              <Text variant="muted" className="text-center text-xs">
                After updating your password, you will be automatically signed in
              </Text>
            </View>
          </CardContent>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
