import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
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

const verifySchema = z.object({
  token: z
    .string()
    .length(6, "Code must be 6 digits")
    .regex(/^\d+$/, "Must be numbers only"),
});

type VerifyFields = z.infer<typeof verifySchema>;

export default function VerifyScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const { isEmailVerified } = useAuth();
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  const form = useForm<VerifyFields>({
    resolver: zodResolver(verifySchema),
    defaultValues: {
      token: "",
    },
  });

  // Auto-redirect when email becomes verified (via OTP or external link)
  useEffect(() => {
    if (isEmailVerified) {
      console.log("✅ Email verified, redirecting to app...");
      router.replace("/");
    }
  }, [isEmailVerified, router]);

  // Auto-Polling for external verification (e.g. desktop link click)
  useEffect(() => {
    const interval = setInterval(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user && user.email_confirmed_at) {
        console.log(
          "✅ Email verified via external link, refreshing session...",
        );
        // Refresh session to update the auth store
        // This will trigger the useEffect above via isEmailVerified
        await supabase.auth.refreshSession();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const onVerify = async (data: VerifyFields) => {
    if (!email) {
      form.setError("root", {
        message: "Email not found. Please try signing up again.",
      });
      return;
    }

    setIsVerifying(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: data.token,
        type: "email",
      });

      if (error) {
        console.log("Verify error:", error);
        form.setError("root", { message: error.message });
      } else {
        console.log("✅ Email verified via OTP");
        // verifyOtp automatically updates the session with email_confirmed_at
        // The useEffect above will handle the redirect
      }
    } catch (err) {
      console.log("Unexpected verify error:", err);
      form.setError("root", { message: "An unexpected error occurred" });
    } finally {
      setIsVerifying(false);
    }
  };

  const onResend = async () => {
    if (!email) return;

    setIsResending(true);
    setResendMessage(null);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
      });

      if (error) {
        setResendMessage(error.message || "Failed to resend code");
      } else {
        setResendMessage("Verification code sent!");
      }
    } catch (err) {
      setResendMessage("Failed to resend code");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
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
                Verify Email
              </Text>
            </CardTitle>
            <Text variant="muted" className="text-center">
              Enter the 6-digit code sent to {email || "your email"}
            </Text>
          </CardHeader>

          <CardContent className="gap-6">
            <Form {...form}>
              <View className="gap-4">
                <FormField
                  control={form.control}
                  name="token"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Verification Code</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="123456"
                          value={field.value}
                          onChangeText={field.onChange}
                          keyboardType="number-pad"
                          maxLength={6}
                          className="text-center text-lg tracking-widest"
                          autoFocus
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {form.formState.errors.root && (
                  <View className="bg-destructive/15 p-3 rounded-md border border-destructive/25">
                    <Text className="text-destructive text-center text-sm">
                      {form.formState.errors.root.message}
                    </Text>
                  </View>
                )}

                <Button
                  onPress={form.handleSubmit(onVerify)}
                  disabled={isVerifying}
                  className="w-full"
                  size="lg"
                >
                  <Text>{isVerifying ? "Verifying..." : "Verify"}</Text>
                </Button>
              </View>
            </Form>

            <View className="gap-2 pt-2">
              <Button
                variant="ghost"
                onPress={onResend}
                disabled={isResending}
                className="w-full"
              >
                <Text>{isResending ? "Sending..." : "Resend Code"}</Text>
              </Button>
              {resendMessage && (
                <Text
                  className={`text-center text-xs ${
                    resendMessage.includes("sent")
                      ? "text-success"
                      : "text-destructive"
                  }`}
                >
                  {resendMessage}
                </Text>
              )}
            </View>
          </CardContent>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
