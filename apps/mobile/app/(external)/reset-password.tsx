import { zodResolver } from "@hookform/resolvers/zod";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from "react-native";
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

  const form = useForm<ResetPasswordFields>({
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

      Alert.alert(
        "Success!",
        "Your password has been updated successfully. You are now signed in.",
        [{ text: "OK", onPress: () => router.replace("/") }],
      );
    } catch (err) {
      console.error("💥 Unexpected password update error:", err);
      form.setError("root", { message: "An unexpected error occurred" });
    } finally {
      setIsLoading(false);
    }
  };

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
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter new password"
                          value={field.value}
                          onChangeText={field.onChange}
                          secureTextEntry
                          autoFocus
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

                {/* Confirm Password Input */}
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Confirm new password"
                          value={field.value}
                          onChangeText={field.onChange}
                          secureTextEntry
                          testID="confirm-password-input"
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

            {/* Update Password Button */}
            <Button
              variant="default"
              size="lg"
              onPress={form.handleSubmit(onUpdatePassword)}
              disabled={isLoading || !sessionSet}
              testID="update-password-button"
              className="w-full"
            >
              <Text>
                {isLoading ? "Updating Password..." : "Update Password"}
              </Text>
            </Button>

            {/* Help Text */}
            <View className="pt-4" testID="help-container">
              <Text variant="muted" className="text-center text-xs">
                After updating your password, you will be automatically signed
                in
              </Text>
            </View>
          </CardContent>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
